// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {IntDelay, LongAllpass} from "../common/dsp/delay.js";
import {DrumCompressor, drumCompressorRecipes} from "../common/dsp/drumcompressor.js";
import {DoubleEmaADEnvelope} from "../common/dsp/envelope.js";
import {constructHouseholder} from "../common/dsp/fdn.js";
import {Limiter} from "../common/dsp/limiter.js";
import {downSampleIIR} from "../common/dsp/multirate.js";
import {nextPrime} from "../common/dsp/prime.js";
import {SlopeFilter} from "../common/dsp/slopefilter.js";
import {RateLimiter} from "../common/dsp/smoother.js";
import {MatchedBiquad, SVFHP} from "../common/dsp/svf.js";
import {circularModes, clamp, lerp, uniformFloatMap} from "../common/util.js";
import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";

import * as menuitems from "./menuitems.js";

const exp2Scaler = Math.log(2);

// A lowpass based on complex resonator.
class ComplexLowpass {
  constructor(cutoffNormalized) {
    // An arbitrary tuning on R. R must be in [0, 1].
    const setR = (cut, lowR, highR, lowCut, highCut) => {
      if (cut <= lowCut) return lowR;
      if (cut >= highCut) return highR;
      return lowR + (highR - lowR) * (cut - lowCut) / (highCut - lowCut);
    };

    const theta = 2 * Math.PI * cutoffNormalized;
    const cutRe = Math.cos(theta);
    const cutIm = Math.sin(theta);
    const R = setR(cutoffNormalized, 0.25, 0.9, 0.01, 0.2) ** cutIm;
    this.a1re = R * cutRe;
    this.a1im = R * cutIm;

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
    bandpassCut,
    bandpassQ,
  ) {
    this.delaySamples = delaySamples;
    this.bpCut = bandpassCut;
    this.bpQ = bandpassQ;

    this.delayTimeModAmount = delayTimeModAmount;
    this.timeSlew = new RateLimiter(0.5);

    this.delay = new IntDelay(2 * delaySamples);
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
  constructor(sampleRate, upFold, crossGain, crossfeeds, delays) {
    const create2dArray = (x, y) => {
      let a = new Array(x);
      for (let i = 0; i < a.length; ++i) a[i] = new Array(y).fill(0);
      return a;
    };

    this.crossGainBase = crossGain;
    this.crossGain = crossGain;
    this.crossGainRate = 0.85 ** (1 / upFold);

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

    input /= this.delay.length;
    for (let i = 0; i < this.delay.length; ++i) {
      front[i] = this.delay[i].process(input + this.crossGain * front[i], mod);
    }

    const sum = front.reduce((sum, val) => sum + val, 0);
    if (this.threshold < sum) {
      this.crossGain *= sum > 100 ? this.crossGainRate : this.crossDecay;
    }
    return sum;
  }
}

class SerialAllpass {
  constructor(gain, delaySamples) {
    this.allpass = new Array(delaySamples.length);
    for (let idx = 0; idx < delaySamples.length; ++idx) {
      this.allpass[idx] = new LongAllpass(delaySamples[idx]);
      this.allpass[idx].prepare(delaySamples[idx], gain);
    }
  }

  process(input) {
    let sum = input;
    for (let idx = 0; idx < this.allpass.length; ++idx) {
      input = this.allpass[idx].process(input);
      sum += input;
    }
    return sum;
  }
}

class WireEnvelope {
  constructor(decaySamples, decayCurve) {
    this.gain = Math.exp(exp2Scaler * decayCurve);
    this.decay = Math.pow(Number.EPSILON, 1 / decaySamples);
  }

  process() {
    const out = this.gain;
    this.gain *= this.decay;
    return out;
  }
}

class Tanh {
  constructor(gain) { this.invGain = 1 / Math.max(gain, Number.EPSILON); }
  process(input) { return Math.tanh(input * this.invGain); }
}

class Bypass {
  process(input) { return input; }
}

// `EnergyStore` thinly spreads the energy of collisions over time. This acts as a
// mitigation to not blow up FDN with collision.
//
// - Reference: https://www.gaussianwaves.com/2013/12/power-and-energy-of-a-signal/
class EnergyStore {
  constructor(decaySamples) {
    this.sum = 0;
    this.decay = -Math.log(Number.EPSILON) / decaySamples;
    this.gain = Math.exp(-this.decay);
  }

  process(value, preventBlowUp) {
    const absed = Math.abs(value);
    if (absed > Number.EPSILON) this.sum = (this.sum + value) * this.decay;
    if (preventBlowUp) this.sum = Math.min(0.125, this.sum);
    return this.sum *= this.gain;
  }
}

class EnergyStoreNoise {
  constructor() { this.sum = 0; }

  process(value, preventBlowUp, rng) {
    this.sum += Math.abs(value);
    if (preventBlowUp) this.sum = Math.min(0.25, this.sum);
    const out = uniformFloatMap(rng.number(), -this.sum, this.sum);
    this.sum -= Math.abs(out);
    return out;
  }
}

function solveCollision(p0, p1, v0, v1, distance) {
  const diff = p0 - p1 + distance;
  if (diff >= 0) return [0, 0];

  let sum = -diff;
  const r0 = Math.abs(v0);
  const r1 = Math.abs(v1);
  if (r0 + r1 >= Number.EPSILON) sum /= r0 + r1;
  return [sum * r1, -sum * r0];
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
    return (index) => series[index % series.length];
  } else if (pitchType === "Harmonic*5") {
    const series = [1, 5, 8, 10, 15, 16, 20, 24, 25, 30, 32, 35, 40, 45, 50, 55, 60];
    return (index) => series[index % series.length];
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

function prepareFdn(upRate, upFold, sampleRateScaler, pv, rng, isSecondary) {
  const delayOffset = isSecondary ? 2 ** pv.secondaryPitchOffset : 1;
  const bandpassCutHz = delayOffset * pv.delayTimeHz * 2 ** pv.bandpassCutRatio;
  const delayTimeHz = delayOffset * pv.delayTimeHz;

  const qOffset = isSecondary ? 2 ** pv.secondaryQOffset : 1;
  const bandpassQ = clamp(pv.bandpassQ * qOffset, 0.1, 100);

  const pitchFunc = getPitchFunc(pv);
  const pitchRatio = (index, spread, rndCent) => {
    const rndRange = exp2Scaler * rndCent / 1200;
    const freqSpread = lerp(1, pitchFunc(index), spread);
    return freqSpread * Math.exp(uniformFloatMap(rng.number(), rndRange, rndRange));
  };

  let combs = new Array(pv.matrixSize);
  for (let idx = 0; idx < combs.length; ++idx) {
    const delayCutRatio = pitchRatio(idx, pv.delayTimeSpread, pv.pitchRandomCent);
    const bpCutRatio = pitchRatio(idx, pv.bandpassCutSpread, pv.pitchRandomCent);
    combs[idx] = new FilteredDelay(
      upRate,
      upRate / (delayTimeHz * delayCutRatio),
      pv.delayTimeModAmount * upFold * sampleRateScaler,
      bandpassCutHz * bpCutRatio / upRate,
      bandpassQ,
    );
  }

  let crossFeedbackGain = pv.crossFeedbackGain;
  return new EasyFDN(
    upRate,
    upFold,
    crossFeedbackGain,
    pv.crossFeedbackRatio.slice(0, pv.matrixSize).map(v => v * v),
    combs,
  );
}

function prepareSerialAllpass(upRate, nAllpass, allpassMaxTimeHz, gain, rng) {
  // Randomly set `delaySamples` with following conditions:
  // - The sum of `delaySamples` equals to `scaler`.
  // - Minimum delay time is 2 samples for each all-pass.
  let delaySamples = new Array(nAllpass).fill(0);
  const scaler
    = Math.max(0, Math.ceil(upRate * nAllpass / allpassMaxTimeHz) - 2 * nAllpass);
  let sumSamples = 0;
  for (let idx = 0; idx < nAllpass; ++idx) {
    delaySamples[idx] = rng.number();
    sumSamples += delaySamples[idx];
  }
  let sumFraction = 0;
  for (let idx = 0; idx < nAllpass; ++idx) {
    const samples = 2 + scaler * delaySamples[idx] / sumSamples;
    delaySamples[idx] = Math.floor(samples);
    sumFraction += samples - delaySamples[idx];
  }
  delaySamples[0] += Math.round(sumFraction);
  return new SerialAllpass(gain, delaySamples);
}

function process(upRate, pv, dsp) {
  let sig = 0;

  if (dsp.noiseGain > Number.EPSILON) {
    const noise = dsp.noiseGain * uniformFloatMap(dsp.rng.number(), -1, 1);
    dsp.noiseGain *= dsp.noiseDecay;
    sig += dsp.noiseLowpass.process(noise);
  }

  sig = Math.tanh(dsp.longAllpass.process(sig));

  [dsp.wirePosition, dsp.fdnPosition[0]] = solveCollision(
    dsp.wirePosition, dsp.fdnPosition[0], dsp.wireVelocity, dsp.fdnVelocity[0],
    pv.wireDistance);

  if (dsp.wirePosition !== 0) dsp.isWireEngaged = true;

  let wireCollision = lerp(
    dsp.wireEnergyNoise.process(dsp.wirePosition, pv.preventBlowUp, dsp.rng),
    dsp.wireEnergyDecay.process(dsp.wirePosition, pv.preventBlowUp),
    pv.wireCollisionTypeMix);
  wireCollision = 8 * Math.tanh(0.125 * wireCollision);
  const wireIn = 0.995 * (sig + wireCollision);
  let wirePos = dsp.wireAllpass.process(wireIn) * dsp.wireEnvelope.process();
  if (pv.preventBlowUp) wirePos /= dsp.nWireAllpass;
  dsp.wireVelocity = wirePos - dsp.wirePosition;
  dsp.wirePosition = wirePos;

  const wireOut = lerp(sig, dsp.wirePosition, pv.impactWireMix);
  sig = wireOut;

  const env = dsp.envelope.process();
  if (pv.secondaryFdnMix > Number.EPSILON) {
    for (let idx = 0; idx < dsp.fdnPosition.length - 1; ++idx) {
      [dsp.fdnPosition[idx], dsp.fdnPosition[idx + 1]] = solveCollision(
        dsp.fdnPosition[idx], dsp.fdnPosition[idx + 1], dsp.fdnVelocity[idx],
        dsp.fdnVelocity[idx + 1], pv.secondaryDistance);
    }

    if (dsp.fdnPosition[0] !== 0) dsp.isSecondaryEngaged = true;

    for (let idx = 0; idx < dsp.fdn.length; ++idx) {
      const collision = dsp.energyStore[idx].process(dsp.fdnPosition[idx]);
      const p0 = dsp.fdn[idx].process(sig * pv.matrixSize + collision, env);
      dsp.fdnVelocity[idx] = p0 - dsp.fdnPosition[idx];
      dsp.fdnPosition[idx] = p0;
    }

    sig = lerp(dsp.fdnPosition[0], dsp.fdnPosition[1], pv.secondaryFdnMix);
  } else {
    const collision = dsp.energyStore[0].process(dsp.fdnPosition[0]);
    const p0 = dsp.fdn[0].process(sig * pv.matrixSize + collision, env);
    dsp.fdnVelocity[0] = p0 - dsp.fdnPosition[0];
    dsp.fdnPosition[0] = p0;
    sig = p0;
  }
  sig = lerp(sig, wireOut, pv.membraneWireMix);

  if (pv.dcHighpassHz > 0) sig = dsp.dcHighpass.hp(sig);
  if (pv.toneSlope < 1) sig = dsp.slopeFilter.process(sig);
  if (pv.compressorType > 0) sig = dsp.compressor.process(pv.compressorInputGain * sig);
  if (pv.limiterType > 0) sig = dsp.limiter.process(sig);
  return sig;
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
  dsp.noiseLowpass = new ComplexLowpass(pv.noiseLowpassHz / upRate);

  dsp.envelope = new DoubleEmaADEnvelope();
  dsp.envelope.noteOn(
    pv.envelopeModAmount * exp2Scaler, upRate * pv.envelopeAttackSeconds,
    upRate * pv.envelopeDecaySeconds);

  dsp.longAllpass = prepareSerialAllpass(upRate, 4, pv.allpassMaxTimeHz, 0.95, dsp.rng);

  dsp.nWireAllpass = 4;
  dsp.wireAllpass
    = prepareSerialAllpass(upRate, dsp.nWireAllpass, pv.wireFrequencyHz, 0.5, dsp.rng);
  dsp.wireEnvelope = new WireEnvelope(pv.wireDecaySeconds * upRate, 1);
  dsp.wirePosition = 0;
  dsp.wireVelocity = 0;
  dsp.wireEnergyNoise = new EnergyStoreNoise();
  dsp.wireEnergyDecay = new EnergyStore(upRate * 0.001);

  dsp.fdn = [prepareFdn(upRate, upFold, sampleRateScaler, pv, rng, false)];
  if (pv.secondaryFdnMix > Number.EPSILON) {
    dsp.fdn.push(prepareFdn(upRate, upFold, sampleRateScaler, pv, rng, true));
  }
  dsp.fdnPosition = [0, 0];
  dsp.fdnVelocity = [0, 0];
  const decaySamples = upRate * 0.001;
  dsp.energyStore = [new EnergyStore(decaySamples), new EnergyStore(decaySamples)];

  dsp.slopeFilter = new SlopeFilter(Math.floor(Math.log2(24000 / 1000)));
  dsp.slopeFilter.setCutoff(upRate, 1000, pv.toneSlope, true);
  dsp.dcHighpass = new SVFHP(pv.dcHighpassHz / upRate, Math.SQRT1_2);

  dsp.isWireEngaged = false;
  dsp.isSecondaryEngaged = false;

  dsp.compressor = pv.compressorType == 0
    ? new Bypass()
    : new DrumCompressor(upRate, drumCompressorRecipes[pv.compressorType - 1]);

  if (pv.limiterType === 1) {
    dsp.limiter = new Limiter(
      pv.limiterSmoothingSeconds * upRate, 0.001 * upRate, 0, pv.limiterThreshold);

    // Discard latency part.
    for (let i = 0; i < dsp.limiter.latency; ++i) process(upRate, pv, dsp);
  } else if (pv.limiterType === 2) {
    dsp.limiter = new Tanh(pv.limiterThreshold);
  }

  // Discard silence at start.
  let sig = 0;
  while (Math.abs(sig) < Number.EPSILON) sig = process(upRate, pv, dsp);

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

  postMessage({
    sound: sound,
    isWireEngaged: dsp.isWireEngaged,
    isSecondaryEngaged: dsp.isSecondaryEngaged,
  });
}
