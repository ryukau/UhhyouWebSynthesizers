// Copyright 2023 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import * as delay from "../common/dsp/delay.js";
import {randomSpecialOrthogonal} from "../common/dsp/fdn.js"
import {downSampleIIR} from "../common/dsp/multirate.js";
import {AP1, HP1, LP1} from "../common/dsp/onepole.js"
import {SlopeFilter} from "../common/dsp/slopefilter.js";
import {RateLimiter} from "../common/dsp/smoother.js";
import {SVF, SVFHighShelf} from "../common/dsp/svf.js";
import {
  dbToAmp,
  exponentialMap,
  normalDistributionMap,
  uniformDistributionMap
} from "../common/util.js";
import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";

import * as menuitems from "./menuitems.js";

class BandedNoise {
  constructor(
    sampleRate, rng, initialGain, durationSeconds, decaySeconds, band1Hz, band2Hz) {
    this.envRandom = rng => exponentialMap(rng.number(), 1 / 8, 8);
    this.baseTime = sampleRate * decaySeconds;
    this.envCounter = 0;
    this.envSamples = Math.floor(this.baseTime * this.envRandom(rng));
    this.envelope = 1;
    this.envDecay = Math.pow(Number.EPSILON, 1 / this.baseTime);
    this.envLp = new LP1(0.475);

    this.gain = 0.5 * initialGain;
    this.decay = Math.pow(Number.EPSILON, 1 / (sampleRate * durationSeconds));

    this.bandpass = new SVF(band1Hz / sampleRate, 3);
    this.highpass = new SVF(band2Hz / sampleRate, Math.SQRT1_2);
  }

  process(rng) {
    const env = this.envLp.process(this.gain * this.envelope);
    this.gain *= this.decay;
    if (this.envCounter >= this.envSamples) {
      this.envCounter = 0;
      this.envSamples = Math.floor(this.baseTime * this.envRandom(rng));
      this.envelope = 1;
      this.envDecay = Math.pow(Number.EPSILON, 1 / (this.baseTime * this.envRandom(rng)));
    } else {
      this.envelope *= this.envDecay;
      ++this.envCounter;
    }

    let sig = env * normalDistributionMap(rng.number(), rng.number(), 0, 1 / 3);
    return this.bandpass.bp(sig) + this.highpass.hp(sig);
  }
}

class FDN {
  // `delaySeconds` is array.
  // `lowpassCutoff` is array of normalized frequency (Hz / sampleRate).
  constructor(
    size,
    sampleRate,
    maxSecond,
    delayMod,
    allpass1Cut,
    allpass2Cut,
    allpassMod,
    modDecaySeconds,
    feedbackDecaySeconds,
    modReductionThreshold,
    modResumeRate,
    enableClipper,
    clipperScale,
    delaySeconds,
    lowpassCutoff) {
    const create2dArray = (x, y) => {
      let a = new Array(x);
      for (let i = 0; i < a.length; ++i) a[i] = new Array(y).fill(0);
      return a;
    };

    this.matrix = create2dArray(size, size);
    this.buf = create2dArray(2, size);
    this.bufIndex = 0;

    this.delayMod = delayMod;
    this.allpassMod = allpassMod;
    this.allpassModDecay = modDecaySeconds >= 1
      ? 1
      : Math.pow(Number.EPSILON, 1 / (modDecaySeconds * sampleRate));
    this.feedbackDecay
      = Math.pow(Number.EPSILON, 1 / (feedbackDecaySeconds * sampleRate));
    this.modReductionThreshold = modReductionThreshold;
    this.modResumeRate = modResumeRate;
    this.enableClipper = enableClipper;
    this.clipperScale = clipperScale;

    this.feedback = new Array(size).fill(1);
    this.delaySamples = new Array(size);
    this.delayTimeSmoother = new Array(size);
    this.delay = new Array(size);
    this.lowpass = new Array(size);
    this.highpass = new Array(size);
    this.apCut1 = new Array(size);
    this.apCut2 = new Array(size);
    this.allpass1 = new Array(size);
    this.allpass2 = new Array(size);
    for (let i = 0; i < size; ++i) {
      this.delay[i] = new delay.Delay(sampleRate, maxSecond);
      this.delaySamples[i] = delaySeconds[i] * sampleRate;
      this.delayTimeSmoother[i] = new RateLimiter(0.1, this.delaySamples[i]);
      this.delay[i].setTime(this.delaySamples[i]);
      this.lowpass[i] = new SVFHighShelf(lowpassCutoff[i], Math.SQRT1_2, dbToAmp(-0.5));
      this.highpass[i] = new HP1(100 / sampleRate);
      this.apCut1[i] = lowpassCutoff[i] * 2 ** allpass1Cut;
      this.allpass1[i] = new AP1(this.apCut1[i]);
      this.apCut2[i] = lowpassCutoff[i] * 2 ** allpass2Cut;
      this.allpass2[i] = new AP1(this.apCut2[i]);
    }
  }

  randomizeMatrix(seed) { randomSpecialOrthogonal(this.matrix, seed); }

  process(input) {
    this.bufIndex ^= 1;
    let front = this.buf[this.bufIndex];
    let back = this.buf[this.bufIndex ^ 1];
    front.fill(0);
    for (let i = 0; i < front.length; ++i) {
      for (let j = 0; j < front.length; ++j) front[i] += this.matrix[i][j] * back[j];
    }

    const threshold = 1;
    for (let i = 0; i < front.length; ++i) {
      front[i] = input + this.feedback[i] * front[i];

      this.delay[i].setTime(this.delayTimeSmoother[i].process(
        this.delaySamples[i] * Math.exp(this.delayMod * front[i])));
      front[i] = this.delay[i].process(front[i]);

      front[i] = this.lowpass[i].process(front[i]);

      if (this.enableClipper) {
        front[i] = Math.tanh(this.clipperScale * front[i]) / this.clipperScale;
      }

      front[i] = this.highpass[i].process(front[i]);

      this.allpass1[i].setCutoff(this.apCut1[i] * Math.exp(this.allpassMod * front[i]));
      front[i] = this.allpass1[i].process(front[i]);
      this.allpass2[i].setCutoff(this.apCut2[i] * Math.exp(this.allpassMod * front[i]));
      front[i] = this.allpass2[i].process(front[i]);

      const absed = Math.abs(front[i]);
      if (absed > 100 * this.modReductionThreshold) {
        this.feedback[i] = 1e-5;
      } else if (absed > this.modReductionThreshold) {
        this.feedback[i] = this.feedback[i] * this.feedbackDecay;
        this.allpassMod *= this.allpassModDecay;
      } else {
        this.feedback[i] = Math.min(this.feedback[i] * this.modResumeRate, 1);
      }
    }

    return front.reduce((sum, val) => sum + val, 0);
  }
}

function process(upRate, pv, dsp) {
  let sig = dsp.impulse + dsp.noise.process(dsp.rng);
  dsp.impulse = 0;

  sig = dsp.impulseLowpass.process(sig);
  sig = dsp.impulseHighpass.process(sig);

  let sum = 0;
  for (let idx = 0; idx < dsp.fdn.length; ++idx) {
    sum += dsp.fdn[idx].process(sig + sum / (idx + 1));
  }
  sig = sum;

  if (pv.dcHighpassHz > 0) sig = dsp.dcHighpass.hp(sig);
  if (pv.toneSlope < 1) sig = dsp.slopeFilter.process(sig);
  return sig;
}

onmessage = async (event) => {
  const pv = event.data; // Parameter values.

  const upFold = parseInt(menuitems.oversampleItems[pv.overSample]);
  const upRate = upFold * pv.sampleRate;
  const rng = new PcgRandom(BigInt(pv.seed + pv.channel * 65537));

  let dsp = {
    rng: rng,

    impulse: pv.impulseGain,
    noise: new BandedNoise(
      upRate, rng, pv.noiseGain, pv.noiseDuration, pv.noiseDecaySeconds, pv.noiseBand1Hz,
      pv.noiseBand2Hz),
    impulseLowpass: new LP1(pv.impulseLowpassHz / upRate),
    impulseHighpass: new HP1(pv.impulseHighpassHz / upRate),

    fdn: [],
    pluck: [],

    dcHighpass: new SVF(pv.dcHighpassHz / upRate, Math.SQRT1_2),
    slopeFilter: new SlopeFilter(Math.floor(Math.log2(24000 / 1000))),
  };
  dsp.slopeFilter.setCutoff(upRate, 1000, pv.toneSlope, true);

  const fdnMaxSeconds = 4 / pv.maxDelayHz;
  const fdnSize = 4;
  let fdnDelaySeconds = new Array(fdnSize).fill(0);
  let fdnLowpassCutoff = new Array(fdnSize).fill(0);

  for (let idx = 0; idx < pv.fdnCount; ++idx) {
    for (let j = 0; j < fdnSize; ++j) {
      fdnDelaySeconds[j]
        = 1 / exponentialMap(dsp.rng.number(), pv.minDelayHz, pv.maxDelayHz);
      fdnLowpassCutoff[j]
        = exponentialMap(dsp.rng.number(), pv.lowpassHz / 2, pv.lowpassHz * 2) / upRate;
    }
    let fdn = new FDN(
      fdnSize, upRate, fdnMaxSeconds, pv.delayMod, pv.allpass1Cut, pv.allpass2Cut,
      pv.allpassMod, pv.modDecaySeconds, pv.feedbackDecaySeconds,
      pv.modReductionThreshold, Math.pow(1 + pv.modResumeRate, 1 / upFold),
      pv.enableClipper, pv.clipperScale, fdnDelaySeconds, fdnLowpassCutoff);
    fdn.randomizeMatrix(
      Math.floor(uniformDistributionMap(rng.number(), 0, Number.MAX_SAFE_INTEGER)));
    dsp.fdn.push(fdn);
  }

  // Process.
  let sound = new Array(Math.floor(upRate * pv.renderDuration)).fill(0);
  for (let i = 0; i < sound.length; ++i) sound[i] = process(upRate, pv, dsp);
  sound = downSampleIIR(sound, upFold);

  // Post effect.
  let gainEnv = 1;
  let decay = Math.pow(pv.decayTo, 1.0 / sound.length);
  for (let i = 0; i < sound.length; ++i) {
    sound[i] *= gainEnv;
    gainEnv *= decay;
  }

  postMessage({sound: sound});
}
