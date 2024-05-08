// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {IntDelay} from "../common/dsp/delay.js";
import {ExpADEnvelope} from "../common/dsp/envelope.js";
import {Limiter} from "../common/dsp/limiter.js";
import {downSampleIIR} from "../common/dsp/multirate.js";
import {nextPrime} from "../common/dsp/prime.js";
import {BiquadOsc} from "../common/dsp/recursivesine.js";
import {SlopeFilter} from "../common/dsp/slopefilter.js";
import {RateLimiter} from "../common/dsp/smoother.js";
import {MatchedBiquad, SVFHP} from "../common/dsp/svf.js";
import {
  circularModes,
  exponentialMap,
  lerp,
  uniformFloatMap,
} from "../common/util.js";
import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";

import * as menuitems from "./menuitems.js";

const exp2Scaler = Math.log(2);

class MultiSine {
  // `maxInitialPhase` should be in [0, 1).
  // `*Freq` should be normalized frequency in [0, 0.5).
  constructor(
    nSine,
    rng,
    lowerFreq,
    upperFreq,
    maxInitialPhase,
    lowerDecaySample,
    upperDecaySample,
    attackScaler,
    sortOrder,
  ) {
    upperFreq = Math.min(upperFreq, 0.49);

    this.osc = new Array(nSine);
    this.env = new Array(nSine);
    this.gain = 1 / Math.sqrt(nSine);

    const randomDecay
      = () => exponentialMap(rng.number(), lowerDecaySample, upperDecaySample);
    const ascend = (a, b) => a - b;
    const descend = (a, b) => b - a;

    let oscFreq = new Array(nSine);
    let envDecay = new Array(nSine);
    for (let i = 0; i < nSine; ++i) {
      oscFreq[i] = exponentialMap(rng.number(), lowerFreq, upperFreq);
      envDecay[i] = randomDecay();
    }
    if (sortOrder == 1) { // Low is longer.
      oscFreq.sort(ascend);
      envDecay.sort(descend);
    } else if (sortOrder == 2) { // High is longer.
      oscFreq.sort(ascend);
      envDecay.sort(ascend);
    }

    for (let i = 0; i < nSine; ++i) {
      const phase = maxInitialPhase * rng.number();
      this.osc[i] = new BiquadOsc(oscFreq[i], phase);
      this.env[i] = new ExpADEnvelope(attackScaler * randomDecay(), envDecay[i]);
    }
  }

  process() {
    let sum = 0;
    for (let i = 0; i < this.osc.length; ++i) {
      sum += this.env[i].process() * this.osc[i].process();
    }
    return sum * this.gain;
  }
}

class FilteredDelay {
  constructor(
    delaySamples,
    delayTimeModAmount,
    cutoffNormalized,
    filterQ,
  ) {
    this.delaySamples = delaySamples;
    this.cutoff = cutoffNormalized;
    this.fltQ = filterQ;

    this.delayTimeModAmount = delayTimeModAmount;
    this.timeSlew = new RateLimiter(0.5);

    this.delay = new IntDelay(2 * delaySamples);
    this.biquad = new MatchedBiquad();

    // this.energy = 0;
  }

  process(input) {
    const sig = this.biquad.bp(input, this.cutoff, this.fltQ);
    this.timeSlew.process(Math.abs(this.delayTimeModAmount * input));
    const out = this.delay.processMod(sig, this.delaySamples - this.timeSlew.value);

    // // This may be inaccurate. Maybe use fixed point math.
    // this.energy = Math.max(0, this.energy + sig * sig - out * out);

    return out;
  }
}

class CollidingComb {
  constructor(sampleRate, distance, feedbackGain, delays) {
    this.distance = distance;
    this.position = new Array(delays.length).fill(0);
    this.velocity = new Array(delays.length).fill(0);
    this.feedbackGain = new Array(delays.length).fill(feedbackGain);
    this.delays = delays;

    this.threshold = 100;
    this.safetyGain = 1;
    this.safetyFall = Math.pow(Number.EPSILON, 0.001 * sampleRate);
    this.safetyRise = 0.01;
  }

  process(input) {
    this.position[0] += input;

    for (let idx = 0; idx < this.position.length - 1; ++idx) {
      const dist = this.position[idx] - this.position[idx + 1];
      if (dist >= this.distance) continue;

      const energySq = Math.abs(this.position[idx]) + Math.abs(this.position[idx + 1]);

      const v0 = Math.abs(this.velocity[idx]);
      const v1 = Math.abs(this.velocity[idx + 1]);
      let ratioDenom = v0 + v1 >= Number.EPSILON ? v0 + v1 : 1;
      this.position[idx] += energySq * v1 / ratioDenom;
      this.position[idx + 1] -= energySq * v0 / ratioDenom;
    }

    for (let idx = 0; idx < this.delays.length; ++idx) {
      const p0 = this.delays[idx].process(this.position[idx]);
      this.velocity[idx] = p0 - this.position[idx];
      this.position[idx] = p0 * this.feedbackGain[idx] * this.safetyGain;
    }

    const sum = this.position.reduce((p, c) => p + c, 0);
    if (sum > this.threshold) {
      this.safetyGain *= this.safetyFall;
      this.safetyGain = Math.max(this.safetyGain, Number.EPSILON);
    } else {
      this.safetyGain += this.safetyRise;
      this.safetyGain = Math.min(this.safetyGain, 1);
    }
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
    const noise = dsp.noiseGain * uniformFloatMap(dsp.rng.number(), -1, 1);
    dsp.noiseGain *= dsp.noiseDecay;
    sig += pv.oscGain * lerp(noise, dsp.sineOsc.process(), pv.noiseToneMix);
  }

  sig = dsp.combs.process(sig);

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
  const primeRatios = getPrimeRatios(pv.nComb);
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
  dsp.noiseDecay = Math.pow(1e-3, 1 / (upRate * pv.oscDecaySeconds));
  dsp.sineOsc = new MultiSine(
    pv.toneSineCount,
    dsp.rng,
    pv.toneFreqHz / upRate,
    pv.toneFreqHz * 2 ** pv.toneRangeOct / upRate,
    pv.tonePhaseSpread,
    0.01 * upRate,
    pv.oscDecaySeconds * upRate,
    pv.toneAttackScaler,
    pv.toneSorting,
  );

  const pitchFunc = getPitchFunc(pv);
  const bandpassCutHz = pv.delayTimeHz * 2 ** pv.bandpassCutRatio;
  let delays = new Array(pv.nComb);
  const pitchRatio = (index, spread, rndCent) => {
    const rndRange = exp2Scaler * rndCent / 1200;
    const freqSpread = lerp(1, pitchFunc(index), spread);
    return freqSpread * Math.exp(uniformFloatMap(rng.number(), rndRange, rndRange));
  };
  for (let idx = 0; idx < delays.length; ++idx) {
    const delayCutRatio = pitchRatio(idx, pv.delayTimeSpread, pv.delayTimeRandomCent);

    delays[idx] = new FilteredDelay(
      upRate / (pv.delayTimeHz * delayCutRatio),
      pv.delayTimeModAmount * upFold * sampleRateScaler,
      bandpassCutHz / upRate,
      pv.bandpassQ,
    );
  }
  dsp.combs = new CollidingComb(upRate, pv.collisionDistance, pv.feedbackGain, delays);

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
