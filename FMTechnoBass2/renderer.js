// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {IntDelay} from "../common/dsp/delay.js";
import {downSampleIIR} from "../common/dsp/multirate.js";
import {clamp} from "../common/util.js";

import * as menuitems from "./menuitems.js";

function noteToFreq(note) { return 440 * 2 ** ((note - 69) / 12); }

// Inline custom seedable PRNG matching original `prng.js` behavior
function xmur3(str) {
  for (var i = 0, h = 1779033703 ^ str.length; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = h << 13 | h >>> 19;
  }
  return function() {
    h = Math.imul(h ^ h >>> 16, 2246822507);
    h = Math.imul(h ^ h >>> 13, 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(a) {
  return function() {
    var t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 0x100000000;
  };
}

function getRng(seed) {
  var seedHash = xmur3(String(seed));
  return mulberry32(seedHash());
}

class ExpDecay {
  constructor(length, endValue = 1e-5) {
    this.gamma = Math.pow(endValue, 1 / length);
    this.value = 1;
  }

  env() {
    var out = this.value;
    this.value *= this.gamma;
    return out;
  }

  process(input) {
    var output = input * this.value;
    this.value *= this.gamma;
    return output;
  }
}

/**
 * Evaluates f(x) = sum_{i=1}^8 T_i(x) / i using Chebyshev recurrence.
 * @param {number} x - The input value.
 * @returns {number} The evaluated result.
 */
function lowSaw(x, N = 32) {
  let sum = 0;
  let amp = 1;
  let tPrev2 = 1; // T_0(x)
  let tPrev1 = x; // T_1(x)

  sum += tPrev1 / 1; // Add T_1(x) / 1

  for (let i = 2; i <= 8; i++) {
    const tCurr = 2 * x * tPrev1 - tPrev2;
    sum += tCurr / i;
    amp += 1 / i;
    tPrev2 = tPrev1;
    tPrev1 = tCurr;
  }

  return (sum - 1) / amp;
}

class WaveShaper {
  constructor(shapeFunc) {
    const length = 2048;
    this.end = length - 1;

    this.curve = new Array(length);
    for (var i = 0; i < length; ++i) { this.curve[i] = shapeFunc(i / this.end); }
  }

  process(input) {
    const absed = Math.abs(input);
    if (absed >= 1.0) { return Math.sign(input) * this.curve[this.end]; }

    const pos = this.end * absed;
    const idx = Math.floor(pos);
    const frac = pos - idx;

    const c0 = this.curve[idx];
    const c1 = this.curve[idx + 1];
    return Math.sign(input) * (c0 + frac * (c1 - c0));
  }
}

class Oscillator {
  constructor(skew, shape, phase) {
    this.phase = phase;
    this.skew = Math.max(skew, Number.EPSILON);
    this.shaper = new WaveShaper(this.getShapeFunc(shape));
  }

  getShapeFunc(shape) {
    if (shape < 1.1920928955078125e-07) { return (x) => x; }
    const range = 2 * Math.PI * shape;
    const normalize = range < Math.PI * 0.5 ? Math.sin(range) : 1;
    return (x) => Math.sin(range * x) / normalize;
  }

  process(sampleRate, pitchHz, modIn) {
    this.phase += pitchHz / sampleRate;
    this.phase -= Math.floor(this.phase);
    var ph = 2 * Math.PI * Math.pow(this.phase, this.skew);
    return this.shaper.process(Math.sin(ph + modIn));
  }
}

class MagicOscillator {
  constructor(skew = 1.0, shape = 0, phase = 0) {
    this.skew = skew;
    this.shaper = new WaveShaper(this.getShapeFunc(shape));

    const omega = 0; // 2 * Math.PI * 0.01;
    const phi = 2 * Math.PI * phase;
    this.u = Math.cos(phi - omega * 1.5);
    this.v = Math.sin(phi - omega);
    this.prevModIn = 0;
  }

  getShapeFunc(shape) { return (x) => x; }

  process(sampleRate, pitchHz, modIn = 0) {
    const dMod = modIn - this.prevModIn;
    this.prevModIn = modIn;

    const freqNorm = pitchHz / sampleRate;
    const omegaInst = 2 * Math.PI * freqNorm + dMod;
    const k = Math.max(-0.9921875, Math.min(0.9921875, omegaInst));

    const threshold = Number.POSITIVE_INFINITY;

    this.u -= k * this.v;
    if (Math.abs(this.u) > threshold || !Number.isFinite(this.u)) this.u = 0;

    this.v += k * this.u;
    if (Math.abs(this.v) > threshold || !Number.isFinite(this.v)) this.v = 0;

    return this.shaper.process(this.v);
  }
}

// Unused.
class ChamberlinSvf {
  #lp = 0;
  #bp = 0;

  reset() {
    this.#lp = 0;
    this.#bp = 0;
  }

  // q = 1 / Q.
  process(input, cutoffNormalized, q) {
    const clamp = (val, min, max) => Math.min(Math.max(val, min), max);

    const cut = clamp(cutoffNormalized, 0, 0.1731886233119285);
    const f = 2 * Math.sin(Math.PI * cut);

    const clampedQ = clamp(q, 0, Math.SQRT2);

    const hp = -clampedQ * this.#bp + (input - this.#lp);
    this.#bp = f * hp + this.#bp;
    this.#lp = f * this.#bp + this.#lp;

    return this.#lp;
  }
}

class DecayEnvelope {
  constructor(timeInSample, saturation, curve, sustain) {
    this.env = new ExpDecay(timeInSample);
    this.shaper = new WaveShaper((x) => x + saturation * (Math.tanh(4 * x) - x));
    this.curve = curve;
    this.sustain = sustain;
  }

  process() {
    return this.sustain + (1 - this.sustain) * this.shaper.process(this.env.env() ** this.curve);
  }
}

class OscBlock {
  constructor(
    OscillatorType,
    frequency,
    durationInSample,
    sinPhase = 0,
    sinSkew = 1,
    sinShaper = 0,
    envCurve = 1,
    envSustain = 0,
    envSaturation = 0,
    combTime = 1,
    combFeedback = 0,
    maxDelayTimeInSamples = 44100,
  ) {
    this.oscFreq = frequency;
    this.osc = new OscillatorType(sinSkew, sinShaper, sinPhase);
    this.env = new DecayEnvelope(durationInSample, envSaturation, envCurve, envSustain);
    this.combTime = combTime;
    this.combFeedback = combFeedback;
    this.delay = new IntDelay(maxDelayTimeInSamples);
    this.delayOut = 0;
  }

  process(sampleRate, modIn, bypassEnvelopes = false) {
    const envVal = bypassEnvelopes ? 1.0 : this.env.process();
    const oscOut = envVal * this.osc.process(sampleRate, this.oscFreq, modIn);

    this.delay.setTime(this.combTime * sampleRate / 1000);
    const combIn = oscOut + this.combFeedback * this.delayOut;
    this.delayOut = this.delay.process(combIn);
    return combIn;
  }
}

onmessage = (event) => {
  const pv = event.data;

  const upFold = parseInt(menuitems.oversampleItems[pv.overSample]);
  const upRate = upFold * pv.sampleRate;

  const rng = getRng(pv.seed + pv.channel);
  const bypassEnvelopes = pv.bypassEnvelopes === 1;

  const durationInSample = upRate * pv.renderDuration;
  let sound = new Array(Math.floor(durationInSample)).fill(0);
  const nUnison = pv.nUnison;
  const unisonDetune = pv.unisonDetune / 100;
  const unisonPhase = pv.unisonPhase / nUnison;

  const nOsc = 3;
  let oscData = [];
  for (let i = 0; i < nOsc; ++i) {
    oscData.push({
      envDuration: pv[`osc${i}_envDuration`],
      envCurve: pv[`osc${i}_envCurve`],
      envSustain: pv[`osc${i}_envSustain`],
      envSaturation: pv[`osc${i}_envSaturation`],
      pmIndex: pv[`osc${i}_pmIndex`],
      sinPhase: pv[`osc${i}_sinPhase`],
      sinSkew: pv[`osc${i}_sinSkew`],
      sinShaper: pv[`osc${i}_sinShaper`],
      freqNumerator: pv[`osc${i}_freqNumerator`],
      freqDenominator: pv[`osc${i}_freqDenominator`],
      combTime: pv[`osc${i}_combTime`],
      combFeedback: pv[`osc${i}_combFeedback`],
    });
  }

  const OscType = pv.magicOscillator ? MagicOscillator : Oscillator;

  for (let unison = 0; unison < nUnison; ++unison) {
    const frequency = noteToFreq(pv.note + unison * unisonDetune);

    const osc = new Array(nOsc);
    const pmIndex = new Array(nOsc);
    for (let i = 0; i < nOsc; ++i) {
      const prm = oscData[i];
      const freqHz = frequency * prm.freqNumerator / prm.freqDenominator;
      osc[i] = new OscBlock(
        OscType,
        pv.integerPitch === 0 ? freqHz : Math.floor(freqHz),
        Math.floor(durationInSample * prm.envDuration),
        prm.sinPhase + unison * unisonPhase * rng(),
        prm.sinSkew,
        prm.sinShaper,
        prm.envCurve,
        prm.envSustain,
        prm.envSaturation,
        prm.combTime * Math.exp(-2.0794415416798357 * pv.unisonCombTime * unison),
        prm.combFeedback,
        upRate,
      );
      pmIndex[i] = prm.pmIndex;
    }

    const lfo = new OscBlock(
      OscType,
      frequency / pv.lfoFreqDenominator,
      Math.floor(durationInSample * pv.lfoDuration),
      pv.lfoPhase,
    );
    const lfoIndex = pv.lfoPmIndex;

    const fxMod = (m) => { return m; }; // Not implemented.

    let feedback = 0;
    const last = osc.length - 1;
    for (let i = 0; i < sound.length; ++i) {
      feedback = osc[last].process(upRate, pmIndex[last] * feedback);
      let buf = feedback;
      for (let j = osc.length - 2; j > 0; --j) {
        buf = osc[j].process(upRate, fxMod(pmIndex[j] * buf), bypassEnvelopes);
      }
      const mod0 = pmIndex[0] * buf + lfoIndex * lfo.process(upRate, 0);
      sound[i] += osc[0].process(upRate, fxMod(mod0), bypassEnvelopes);
    }
  }

  // Post effect.
  let gainEnv = 1;
  let decay = Math.pow(pv.decayTo, 1.0 / sound.length);
  for (let i = 0; i < sound.length; ++i) {
    sound[i] *= gainEnv;
    gainEnv *= decay;
  }

  if (upFold > 1) { sound = downSampleIIR(sound, upFold); }

  postMessage({sound: sound});
};
