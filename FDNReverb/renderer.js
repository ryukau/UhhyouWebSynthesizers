// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {FeedbackDelayNetwork} from "../common/dsp/fdn.js";
import * as multirate from "../common/dsp/multirate.js";
import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";

import * as menuitems from "./menuitems.js";

onmessage = (event) => {
  const pv = event.data; // Parameter values.

  const upFold = parseInt(menuitems.oversampleItems[pv.overSample]);
  const upRate = upFold * pv.sampleRate;

  let halfband = new multirate.HalfBandIIR();

  let fdn = new FeedbackDelayNetwork(
    pv.matrixSize,
    upRate * pv.maxDelayTime,
  );

  let rng = new PcgRandom(BigInt(pv.seed + pv.channel * 65537));

  const matrixType = menuitems.matrixTypeItems[pv.matrixType];
  fdn.randomizeMatrix(matrixType, Math.floor(rng.number() * (2 ** 32)));

  for (let i = 0; i < fdn.delay.length; ++i) {
    const randTime = pv.timeRandomAmount * rng.number();
    const baseTime = pv.delayTime[i] * pv.timeMultiplier;
    fdn.delay[i].setTime(upRate * (baseTime + randTime));
    fdn.lowpass[i].setCutoff(pv.lowpassCutoffHz[i] / upRate);
    fdn.highpass[i].setCutoff(pv.highpassCutoffHz[i] / upRate);
  }

  let sound = new Array(Math.floor(pv.sampleRate * pv.renderDuration)).fill(0);

  if (upFold == 2) {
    const hb0 = fdn.process(1, pv.feedback);
    const hb1 = fdn.process(0, pv.feedback);
    sound[0] = halfband.processDown(hb0, hb1);
    for (let i = 1; i < sound.length; ++i) {
      const hb0 = fdn.process(0, pv.feedback);
      const hb1 = fdn.process(0, pv.feedback);
      sound[i] = halfband.processDown(hb0, hb1);
    }
  } else {
    sound[0] = 1;
    for (let i = 0; i < sound.length; ++i) sound[i] = fdn.process(sound[i], pv.feedback);
  }

  postMessage({sound: sound});
}
