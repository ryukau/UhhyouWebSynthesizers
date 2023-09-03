// Copyright 2023 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {IntDelay, LongAllpass} from "../common/dsp/delay.js";
import {DoubleEmaADEnvelope} from "../common/dsp/envelope.js";
import {constructHouseholder} from "../common/dsp/fdn.js";
import {Limiter} from "../common/dsp/limiter.js";
import {downSampleIIR} from "../common/dsp/multirate.js";
import {nextPrime} from "../common/dsp/prime.js";
import {SlopeFilter} from "../common/dsp/slopefilter.js";
import {RateLimiter} from "../common/dsp/smoother.js";
import {MatchedBiquad, SVFHP} from "../common/dsp/svf.js";
import {circularModes, lerp, uniformDistributionMap} from "../common/util.js";
import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";

import * as menuitems from "./menuitems.js";

const exp2Scaler = Math.log(2);

// A badly tuned lowpass based on complex resonator.
class ComplexLowpass {
  // R in [0, 1].
  constructor(cutoffNormalized, R) {
    const theta = 2 * Math.PI * cutoffNormalized;
    this.a1re = R * Math.cos(theta);
    this.a1im = R * Math.sin(theta);

    this.b_re = (1 - this.a1re) / 2;
    this.b_im = -this.a1im / 2;

    this.x1 = 0;
    this.y1re = 0;
    this.y1im = 0;
  }

  process(x0) {
    const sumX = x0 + this.x1;
    this.y1re = this.b_re * sumX + this.a1re * this.y1re - this.a1im * this.y1im;
    this.y1im = this.b_im * sumX + this.a1re * this.y1im + this.a1im * this.y1re;

    this.x1 = x0;
    return this.y1re;
  }
}

class FilteredDelay {
  constructor(
    sampleRate,
    delaySamples,
    delayTimeModAmount,
    delayTimeSlewRate,
    bandpassCut,
    bandpassQ,
  ) {
    this.delaySamples = delaySamples;
    this.bpCut = bandpassCut;
    this.bpQ = bandpassQ;

    this.delayTimeModAmount = delayTimeModAmount;
    this.timeSlew = new RateLimiter(delayTimeSlewRate);

    this.delay = new IntDelay(sampleRate, 2 * delaySamples / sampleRate);
    this.bandpass = new MatchedBiquad();
  }

  process(input, mod) {
    const modScaled = Math.exp(mod);
    let sig = this.bandpass.bp(input, this.bpCut * modScaled, this.bpQ);
    this.timeSlew.process(Math.abs(this.delayTimeModAmount * input));
    return this.delay.processMod(
      sig, (this.delaySamples - this.timeSlew.value) / modScaled);
  }
}

class EasyFDN {
  constructor(sampleRate, crossGain, crossfeeds, delays) {
    const create2dArray = (x, y) => {
      let a = new Array(x);
      for (let i = 0; i < a.length; ++i) a[i] = new Array(y).fill(0);
      return a;
    };

    this.crossGainBase = crossGain;
    this.crossGain = crossGain;

    const size = crossfeeds.length;

    this.matrix = constructHouseholder(create2dArray(size, size), crossfeeds, true);
    this.buf = create2dArray(2, size);
    this.bufIndex = 0;

    this.delay = delays;

    const peakHoldSamples = (128 / 48000) * sampleRate;
    this.crossDecay = Math.pow(Number.EPSILON, 1 / (1024 * peakHoldSamples));
    this.threshold = this.delay.length;
  }

  process(input, mod) {
    this.bufIndex ^= 1;
    let front = this.buf[this.bufIndex];
    let back = this.buf[this.bufIndex ^ 1];
    front.fill(0);
    for (let i = 0; i < front.length; ++i) {
      for (let j = 0; j < front.length; ++j) front[i] += this.matrix[i][j] * back[j];
    }

    for (let i = 0; i < front.length; ++i) {
      front[i] = this.delay[i].process(input + this.crossGain * front[i], mod);
    }

    const sum = front.reduce((sum, val) => sum + val, 0);
    if (this.threshold < sum) this.crossGain *= sum > 1000 ? 0.9 : this.crossDecay;
    return sum;
  }
}

class Tanh {
  constructor(gain) { this.invGain = 1 / Math.max(gain, Number.EPSILON); }
  process(input) { return Math.tanh(input * this.invGain); }
}

class Bypass {
  process(input) { return input; }
}

function process(upRate, pv, dsp) {
  let sig = 0;

  if (dsp.noiseGain > Number.EPSILON) {
    const noise = dsp.noiseGain * uniformDistributionMap(dsp.rng.number(), -1, 1);
    dsp.noiseGain *= dsp.noiseDecay;
    sig += dsp.noiseLowpass.process(noise);
  }

  const env = dsp.envelope.process();

  let sum = 0;
  for (let idx = 0; idx < dsp.longAllpass.length; ++idx) {
    sum += dsp.longAllpass[idx].process(sig);
  }
  sig = Math.tanh(sum);

  sig = dsp.fdn.process(sig, env);

  if (pv.dcHighpassHz > 0) sig = dsp.dcHighpass.hp(sig);
  if (pv.toneSlope < 1) sig = dsp.slopeFilter.process(sig);
  sig = dsp.limiter.process(sig);
  return sig;
}

function getPrimeRatios(length, octaveWrap = 0) {
  const ratios = new Array(length).fill(0);
  ratios[0] = 2;
  for (let i = 1; i < ratios.length; ++i) ratios[i] = nextPrime(ratios[i - 1]);

  if (octaveWrap === 0) {
    for (let i = 0; i < ratios.length; ++i) ratios[i] *= 0.5;
  } else {
    for (let i = 0; i < ratios.length; ++i) ratios[i] = 2 ** (Math.log2(ratios[i]) % 1);
  }

  return ratios;
}

function getPitchFunc(pv) {
  const pitchType = menuitems.pitchTypeItems[pv.pitchType];
  if (pitchType === "Harmonic") {
    return (index) => index + 1;
  } else if (pitchType === "Harmonic+12") {
    const series = [1, 4, 5, 12, 13, 15, 16, 24, 25, 31, 32, 33, 48, 49, 63, 64];
    return (index) => series[index];
  } else if (pitchType === "Harmonic*5") {
    const series = [1, 5, 8, 10, 15, 16, 20, 24, 25, 30, 32, 35, 40, 45, 50, 55, 60];
    return (index) => series[index];
  } else if (pitchType === "Harmonic Cycle(1, 5)") {
    const series = [1, 5];
    return (index) => series[index % 2];
  } else if (pitchType === "Harmonic Odd") {
    return (index) => 2 * index + 1;
  } else if (pitchType === "Semitone (1, 2, 7, 9)") {
    const series = [1, 8 / 7, 3 / 2, 5 / 3];
    return (index) => series[index % series.length];
  } else if (pitchType === "Circular Membrane Mode") {
    return (index) => circularModes[index % circularModes.length];
  } else if (pitchType === "Octave") {
    return (index) => 2 ** index;
  }
  const primeRatios = getPrimeRatios(pv.matrixSize);
  return (index) => primeRatios[index];
}

onmessage = async (event) => {
  const pv = event.data; // Parameter values.

  const upFold = parseInt(menuitems.oversampleItems[pv.overSample]);
  const upRate = upFold * pv.sampleRate;
  const sampleRateScaler = menuitems.sampleRateScalerItems[pv.sampleRateScaler];

  const stereoSeed = pv.stereoSeed === 0 ? 0 : 65537;
  const rng = new PcgRandom(BigInt(pv.seed + pv.channel * stereoSeed));

  let dsp = {};
  dsp.rng = rng;
  dsp.noiseGain = 1;
  dsp.noiseDecay = Math.pow(1e-3, 1 / (upRate * pv.noiseDecaySeconds));
  dsp.noiseLowpass = new ComplexLowpass(pv.noiseLowpassHz / upRate, 0.9);

  dsp.envelope = new DoubleEmaADEnvelope();
  dsp.envelope.noteOn(
    pv.envelopeModAmount * exp2Scaler, upRate * pv.envelopeAttackSeconds,
    upRate * pv.envelopeDecaySeconds);

  const nLongAllpass = 5;
  const maxLongApSeconds = 1 / pv.allpassMaxTimeHz;
  const maxLongApSamples = Math.ceil(maxLongApSeconds * upRate);
  dsp.longAllpass = new Array(nLongAllpass);
  for (let idx = 0; idx < nLongAllpass; ++idx) {
    dsp.longAllpass[idx] = new LongAllpass(upRate, maxLongApSeconds);
    dsp.longAllpass[idx].prepare(
      uniformDistributionMap(rng.number(), 2, maxLongApSamples), 0.95);
  }

  const crossFeedbackGain = pv.crossFeedbackGain <= 1
    ? pv.crossFeedbackGain
    : pv.crossFeedbackGain ** (1 / (upFold * sampleRateScaler));
  const nFdn = 1;
  const pitchFunc = getPitchFunc(pv);
  const bandpassCutHz = pv.delayTimeHz * 2 ** pv.bandpassCutRatio;
  let combs = new Array(pv.matrixSize);
  const pitchRatio = (index, spread, rndCent) => {
    const rndRange = exp2Scaler * rndCent / 1200;
    const freqSpread = lerp(1, pitchFunc(index), spread);
    return freqSpread
      * Math.exp(uniformDistributionMap(rng.number(), rndRange, rndRange));
  };
  for (let idx = 0; idx < combs.length; ++idx) {
    const delayCutRatio = pitchRatio(idx, pv.delayTimeSpread, pv.delayTimeRandomCent);
    const bpCutRatio = pitchRatio(idx, pv.bandpassCutSpread, pv.bandpassCutRandomCent);

    combs[idx] = new FilteredDelay(
      upRate,
      upRate / (pv.delayTimeHz * delayCutRatio),
      pv.delayTimeModAmount,
      pv.delayTimeSlewRate,
      bandpassCutHz * bpCutRatio / upRate,
      pv.bandpassQ,
    );
  }
  dsp.fdn = new EasyFDN(
    upRate,
    crossFeedbackGain,
    pv.crossFeedbackRatio.slice(0, pv.matrixSize).map(v => v * v),
    combs,
  );

  dsp.slopeFilter = new SlopeFilter(Math.floor(Math.log2(24000 / 1000)));
  dsp.slopeFilter.setCutoff(upRate, 1000, pv.toneSlope, true);
  dsp.dcHighpass = new SVFHP(pv.dcHighpassHz / upRate, Math.SQRT1_2);

  if (pv.limiterType === 1) {
    dsp.limiter = new Limiter(
      pv.limiterSmoothingSeconds * upRate, 0.001 * upRate, 0, pv.limiterThreshold);

    // Discard latency part.
    for (let i = 0; i < dsp.limiter.latency; ++i) process(upRate, pv, dsp);
  } else if (pv.limiterType === 2) {
    dsp.limiter = new Tanh(pv.limiterThreshold);
  } else {
    dsp.limiter = new Bypass();
  }

  // Discard silence of delay at start.
  let sig = 0;
  do {
    sig = process(upRate, pv, dsp);
  } while (sig === 0);

  // Process.
  let sound = new Array(Math.floor(upRate * pv.renderDuration)).fill(0);
  sound[0] = sig;
  for (let i = 1; i < sound.length; ++i) sound[i] = process(upRate, pv, dsp);
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
