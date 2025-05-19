// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {AdaptiveNotchAM, AdaptiveNotchCPZ} from "../common/dsp/adaptivefilter.js";
import * as delay from "../common/dsp/delay.js";
import {downSampleIIR} from "../common/dsp/multirate.js";
import {HP1} from "../common/dsp/onepole.js";
import {SlopeFilter} from "../common/dsp/slopefilter.js";
import {MatchedBiquad} from "../common/dsp/svf.js";
import {lerp, normalDistributionMap, triangleDistributionMap} from "../common/util.js";
import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";

import * as menuitems from "./menuitems.js";

const exp2Scaler = Math.log(2);

class AdaptiveNotchComb {
  constructor(
    sampleRate,
    delaySeconds,
    notchNarrowness,
    notchStepSizeScale,
    notchMixGain,
    adaptiveNotchType = AdaptiveNotchCPZ) {
    this.delay = new delay.IntDelay(sampleRate * delaySeconds);
    this.delay.setTime(sampleRate * delaySeconds);
    this.fbGain = 1;
    this.fbSig = 0;

    this.notch = new adaptiveNotchType(
      sampleRate, 1 / delaySeconds, notchNarrowness, notchStepSizeScale);
    this.mix = notchMixGain;
  }

  process(input, fbGain) {
    this.fbSig = this.notch.processNormalized(this.fbSig) - this.mix * this.fbSig;
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
    sig = pv.combCascadeGain * dsp.combs[idx].process(sig, 1);
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
  const getAdaptiveNotchType = (adaptiveNotchIndex) => {
    const notchType = menuitems.adaptiveNotchTypeItems[adaptiveNotchIndex];
    if (notchType === "AM") return AdaptiveNotchAM;
    return AdaptiveNotchCPZ;
  };
  for (let idx = 0; idx < pv.combCount; ++idx) {
    const freqSpread = lerp(1, 1 + idx, pv.combFrequencySpread);
    const freqRandom = Math.exp(rng.number() * exp2Scaler * pv.combRandomOctave);
    const delayHz = pv.combBaseHz * freqSpread * freqRandom;
    combLatency += upRate / delayHz;
    dsp.combs.push(new AdaptiveNotchComb(
      upRate, 1 / delayHz, pv.notchNarrowness, pv.notchStepSizeScale, pv.combNotchMix,
      getAdaptiveNotchType(pv.adaptiveNotchType)));
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
  let sound = new Array(Math.floor(upRate * pv.renderDuration) + 1).fill(0);
  for (let i = 0; i < sound.length; ++i) sound[i] = process(upRate, pv, dsp);
  sound = downSampleIIR(sound, upFold);

  // Cross-fade.
  if (pv.crossFade === 1 && sound.length >= 2) {
    let src = structuredClone(sound);
    for (let i = 0; i < src.length; ++i) {
      src[i] *= 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (src.length - 1));
    }

    const mid = Math.floor(src.length / 2);
    for (let i = 0; i < src.length; ++i) sound[i] = src[i];
    for (let i = 0; i < mid; ++i) sound[i] += src[i + mid];
    for (let i = mid; i < src.length; ++i) sound[i] += src[i - mid + 1];
  }

  // Post effect.
  let gainEnv = 1;
  let decay = Math.pow(pv.decayTo, 1.0 / sound.length);
  for (let i = 0; i < sound.length; ++i) {
    sound[i] *= gainEnv;
    gainEnv *= decay;
  }

  postMessage({sound: sound});
}
