// Copyright 2022 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import * as multirate from "../common/dsp/multirate.js";
import * as util from "../common/util.js";
import BasicLimiter from "../common/wasm/basiclimiter.js";
import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";

import {CollidingWave1DWireWire} from "./localdsp.js";
import * as menuitems from "./menuitems.js";

function process(upRate, pv, dsp) {
  let sig = 0;
  for (let i = 0; i < pv.nSystem; ++i) {
    dsp.wave[i].step();
    sig += dsp.mix0 * dsp.wave[i].w0.getDisplacement()[dsp.pickUpIndex[i]]
      + dsp.mix1 * dsp.wave[i].w1.getDisplacement()[dsp.pickUpIndex[i]];
  }
  return pv.limiterActive === 0 ? sig : dsp.limiter.process(sig, Math.abs(sig));
}

onmessage = async (event) => {
  const basiclimiter = await BasicLimiter();
  const pv = event.data; // Parameter values.

  const upFold = parseInt(menuitems.oversampleItems[pv.overSample]);
  const upRate = upFold * pv.sampleRate;
  let sound = new Array(Math.floor(pv.sampleRate * pv.renderDuration));

  const toIndex = (length, ratio) => Math.min(Math.floor(length * ratio), length - 1);
  const getRandomRangeFunc = (ratio, range) => {
    const upper = Math.min(1, ratio + range);
    const lower = Math.max(0, ratio - range);
    return (rng) => util.uniformDistributionMap(rng.number(), lower, upper);
  };
  const slightRandomize
    = () => 2 ** util.uniformDistributionMap(dsp.rng.number(), -0.1, 0.1);

  let dsp = {
    rng: new PcgRandom(BigInt(pv.seed + pv.channel * 65537)),
    wave: [],
    pickUpIndex: [],

    mix0: pv.wireMix,
    mix1: pv.wireMix >= 0 ? 1 - pv.wireMix : 1 + pv.wireMix,

    limiter: new basiclimiter.Limiter(),
  };

  pv.nNode = Math.ceil(pv.nNode);

  // Wave simulation setup.
  const pickUpPositionFunc = getRandomRangeFunc(pv.pickUpPoint, pv.pickUpRandomRange);
  const pullUpPositionFunc = getRandomRangeFunc(pv.pullUpPoint, pv.pullUpRandomRange);
  for (let n = 0; n < pv.nSystem; ++n) {
    dsp.wave.push(new CollidingWave1DWireWire(
      pv.nNode,
      pv.damping0 * slightRandomize(),
      pv.damping1 * slightRandomize(),
      pv.waveSpeed0 * slightRandomize(),
      pv.waveSpeed1 * slightRandomize(),
      1 / upRate,
      pv.lengthMeter / pv.nNode,
      pv.restitution0,
      pv.restitution1,
      pv.wireDistance * slightRandomize(),
      ));

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
  if (upFold == 64) {
    let decimationLowpass = new multirate.SosFilter(multirate.sos64FoldFirstStage);
    let halfband = new multirate.HalfBandIIR();
    let frame = [0, 0];
    for (let i = 0; i < sound.length; ++i) {
      for (let j = 0; j < 2; ++j) {
        for (let k = 0; k < 32; ++k) decimationLowpass.push(process(upRate, pv, dsp));
        frame[j] = decimationLowpass.output();
      }
      sound[i] = halfband.process(frame[0], frame[1]);
    }
  } else if (upFold == 16) {
    let decimationLowpass = new multirate.SosFilter(multirate.sos16FoldFirstStage);
    let halfband = new multirate.HalfBandIIR();
    let frame = [0, 0];
    for (let i = 0; i < sound.length; ++i) {
      for (let j = 0; j < 2; ++j) {
        for (let k = 0; k < 8; ++k) decimationLowpass.push(process(upRate, pv, dsp));
        frame[j] = decimationLowpass.output();
      }
      sound[i] = halfband.process(frame[0], frame[1]);
    }
  } else if (upFold == 2) {
    let halfband = new multirate.HalfBandIIR();
    for (let i = 0; i < sound.length; ++i) {
      const hb0 = process(upRate, pv, dsp);
      const hb1 = process(upRate, pv, dsp);
      sound[i] = halfband.process(hb0, hb1);
    }
  } else {
    for (let i = 0; i < sound.length; ++i) sound[i] = process(upRate, pv, dsp);
  }

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
