// Copyright 2022 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {downSampleIIR} from "../common/dsp/multirate.js";
import * as util from "../common/util.js";
import BasicLimiter from "../common/wasm/basiclimiter.js";
import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";

import {CollidingWave1DWallWire, Wave1DDampedCentralFD} from "./localdsp.js";
import * as menuitems from "./menuitems.js";

function process(upRate, pv, dsp) {
  let sig = 0;
  for (let i = 0; i < pv.nWire; ++i) {
    const displacement = dsp.wave[i].getDisplacement();

    let fbL = 0;
    let fbR = 0;
    for (let j = 0; j < pv.nWire; ++j) {
      if (j === i) continue;
      fbL += dsp.feedbackL[j];
      fbR += dsp.feedbackR[j];
    }

    const iL = 1;
    const iR = displacement.length - 2;

    displacement[iL] -= dsp.feedbackAmount * fbL;
    displacement[iR] -= dsp.feedbackAmount * fbR;

    dsp.wave[i].step();

    sig += displacement[dsp.pickUpIndex[i]];
    // sig += displacement.reduce((p, c) => p + c, 0);
    dsp.feedbackL[i] = displacement[iL];
    dsp.feedbackR[i] = displacement[iR];
  }
  dsp.feedback = sig;
  return pv.limiterActive === 0 ? sig : dsp.limiter.process(sig, Math.abs(sig));
}

onmessage = async (event) => {
  const basiclimiter = await BasicLimiter();
  const pv = event.data; // Parameter values.

  const upFold = parseInt(menuitems.oversampleItems[pv.overSample]);
  const upRate = upFold * pv.sampleRate;

  const toIndex = (length, ratio) => Math.min(Math.floor(length * ratio), length - 1);
  const getRandomRangeFunc = (ratio, range) => {
    const upper = Math.min(1, ratio + range);
    const lower = Math.max(0, ratio - range);
    return (rng) => util.uniformDistributionMap(rng.number(), lower, upper);
  };

  let dsp = {
    rng: new PcgRandom(BigInt(pv.seed + pv.channel * 65537)),
    wave: [],
    pickUpIndex: [],

    feedbackAmount: pv.feedback / pv.nWire - Number.EPSILON,
    feedbackL: new Array(pv.nWire).fill(0),
    feedbackR: new Array(pv.nWire).fill(0),

    limiter: new basiclimiter.Limiter(),
  };

  // Wave simulation setup.
  const pickUpPositionFunc = getRandomRangeFunc(pv.pickUpPoint, pv.pickUpRandomRange);
  const pullUpPositionFunc = getRandomRangeFunc(pv.pullUpPoint, pv.pullUpRandomRange);
  for (let n = 0; n < pv.nWire; ++n) {
    dsp.wave.push(new CollidingWave1DWallWire(
      pv.nNode, pv.damping, pv.waveSpeed, 1 / upRate, pv.lengthMeter / pv.nNode,
      pv.wallDistance, pv.restitution));

    dsp.pickUpIndex.push(toIndex(pv.nNode, pickUpPositionFunc(dsp.rng)));

    const wd = dsp.wave[n].getDisplacement();
    const pullUpWidth = Math.max(1, Math.ceil(pv.pullUpWidth * wd.length));
    const wPeak = toIndex(wd.length, pullUpPositionFunc(dsp.rng));
    const lower = Math.max(1, wPeak - pullUpWidth);
    const upper = Math.min(wd.length - 1, wPeak + pullUpWidth);
    for (let i = lower; i < upper - 1; ++i) {
      wd[i] = i < wPeak ? pv.pullUpDistance * (i - lower) / (wPeak - lower)
                        : pv.pullUpDistance * (upper - i) / (upper - wPeak);
    }
  }

  // Limiter setup.
  dsp.limiter.resize(Math.ceil(0.01 * upRate));
  dsp.limiter.prepare(upRate, 0.001, 0.0001, 0, pv.limiterThreshold, 0);
  const latency = upFold * dsp.limiter.latency(upFold);
  if (pv.limiterActive === 1) {
    for (let i = 0; i < latency; ++i) process(upRate, pv, dsp);
  }

  // Process.
  let sound = new Array(Math.floor(upRate * pv.renderDuration)).fill(0);
  for (let i = 0; i < sound.length; ++i) sound[i] = process(upRate, pv, dsp);
  sound = downSampleIIR(sound, upFold);

  // Delete wasm instance.
  dsp.limiter.delete();

  // Post effect.
  let gainEnv = 1;
  let decay = Math.pow(pv.decayTo, 1.0 / sound.length);
  for (let i = 0; i < sound.length; ++i) {
    sound[i] *= gainEnv;
    gainEnv *= decay;
  }

  postMessage({sound: sound});
}
