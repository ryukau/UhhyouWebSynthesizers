// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {IntDelay} from "../common/dsp/delay.js";
import {SurgeEnvelope} from "../common/dsp/envelope.js";
import {downSampleIIR} from "../common/dsp/multirate.js";
import {HP1} from "../common/dsp/onepole.js";

import * as menuitems from "./menuitems.js";

function noteToFreq(note) { return 440 * 2 ** ((note - 69) / 12); }

/**
 * Bessel function of the first kind of order zero, J_0(x).
 * Ported from Boost C++ Math Library (boost/math/special_functions/bessel_j0.hpp)
 *
 * @param {number} x - Input value
 * @returns {number} J_0(x)
 */
function besselJ0(x) {
  if (Number.isNaN(x)) return NaN;
  x = Math.abs(x);
  if (x === 0.0) return 1.0;
  if (!Number.isFinite(x)) return 0.0;

  function evalPoly(p, y) {
    let res = p[p.length - 1];
    for (let i = p.length - 2; i >= 0; i--) { res = res * y + p[i]; }
    return res;
  }

  const P1 = [
    -4.1298668500990866786e11, 2.7282507878605942706e10, -6.2140700423540120665e08,
    6.6302997904833794242e06, -3.6629814655107086448e04, 1.0344222815443188943e02,
    -1.2117036164593528341e-01
  ];
  const Q1 = [
    2.3883787996332290397e12, 2.6328198300859648632e10, 1.3985097372263433271e08,
    4.5612696224219938200e05, 9.3614022392337710626e02, 1.0, 0.0
  ];

  const P2 = [
    -1.8319397969392084011e03, -1.2254078161378989535e04, -7.2879702464464618998e03,
    1.0341910641583726701e04, 1.1725046279757103576e04, 4.4176707025325087628e03,
    7.4321196680624245801e02, 4.8591703355916499363e01
  ];
  const Q2 = [
    -3.5783478026152301072e05, 2.4599102262586308984e05, -8.4055062591169562211e04,
    1.8680990008359188352e04, -2.9458766545509337327e03, 3.3307310774649071172e02,
    -2.5258076240801555057e01, 1.0
  ];

  const PC = [
    2.2779090197304684302e04, 4.1345386639580765797e04, 2.1170523380864944322e04,
    3.4806486443249270347e03, 1.5376201909008354296e02, 8.8961548424210455236e-01
  ];
  const QC = [
    2.2779090197304684318e04, 4.1370412495510416640e04, 2.1215350561880115730e04,
    3.5028735138235608207e03, 1.5711159858080893649e02, 1.0
  ];
  const PS = [
    -8.9226600200800094098e01, -1.8591953644342993800e02, -1.1183429920482737611e02,
    -2.2300261666214198472e01, -1.2441026745835638459e00, -8.8033303048680751817e-03
  ];
  const QS = [
    5.7105024128512061905e03, 1.1951131543434613647e04, 7.2642780169211018836e03,
    1.4887231232283756582e03, 9.0593769594993125859e01, 1.0
  ];

  const x1 = 2.4048255576957727686;
  const x2 = 5.5200781102863106496;
  const x11 = 616.0;
  const x12 = -1.42444230422723137837e-03;
  const x21 = 1413.0;
  const x22 = 5.46860286310649596604e-04;

  if (x <= 4.0) {
    const y = x * x;
    const r = evalPoly(P1, y) / evalPoly(Q1, y);
    const factor = (x + x1) * ((x - x11 / 256.0) - x12);
    return factor * r;
  } else if (x <= 8.0) {
    const y = 1.0 - (x * x) / 64.0;
    const r = evalPoly(P2, y) / evalPoly(Q2, y);
    const factor = (x + x2) * ((x - x21 / 256.0) - x22);
    return factor * r;
  } else {
    const y = 8.0 / x;
    const y2 = y * y;
    const rc = evalPoly(PC, y2) / evalPoly(QC, y2);
    const rs = evalPoly(PS, y2) / evalPoly(QS, y2);
    const factor = (1.0 / Math.sqrt(Math.PI)) / Math.sqrt(x);
    const sx = Math.sin(x);
    const cx = Math.cos(x);
    return factor * (rc * (cx + sx) - y * rs * (sx - cx));
  }
}

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

function getShapeFunc(shape) {
  if (shape < Number.EPSILON) { return (x) => x; }
  const range = 2 * Math.PI * shape;
  const normalize = range < Math.PI * 0.5 ? Math.sin(range) : 1;
  return (x) => Math.sin(range * x) / normalize;
}

class Oscillator {
  constructor(skew, shape, phase) {
    this.phase = phase;
    this.skew = Math.max(skew, Number.EPSILON);
    this.shaper = getShapeFunc(shape);
  }

  process(sampleRate, pitchHz, modIn) {
    this.phase += pitchHz / sampleRate;
    this.phase -= Math.floor(this.phase);
    const phi = 2 * this.phase - 1;
    const theta = Math.PI * Math.sign(phi) * Math.pow(Math.abs(phi), this.skew);
    return this.shaper(Math.sin(theta + modIn));
  }
}

function sineAdaa1(x0, x1) {
  if (!Number.isFinite(x0) || !Number.isFinite(x1)) { return NaN; }

  const u_hi = x0 + x1;
  const z = u_hi - x0;
  const u_lo = (x0 - (u_hi - z)) + (x1 - z);

  const m_hi = u_hi * 0.5;
  const m_lo = u_lo * 0.5;

  const d_hi = x1 - x0;
  const z2 = d_hi - x1;
  const d_lo = (x1 - (d_hi - z2)) - (x0 + z2);

  const dh_hi = d_hi * 0.5;
  const dh_lo = d_lo * 0.5;

  if (!Number.isFinite(m_hi) || !Number.isFinite(dh_hi)) {
    const delta_half = x1 * 0.5 - x0 * 0.5;
    if (delta_half === 0.0) { return Math.sin(x0); }
    return ((Math.cos(x0) - Math.cos(x1)) / delta_half) * 0.5;
  }

  const sin_mid = Math.sin(m_hi) * Math.cos(m_lo) + Math.cos(m_hi) * Math.sin(m_lo);

  let sinc;
  if (Math.abs(dh_hi) < 1e-5) {
    sinc = 1.0 - (dh_hi * dh_hi) / 6.0;
  } else {
    const sin_dh = Math.sin(dh_hi) * Math.cos(dh_lo) + Math.cos(dh_hi) * Math.sin(dh_lo);
    sinc = sin_dh / (dh_hi + dh_lo);
  }

  return sin_mid * sinc;
}

class OscillatorAa {
  constructor(skew, shape, phase) {
    this.phase = phase;
    this.skew = Math.max(skew, Number.EPSILON);
    this.shaper = getShapeFunc(shape);
    this.theta1 = 0;
  }

  process(sampleRate, pitchHz, modIn) {
    this.phase += pitchHz / sampleRate;

    if (this.phase >= 1.0) {
      const wraps = Math.floor(this.phase);
      this.phase -= wraps;
      this.theta1 -= 2 * Math.PI * wraps;
    }

    const phi = 2 * this.phase - 1;
    const theta0 = Math.PI * Math.sign(phi) * Math.pow(Math.abs(phi), this.skew) + modIn;
    const y = sineAdaa1(theta0, this.theta1);
    this.theta1 = theta0;

    return this.shaper(y);
  }
}

export class TriangleAdaa1 {
  #x1 = 0;
  #rem1 = 0;

  static #rint(x) {
    if (!Number.isFinite(x)) return x;
    let r = Math.floor(x + 0.5);
    if (Math.abs(x - Math.trunc(x)) === 0.5 && (Math.trunc(r) & 1) !== 0) { r -= 1; }
    return r;
  }

  static #signbit(x) { return x < 0 || Object.is(x, -0); }

  static #fma(a, b, c) { return typeof Math.fma === 'function' ? Math.fma(a, b, c) : a * b + c; }

  static #f0Rem2(rem) {
    const absRem = Math.abs(rem);
    if (absRem <= 1) { return -rem; }
    const s = TriangleAdaa1.#signbit(rem) ? -1 : 1;
    return rem - 2 * s;
  }

  static #diffQuotientExtended(r0, r1) {
    if (r0 === r1) { return TriangleAdaa1.#f0Rem2(r0); }
    if (r0 > r1) {
      const temp = r0;
      r0 = r1;
      r1 = temp;
    }
    if (r1 <= 1 && r0 >= -1) { return -0.5 * (r0 + r1); }

    const dx = r1 - r0;
    const s = r1 <= 1 ? 1 : -1;
    const x = r0 + s;
    const y = r1 + s;
    const num = TriangleAdaa1.#fma(y, 2 - y, (-x) * (x + 2));
    return (0.5 * s) * num / dx;
  }

  static #diffQuotientModulo4(rem0, rem1Prime) {
    const n = TriangleAdaa1.#rint(0.25 * (rem0 + rem1Prime));
    const r0 = TriangleAdaa1.#fma(-2, n, rem0);
    const r1 = TriangleAdaa1.#fma(-2, n, rem1Prime);

    let D = TriangleAdaa1.#diffQuotientExtended(r0, r1);
    if ((Math.trunc(n) & 1) !== 0) { D = -D; }
    return D;
  }

  static #computeYTriangle1Internal(x0, rem0, x1, rem1) {
    const dx = x1 - x0;
    if (dx === 0) { return TriangleAdaa1.#f0Rem2(rem0); }

    let rem1Prime = rem1;
    if (rem1 - rem0 > 2) {
      rem1Prime = rem1 - 4;
    } else if (rem1 - rem0 < -2) {
      rem1Prime = rem1 + 4;
    }

    const D = TriangleAdaa1.#diffQuotientModulo4(rem0, rem1Prime);

    const dxPrime = rem1Prime - rem0;
    const ans = D * (dxPrime / dx);
    return ans;
  }

  reset() {
    this.#x1 = 0;
    this.#rem1 = 0;
  }

  process(input) {
    const x0 = this.#x1;
    const rem0 = this.#rem1;

    const x1 = Number(input);
    const k1 = TriangleAdaa1.#rint(x1 * 0.25);
    const rem1 = TriangleAdaa1.#fma(-4, k1, x1);

    this.#x1 = x1;
    this.#rem1 = rem1;

    if (!Number.isFinite(x0) || !Number.isFinite(x1)) { return NaN; }

    if (TriangleAdaa1.#signbit(x0) !== TriangleAdaa1.#signbit(x1)) {
      const y1 = -x1;
      const remY1 = -rem1;
      const dx = x1 - x0;
      if (dx === 0) { return TriangleAdaa1.#computeYTriangle1Internal(x0, rem0, x0, rem0); }
      const DNew = TriangleAdaa1.#computeYTriangle1Internal(x0, rem0, y1, remY1);
      return DNew * ((-x1 - x0) / dx);
    } else {
      return TriangleAdaa1.#computeYTriangle1Internal(x0, rem0, x1, rem1);
    }
  }
}

class OscillatorTriangleAa {
  constructor(skew, shape, phase) {
    this.phase = phase;
    this.skew = Math.max(skew, Number.EPSILON);
    this.shaper = getShapeFunc(shape);
    this.offset = 0;
    this.tri = new TriangleAdaa1();
  }

  process(sampleRate, pitchHz, modIn) {
    this.phase += pitchHz / sampleRate;
    if (this.phase >= 1) {
      const wraps = Math.floor(this.phase);
      this.phase -= wraps;
      this.offset += 4 * wraps;
    }

    const phi = 2 * this.phase - 1;
    const theta
      = 2 * Math.sign(phi) * Math.pow(Math.abs(phi), this.skew) + modIn * (4 / (2 * Math.PI));
    const y = this.tri.process(theta + this.offset);

    return this.shaper(y);
  }
}

function sawtoothAdaa1(x0, x1) {
  const limit = Number.MAX_VALUE;
  if ((x1 < 0 && x0 > 0 && x0 > limit + x1) || (x1 > 0 && x0 < 0 && x0 < -limit + x1)) { return 0; }

  const diff = x0 - x1;

  let k_a, x_aw;
  if (Math.abs(x1) > Number.MAX_SAFE_INTEGER) {
    k_a = x1 * 0.5;
    x_aw = 0;
  } else {
    k_a = Math.floor(x1 * 0.5 + 0.5);
    x_aw = k_a * -2 + x1;
  }

  let k_b, x_bw;
  if (Math.abs(x0) > Number.MAX_SAFE_INTEGER) {
    k_b = x0 * 0.5;
    x_bw = 0;
  } else {
    k_b = Math.floor(x0 * 0.5 + 0.5);
    x_bw = k_b * -2 + x0;
  }

  if (k_a === k_b || Math.abs(diff) < Number.EPSILON) {
    return 0.5 * (x_aw + x_bw);
  } else {
    return 0.5 * (x_bw - x_aw) * (x_bw + x_aw) / diff;
  }
}

class OscillatorSawtoothAa {
  constructor(skew, shape, phase = 0) {
    const wraps = Math.floor(phase);
    this.phase = phase - wraps;

    this.skew = Math.max(skew, Number.EPSILON);
    this.shaper = getShapeFunc(shape);

    const phi = 2 * this.phase - 1;
    this.theta1 = Math.sign(phi) * Math.pow(Math.abs(phi), this.skew);
  }

  process(sampleRate, pitchHz, modIn = 0) {
    this.phase += pitchHz / sampleRate;

    if (this.phase >= 1.0 || this.phase < 0.0) {
      const wraps = Math.floor(this.phase);
      this.phase -= wraps;
      this.theta1 -= 2 * wraps;
    }

    const phi = 2 * this.phase - 1;
    const theta0 = Math.sign(phi) * Math.pow(Math.abs(phi), this.skew) + modIn;
    const y = sawtoothAdaa1(theta0 - 1.0, this.theta1 - 1.0);
    this.theta1 = theta0;

    return this.shaper(y);
  }
}

class MagicOscillator {
  constructor(skew = 1.0, shape = 0, phase = 0) {
    this.skew = Math.expm1((skew - 1) / 8);
    this.shaper = getShapeFunc(shape);

    const omega = 0;
    const phi = 2 * Math.PI * phase;
    this.u = Math.cos(phi - omega * 1.5);
    this.v = Math.sin(phi - omega);
    this.prevModIn = 0;
  }

  process(sampleRate, pitchHz, modIn = 0) {
    const dMod = modIn - this.prevModIn;
    this.prevModIn = modIn;

    const freqNorm = pitchHz / sampleRate;
    const omegaInst = 2 * Math.PI * freqNorm + dMod;
    const k = Math.max(-0.9921875, Math.min(0.9921875, omegaInst));

    const threshold = 4;

    this.u -= k * this.v;
    if (Math.abs(this.u) >= threshold || !Number.isFinite(this.u)) this.u = 0;

    this.v += k * this.u;
    if (Math.abs(this.v) >= threshold || !Number.isFinite(this.v)) this.v = 0;

    return this.shaper(this.v / (1 + this.skew * Math.abs(this.u)));
  }
}

class ExpDecay {
  constructor(attack, length, endValue = 1e-5) {
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

class DecayEnvelope {
  constructor(EnvelopeType, attackSamples, lengthSamples, saturation, curve, sustain) {
    this.env = new EnvelopeType(attackSamples, lengthSamples);
    this.shaper = (x) => x + saturation * (Math.tanh(4 * x) - x);
    this.curve = curve;
    this.sustain = sustain;
  }

  process() {
    return this.sustain + (1 - this.sustain) * this.shaper(this.env.env() ** this.curve);
  }
}

class OscBlock {
  constructor(
    OscillatorType,
    EnvelopeType,
    frequency,
    durationSamples,
    attackSamples = 0,
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
    this.env = new DecayEnvelope(
      EnvelopeType, attackSamples, durationSamples, envSaturation, envCurve, envSustain);
    this.combTime = combTime;
    this.combFeedback = combFeedback;
    this.delay = new IntDelay(maxDelayTimeInSamples);
    this.delayOut = 0;
    this.lastEnvVal = 1.0;
  }

  process(sampleRate, modIn, bypassEnvelopes = false) {
    this.lastEnvVal = bypassEnvelopes ? 1.0 : this.env.process();
    const oscOut = this.lastEnvVal * this.osc.process(sampleRate, this.oscFreq, modIn);

    this.delay.setTime(this.combTime * sampleRate / 1000);
    const combIn = oscOut + this.combFeedback * this.delayOut;
    this.delayOut = this.delay.process(combIn);
    return combIn;
  }
}

function generateLorentzian(T, a) {
  const out = new Float64Array(T);
  if (T <= 1) {
    if (T === 1) out[0] = 1.0;
    return out;
  }
  for (let i = 0; i < T; ++i) {
    const t_norm = i / (T - 1);
    out[i] = 1.0 / (1.0 + Math.pow(t_norm / a, 2));
  }
  return out;
}

onmessage = async (event) => {
  const pv = event.data;

  const upFold = parseInt(menuitems.oversampleItems[pv.overSample]);
  const upRate = upFold * pv.sampleRate;

  const rng = getRng(pv.seed + pv.channel);

  const durationSamples = upRate * pv.renderDuration;
  let sound = new Array(Math.floor(durationSamples)).fill(0);
  const nUnison = pv.nUnison;
  const unisonDetune = pv.unisonDetune / 100;
  const unisonPhase = pv.unisonPhase / nUnison;

  const nOsc = pv.nOsc;
  let oscData = [];
  for (let i = 0; i < nOsc; ++i) {
    const attackSamples = i === 0 ? 0 : upRate / 100;
    oscData.push({
      oscillatorType: pv[`osc${i}_oscillatorType`],
      envAttack: attackSamples,
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

  const EnvType = pv.envelopeType == 0 ? ExpDecay : SurgeEnvelope;

  const getOscillatorClass = (type) => {
    return type === 0 ? Oscillator
      : type === 1    ? OscillatorAa
      : type === 2    ? MagicOscillator
      : type === 3    ? OscillatorTriangleAa
                      : OscillatorSawtoothAa;
  };

  for (let unison = 0; unison < nUnison; ++unison) {
    const frequency = noteToFreq(pv.note + unison * unisonDetune);

    const osc = new Array(nOsc);
    const pmIndex = new Array(nOsc);
    for (let i = 0; i < nOsc; ++i) {
      const prm = oscData[i];

      const isMonoCarrier = (i === 0 && pv.enableMonoBass === 1);
      const voiceFreq = isMonoCarrier ? noteToFreq(pv.note) : frequency;
      const voicePhase = isMonoCarrier ? prm.sinPhase : prm.sinPhase + unison * unisonPhase * rng();

      const freqHz = voiceFreq * prm.freqNumerator / prm.freqDenominator;
      const OscType = getOscillatorClass(prm.oscillatorType);
      osc[i] = new OscBlock(
        OscType,
        EnvType,
        pv.integerPitch === 0 ? freqHz : Math.floor(freqHz),
        Math.floor(durationSamples * prm.envDuration),
        prm.envAttack,
        voicePhase,
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
      Oscillator,
      EnvType,
      frequency / pv.lfoFreqDenominator,
      Math.floor(durationSamples * pv.lfoDuration),
      pv.lfoPhase,
    );
    const lfoIndex = pv.lfoPmIndex;

    const fxMod = (m) => { return m; }; // Not implemented.

    const modHpf = new HP1(pv.modHpfCutoff / upRate);

    let subPhase = pv.subInvertPhase === 0 ? 0 : 0.5;
    const subOctave = 2 ** pv.subOscOctave;
    const subFreqNormalized = noteToFreq(pv.note) * subOctave / upRate;

    let carrierCleanPhase = 0;
    const carrierBaseFreq = noteToFreq(pv.note);
    const carrierPhaseInc
      = (carrierBaseFreq * oscData[0].freqNumerator / oscData[0].freqDenominator) / upRate;

    let feedback = 0;
    const last = osc.length - 1;
    const bypassEnvelopes = pv.bypassEnvelopes === 1;
    for (let i = 0; i < sound.length; ++i) {
      feedback = osc[last].process(upRate, pmIndex[last] * feedback);
      let buf = feedback;
      for (let j = osc.length - 2; j > 0; --j) {
        buf = osc[j].process(upRate, fxMod(pmIndex[j] * buf), bypassEnvelopes);
      }

      if (pv.modHpfCutoff > 0) { buf = modHpf.process(buf); }
      if (pv.asymModAmount * buf > 0) { buf *= (1.0 - Math.abs(pv.asymModAmount)); }

      const mod0 = pmIndex[0] * buf + lfoIndex * lfo.process(upRate, 0);
      const carrierOut = osc[0].process(upRate, fxMod(mod0), bypassEnvelopes);

      let subOut = 0;
      if (pv.subOscGain !== 0) {
        const phi = 2 * subPhase - 1;
        const phi_abs = Math.abs(phi);
        const theta = Math.PI * Math.sign(phi) * Math.pow(phi_abs, pv.subOscSkew);
        const subSin = Math.sin(theta);

        const j0 = besselJ0(mod0);
        const loss = 1.0 - Math.min(1.0, Math.max(-1.0, j0));
        const lossMixed = 1.0 + pv.subOscBesselComp * (loss - 1.0);

        subOut = pv.subOscGain * lossMixed * osc[0].lastEnvVal * subSin;

        subPhase += subFreqNormalized;
        subPhase -= Math.floor(subPhase);
      }

      carrierCleanPhase += carrierPhaseInc;
      carrierCleanPhase -= Math.floor(carrierCleanPhase);

      sound[i] += carrierOut + subOut;
    }
  }

  // Post effect.
  let gainEnv = 1;
  let decay = Math.pow(pv.decayTo, 1.0 / sound.length);
  for (let i = 0; i < sound.length; ++i) {
    sound[i] *= gainEnv;
    gainEnv *= decay;
  }

  const T = Math.max(1, Math.min(Math.round(pv.lorDuration * durationSamples), sound.length));
  const a = pv.lorWidth;
  const lorEnvelope = generateLorentzian(T, a);
  for (let i = 0; i < T; ++i) { sound[i] += sound[i] * lorEnvelope[i] * pv.lorGain; }

  if (upFold > 1) { sound = downSampleIIR(sound, upFold); }

  postMessage({sound: sound});
};
