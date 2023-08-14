// Copyright 2023 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {AdaptiveNotchCPZ} from "../common/dsp/adaptivefilter.js";
import * as delay from "../common/dsp/delay.js";
import * as multirate from "../common/dsp/multirate.js";
import {HP1} from "../common/dsp/onepole.js";
import {SlopeFilter} from "../common/dsp/slopefilter.js";
import {MatchedBiquad} from "../common/dsp/svf.js";
import {
  clamp,
  exponentialMap,
  lerp,
  normalDistributionMap,
  triangleDistributionMap,
  uniformDistributionMap
} from "../common/util.js";
import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";

import * as menuitems from "./menuitems.js";

const exp2Scaler = Math.log(2);

class AdaptiveNotchComb {
  constructor(
    sampleRate, delaySeconds, notchNarrowness, notchStepSizeScale, notchMixGain) {
    this.delay = new delay.IntDelay(sampleRate, delaySeconds);
    this.delay.setTime(sampleRate * delaySeconds);
    this.fbGain = 1;
    this.fbSig = 0;

    this.notch = new AdaptiveNotchCPZ(
      sampleRate, 1 / delaySeconds, notchNarrowness, notchStepSizeScale);
    this.mix = notchMixGain;
  }

  process(input, fbGain) {
    this.fbSig -= this.mix * this.notch.processNormalized(this.fbSig);
    this.fbSig = this.delay.process(input + fbGain * Math.tanh(this.fbSig));
    return this.fbSig;
  }
}

class BrownNoise {
  constructor(sampleRate, highpassCutoffHz) {
    this.value = 0;
    this.highpass = new HP1();
    this.highpass.setCutoff(highpassCutoffHz / sampleRate);
    this.maxStep = 1e-3;
  }

  process(rng) {
    const noise = normalDistributionMap(rng.number(), rng.number(), 0, this.maxStep / 3);
    return this.value = this.highpass.process(this.value + noise);
  }
}

function process(upRate, pv, dsp) {
  let source = dsp.noiseFunc(dsp.rng);
  source = dsp.bandpass.bp(source, pv.bandpassCutoffHz / upRate, 1);

  let sig = source;
  for (let idx = 0; idx < dsp.combs.length; ++idx) {
    sig = dsp.combs[idx].process(sig, 1);
  }

  for (let idx = 0; idx < dsp.notches.length; ++idx) {
    source = sig;
    sig = dsp.notches[idx].process(sig);
    if (dsp.notchInvert) sig = source - sig;
    sig *= 0.5; // Avoid too much gain.
  }

  sig = dsp.highpass.hp(sig, pv.highpassCutoffHz / upRate, Math.SQRT1_2);

  if (pv.toneSlope < 1) sig = dsp.slopeFilter.process(sig);
  return sig;
}

onmessage = async (event) => {
  const pv = event.data; // Parameter values.

  const upFold = parseInt(menuitems.oversampleItems[pv.overSample]);
  const upRate = upFold * pv.sampleRate;

  const stereoSeed = 17;
  const rng = new PcgRandom(BigInt(pv.seed + pv.channel * stereoSeed));

  let dsp = {};
  dsp.rng = rng;
  dsp.slopeFilter = new SlopeFilter(Math.floor(Math.log2(24000 / 1000)));
  dsp.slopeFilter.setCutoff(upRate, 1000, pv.toneSlope, true);

  const distribution = menuitems.noiseDistributionItems[pv.noiseDistribution];
  if (distribution === "Binary") {
    dsp.noiseFunc = (rng) => rng.number() < 0.5 ? -1 : 1;
  } else if (distribution === "Triangle") {
    dsp.noiseFunc = (rng) => triangleDistributionMap(rng.number(), rng.number(), -1, 1);
  } else if (distribution === "Normal") {
    dsp.noiseFunc = (rng) => normalDistributionMap(rng.number(), rng.number(), 0, 1 / 3);
  } else if (distribution === "Random Walk") {
    dsp.brownNoise = new BrownNoise(upRate, 1);
    dsp.noiseFunc = (rng) => dsp.brownNoise.process(rng);
  } else {
    console.error(`Invalid noise distribution. pv.noiseDistribution is set to ${
      pv.noiseDistribution}`);
  }

  dsp.bandpass = new MatchedBiquad();

  dsp.combs = [];
  let combLatency = 0; // Probably this isn't very accurate.
  for (let idx = 0; idx < pv.combCount; ++idx) {
    const freqSpread = lerp(1, 1 + idx, pv.combFrequencySpread);
    const freqRandom = Math.exp(rng.number() * exp2Scaler * pv.combRandomOctave);
    const delayHz = pv.combBaseHz * freqSpread * freqRandom;
    combLatency += upRate / delayHz;
    dsp.combs.push(new AdaptiveNotchComb(
      upRate, 1 / delayHz, pv.notchNarrowness, pv.notchStepSizeScale, pv.combNotchMix));
  }
  combLatency = Math.floor(combLatency) - pv.combCount;

  dsp.notches = [];
  for (let idx = 0; idx < pv.notchCount; ++idx) {
    dsp.notches.push(
      new AdaptiveNotchCPZ(upRate, 10, pv.notchNarrowness, pv.notchStepSizeScale));
  }
  dsp.notchInvert = pv.notchInvert === 1;

  dsp.highpass = new MatchedBiquad();

  // Discard latency.
  for (let i = 0; i < combLatency; ++i) process(upRate, pv, dsp);

  // Process.
  let sound = new Array(Math.floor(upRate * pv.renderDuration)).fill(0);
  for (let i = 0; i < sound.length; ++i) sound[i] = process(upRate, pv, dsp);

  // Down-sampling.
  if (upFold == 64) {
    let decimationLowpass = new multirate.SosFilter(multirate.sos64FoldFirstStage);
    let halfband = new multirate.HalfBandIIR();
    let frame = [0, 0];
    for (let i = 0; i < sound.length; ++i) {
      for (let j = 0; j < 2; ++j) {
        for (let k = 0; k < 32; ++k) decimationLowpass.push(sound[64 * i + 32 * j + k]);
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
        for (let k = 0; k < 8; ++k) decimationLowpass.push(sound[16 * i + 8 * j + k]);
        frame[j] = decimationLowpass.output();
      }
      sound[i] = halfband.process(frame[0], frame[1]);
    }
  } else if (upFold == 2) {
    let halfband = new multirate.HalfBandIIR();
    for (let i = 0; i < sound.length; ++i) {
      const hb0 = sound[2 * i];
      const hb1 = sound[2 * i + 1];
      sound[i] = halfband.process(hb0, hb1);
    }
  }
  if (upFold > 1) sound = sound.slice(0, Math.floor(pv.sampleRate * pv.renderDuration));

  // Post effect.
  let gainEnv = 1;
  let decay = Math.pow(pv.decayTo, 1.0 / sound.length);
  for (let i = 0; i < sound.length; ++i) {
    sound[i] *= gainEnv;
    gainEnv *= decay;
  }

  postMessage(sound);
}
