// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {Delay, IntDelay, LongAllpass} from "../common/dsp/delay.js";
import {downSampleIIR} from "../common/dsp/multirate.js";
import {exponentialMap, uniformDistributionMap} from "../common/util.js";
import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";

import * as menuitems from "./menuitems.js";

class LoopSection {
  constructor(nAllpass, timeInSample, feed, feedback, delayType) {
    this.feedback = feedback;
    this.allpass = new Array(nAllpass);
    for (let i = 0; i < nAllpass; ++i) {
      this.allpass[i] = new LongAllpass(timeInSample[i], delayType);
      this.allpass[i].prepare(timeInSample[i], feed[i]);
    }
  }

  process(input) {
    for (let i = 0; i < this.allpass.length; ++i) input = this.allpass[i].process(input);
    return this.feedback * input;
  }
}

function process(upFold, pv, dsp) {
  let sig = dsp.imputlse;
  dsp.imputlse = 0;

  let sum = 0;
  for (let i = 0; i < dsp.sections.length; ++i) {
    dsp.sectionOut = dsp.sections[i].process(sig + dsp.sectionOut);
    sum += pv.sumGain[i] * dsp.sectionOut;
  }
  return sum;
}

onmessage = (event) => {
  const pv = event.data; // Parameter values.

  const upFold = parseInt(menuitems.oversampleItems[pv.overSample]);
  const upRate = upFold * pv.sampleRate;

  let dsp = {
    rng: new PcgRandom(BigInt(pv.seed + pv.channel * 65537)),
    imputlse: 1,
    sectionOut: 0,
  };

  dsp.sections = new Array(pv.nSection);
  let timeInSample = new Array(dsp.sections.length);
  let feed = new Array(dsp.sections.length);
  const randomDelayMin = Math.max(1 - pv.randomDelayTime, Number.EPSILON);
  const randomFeedMin = 1 - pv.randomFeed;
  const delayType = pv.delayInterpolation === 0 ? IntDelay : Delay;
  for (let idx = 0; idx < dsp.sections.length; ++idx) {
    for (let jdx = 0; jdx < pv.nAllpass; ++jdx) {
      const serialIndex = idx + jdx * pv.nSection;
      timeInSample[jdx] = pv.timeMultiplier * upRate * pv.delayTime[serialIndex]
        * exponentialMap(dsp.rng.number(), randomDelayMin, 1);
      feed[jdx] = pv.feed[serialIndex]
        * uniformDistributionMap(dsp.rng.number(), randomFeedMin, 1);
    }
    dsp.sections[idx]
      = new LoopSection(pv.nAllpass, timeInSample, feed, pv.feedback, delayType);
  }

  let sound = new Array(Math.floor(upRate * pv.renderDuration)).fill(0);
  for (let i = 0; i < sound.length; ++i) sound[i] = process(upRate, pv, dsp);
  sound = downSampleIIR(sound, upFold);

  postMessage({sound: sound});
}
