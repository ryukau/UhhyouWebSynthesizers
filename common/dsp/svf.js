// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {clamp} from "../util.js";

const minCutoff = 0.00001;
const nyquist = 0.49998;
const minQ = 0.001;

class Butterworth2NormalizedBase {
  constructor(cutoffNormalized) {
    this.reset();
    this.setCutoff(cutoffNormalized);
  }

  reset() { this.ic1 = this.ic2 = 0; }

  setCutoff(cutoffNormalized) {
    const fc = Math.max(minCutoff, Math.min(cutoffNormalized, nyquist));
    const g = (this.g = Math.tan(fc * Math.PI));
    const g2 = g * g;
    const gain = Math.sqrt((g2 + Math.SQRT2 * g + 1) / this.gainDenominator(g, g2));
    this.gain = Math.min(gain, 100);
  }

  process(v0) {
    const s = v0 * this.gain;
    const v1 = (this.ic1 + this.g * (s - this.ic2)) / (1 + this.g * (this.g + Math.SQRT2));
    const v2 = this.ic2 + this.g * v1;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    return this.mixOutput(s, v1, v2);
  }
}

class Butterworth2NormalizedShelfBase extends Butterworth2NormalizedBase {
  constructor(cutoffNormalized, shelvingGainAmp = 1) {
    super();
    this.setParams(cutoffNormalized, shelvingGainAmp);
  }

  setParams(cutoffNormalized, shelvingGainAmp = 1) {
    const fc = Math.max(minCutoff, Math.min(cutoffNormalized, nyquist));
    const A = (this.A = Math.sqrt(Math.max(shelvingGainAmp, 0)));
    const g = (this.g = this.calcG(Math.tan(fc * Math.PI), Math.sqrt(A)));
    const g2 = g * g;

    const denLP = g2 + Math.SQRT1_2 * g;
    const denHP = Math.SQRT1_2 * g + 1;
    const A4 = A * A * A * A;

    const gain = Math.sqrt((g2 + Math.SQRT2 * g + 1) / this.shelvingDenominator(denLP, denHP, A4));
    this.gain = Math.min(gain, 100);
  }
}

export class Butterworth2NormalizedLowpass extends Butterworth2NormalizedBase {
  gainDenominator(g, g2) { return g2 + Math.SQRT1_2 * g; }
  mixOutput(s, v1, v2) { return v2; }
}

export class Butterworth2NormalizedHighpass extends Butterworth2NormalizedBase {
  gainDenominator(g, g2) { return Math.SQRT1_2 * g + 1; }
  mixOutput(s, v1, v2) { return s - Math.SQRT2 * v1 - v2; }
}

export class Butterworth2NormalizedBandpass extends Butterworth2NormalizedBase {
  gainDenominator(g, g2) { return Math.SQRT1_2 * g; }
  mixOutput(s, v1, v2) { return v1; }
}

export class Butterworth2NormalizedNotch extends Butterworth2NormalizedBase {
  gainDenominator(g, g2) { return g2 + 1; }
  mixOutput(s, v1, v2) { return s - Math.SQRT2 * v1; }
}

export class Butterworth2NormalizedLowShelf extends Butterworth2NormalizedShelfBase {
  calcG(tan, sqrtA) { return tan / sqrtA; }
  shelvingDenominator(denLP, denHP, A4) { return A4 * denLP + denHP; }
  mixOutput(s, v1, v2) { return s + (this.A - 1) * Math.SQRT2 * v1 + (this.A * this.A - 1) * v2; }
}

export class Butterworth2NormalizedHighShelf extends Butterworth2NormalizedShelfBase {
  calcG(tan, sqrtA) { return tan * sqrtA; }
  shelvingDenominator(denLP, denHP, A4) { return denLP + A4 * denHP; }
  mixOutput(s, v1, v2) {
    const A2 = this.A * this.A;
    return A2 * (s - Math.SQRT2 * v1 - v2) + this.A * Math.SQRT2 * v1 + v2;
  }
}

class SvfNormalizedBase {
  constructor(cutoffNormalized, Q = Math.SQRT1_2) {
    this.reset();
    this.setParams(cutoffNormalized, Q);
  }

  reset() { this.ic1 = this.ic2 = 0; }

  /**
   * Sets filter cutoff, Q, and an optional transient burst length.
   *
   * @param {number} cutoffNormalized - Normalized cutoff frequency fc = cutoffHz / sampleRate.
   * @param {number} [Q=Math.SQRT1_2] - Filter resonance quality factor.
   * @param {number} [burstLengthSamples=Infinity] - Duration of excitation burst in samples.
   *        When finite, compensates for transient truncation / rise time lag at high Q.
   */
  setParams(cutoffNormalized, Q = Math.SQRT1_2, burstLengthSamples = Infinity) {
    const fc = Math.max(minCutoff, Math.min(cutoffNormalized, nyquist));
    this.Q = Math.max(minQ, Q);
    this.k = 1 / this.Q;
    const g = (this.g = Math.tan(fc * Math.PI));
    const g2 = g * g;

    const num = g2 + this.k * g + 1;
    const den = this.gainDenominator(g, g2, this.Q, this.k);
    let gain = Math.sqrt(num / den);

    if (Number.isFinite(burstLengthSamples) && burstLengthSamples > 0) {
      const tau = this.Q / (Math.PI * fc);
      const burstFactor = Math.sqrt(1.0 + tau / burstLengthSamples);
      gain *= burstFactor;
    }

    this.gain = Math.min(gain, 100);
  }

  setParamsConstantQ(cutoffNormalized, Q = Math.SQRT1_2) {
    const fc = Math.max(minCutoff, Math.min(cutoffNormalized, nyquist));
    this.Q = Math.max(minQ, Q);
    this.k = 1 / this.Q;
    const g = (this.g = Math.tan(fc * Math.PI));
    const g2 = g * g;

    const num = g2 + Math.SQRT2 * g + 1;
    const den = this.gainDenominator(g, g2, Math.SQRT1_2, Math.SQRT2);
    const gain = Math.sqrt(num / den);
    this.gain = Math.min(gain, 100);
  }

  process(v0) {
    const s = v0 * this.gain;
    const v1 = (this.ic1 + this.g * (s - this.ic2)) / (1 + this.g * (this.g + this.k));
    const v2 = this.ic2 + this.g * v1;

    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;

    return this.mixOutput(s, v1, v2);
  }
}

export class SvfNormalizedLowpass extends SvfNormalizedBase {
  gainDenominator(g, g2, Q, k) { return g2 + Q * g; }
  mixOutput(s, v1, v2) { return v2; }
}

export class SvfNormalizedHighpass extends SvfNormalizedBase {
  gainDenominator(g, g2, Q, k) { return Q * g + 1; }
  mixOutput(s, v1, v2) { return s - this.k * v1 - v2; }
}

export class SvfNormalizedBandpass extends SvfNormalizedBase {
  gainDenominator(g, g2, Q, k) { return Q * g; }
  mixOutput(s, v1, v2) { return v1; }
}

export class SvfNormalizedNotch extends SvfNormalizedBase {
  gainDenominator(g, g2, Q, k) { return g2 + 1; }
  mixOutput(s, v1, v2) { return s - this.k * v1; }
}

/**
Translation of SVF in Faust filter.lib.
https://faustlibraries.grame.fr/libs/filters/#svf-filters
*/
export class SVF {
  #ic1eq = 0;
  #ic2eq = 0;

  #g;
  #k;

  // cutoffNormalized = cutoffHz / sampleRate.
  constructor(cutoffNormalized, Q) { this.setCutoff(cutoffNormalized, Q); }

  setCutoff(cutoffNormalized, Q) {
    this.#g = Math.tan(clamp(cutoffNormalized, minCutoff, nyquist) * Math.PI);
    this.#k = 1 / Q;
  }

  reset() {
    this.#ic1eq = 0;
    this.#ic2eq = 0;
  }

  tick(v0) {
    const v1 = (this.#ic1eq + this.#g * (v0 - this.#ic2eq)) / (1 + this.#g * (this.#g + this.#k));
    const v2 = this.#ic2eq + this.#g * v1;

    this.#ic1eq = 2 * v1 - this.#ic1eq;
    this.#ic2eq = 2 * v2 - this.#ic2eq;

    return [v1, v2];
  }

  lp(v0) {
    const [_, v2] = this.tick(v0);
    return v2;
  }

  bp(v0) {
    const [v1, _] = this.tick(v0);
    return v1;
  }

  hp(v0) {
    const [v1, v2] = this.tick(v0);
    return v0 - this.#k * v1 - v2;
  }

  notch(v0) {
    const [v1, _] = this.tick(v0);
    return v0 - this.#k * v1;
  }

  peak(v0) {
    const [v1, v2] = this.tick(v0);
    return v0 - this.#k * v1 - 2 * v2;
  }

  ap(v0) {
    const [v1, v2] = this.tick(v0);
    return v0 - 2 * this.#k * v1;
  }
}

export class SVFLP extends SVF {
  process(v0) { return this.lp(v0); }
  processMod(v0, cutoffNormalized, Q) {
    this.setCutoff(cutoffNormalized, Q);
    return this.process(v0);
  }
}

export class SVFHP extends SVF {
  process(v0) { return this.hp(v0); }
  processMod(v0, cutoffNormalized, Q) {
    this.setCutoff(cutoffNormalized, Q);
    return this.process(v0);
  }
}

export class SVFBP extends SVF {
  process(v0) { return this.bp(v0); }
  processMod(v0, cutoffNormalized, Q) {
    this.setCutoff(cutoffNormalized, Q);
    return this.process(v0);
  }
}

export class SVFAP extends SVF {
  process(v0) { return this.ap(v0); }
  processMod(v0, cutoffNormalized, Q) {
    this.setCutoff(cutoffNormalized, Q);
    return this.process(v0);
  }
}

export class SVFNotch extends SVF {
  process(v0) { return this.notch(v0); }
  processMod(v0, cutoffNormalized, Q) {
    this.setCutoff(cutoffNormalized, Q);
    return this.process(v0);
  }
}

export class SVFBell {
  #ic1eq = 0;
  #ic2eq = 0;

  #g;
  #k;
  #A;

  constructor(cutoffNormalized, Q, shelvingGainAmp) {
    this.setCutoff(cutoffNormalized, Q, shelvingGainAmp);
  }

  reset() {
    this.#ic1eq = 0;
    this.#ic2eq = 0;
  }

  setCutoff(cutoffNormalized, Q, shelvingGainAmp) {
    this.#A = shelvingGainAmp;
    this.#g = Math.tan(clamp(cutoffNormalized, minCutoff, nyquist) * Math.PI);
    this.#k = 1 / (Q * this.#A);
  }

  process(v0) {
    const v1 = (this.#ic1eq + this.#g * (v0 - this.#ic2eq)) / (1 + this.#g * (this.#g + this.#k));
    const v2 = this.#ic2eq + this.#g * v1;

    this.#ic1eq = 2 * v1 - this.#ic1eq;
    this.#ic2eq = 2 * v2 - this.#ic2eq;

    return v0 + this.#k * (this.#A * this.#A - 1) * v1;
  }
}

export class SVFLowShelf {
  #ic1eq = 0;
  #ic2eq = 0;

  #g;
  #k;
  #A;

  constructor(cutoffNormalized, Q, shelvingGainAmp) {
    this.setCutoff(cutoffNormalized, Q, shelvingGainAmp);
  }

  reset() {
    this.#ic1eq = 0;
    this.#ic2eq = 0;
  }

  setCutoff(cutoffNormalized, Q, shelvingGainAmp) {
    this.#A = Math.sqrt(shelvingGainAmp);
    this.#g = Math.tan(clamp(cutoffNormalized, minCutoff, nyquist) * Math.PI) / Math.sqrt(this.#A);
    this.#k = 1 / Q;
  }

  process(v0) {
    const v1 = (this.#ic1eq + this.#g * (v0 - this.#ic2eq)) / (1 + this.#g * (this.#g + this.#k));
    const v2 = this.#ic2eq + this.#g * v1;

    this.#ic1eq = 2 * v1 - this.#ic1eq;
    this.#ic2eq = 2 * v2 - this.#ic2eq;

    return v0 + (this.#A - 1) * this.#k * v1 + (this.#A * this.#A - 1) * v2;
  }
}

export class SVFHighShelf {
  #ic1eq = 0;
  #ic2eq = 0;

  #g;
  #k;
  #A;

  constructor(cutoffNormalized, Q, shelvingGainAmp) {
    this.setCutoff(cutoffNormalized, Q, shelvingGainAmp);
  }

  reset() {
    this.#ic1eq = 0;
    this.#ic2eq = 0;
  }

  setCutoff(cutoffNormalized, Q, shelvingGainAmp) {
    this.#A = Math.sqrt(shelvingGainAmp);
    this.#g = Math.tan(clamp(cutoffNormalized, minCutoff, nyquist) * Math.PI) * Math.sqrt(this.#A);
    this.#k = 1 / Q;
  }

  process(v0) {
    const v1 = (this.#ic1eq + this.#g * (v0 - this.#ic2eq)) / (1 + this.#g * (this.#g + this.#k));
    const v2 = this.#ic2eq + this.#g * v1;

    this.#ic1eq = 2 * v1 - this.#ic1eq;
    this.#ic2eq = 2 * v2 - this.#ic2eq;

    return this.#A * this.#A * (v0 - this.#k * v1 - v2) + this.#A * this.#k * v1 + v2;
  }
}

/**
This is for audio-rate modulation. If cutoff is static, use the ones in `sos.js`.
*/
export class MatchedBiquad {
  #x1 = 0;
  #x2 = 0;
  #y1 = 0;
  #y2 = 0;

  constructor() { this.reset(); }

  reset() {
    this.#x1 = 0;
    this.#x2 = 0;
    this.#y1 = 0;
    this.#y2 = 0;
  }

  #preProcess(cutoffNormalized, Q) {
    const ω0 = 2 * Math.PI * clamp(cutoffNormalized, minCutoff, nyquist);
    const q = 0.5 / Q;
    const a1 = -2 * Math.exp(-q * ω0)
      * (q <= 1 ? Math.cos(Math.sqrt(1 - q * q) * ω0) : Math.cosh(Math.sqrt(q * q - 1) * ω0));
    const a2 = Math.exp(-2 * q * ω0);
    return [ω0, a1, a2];
  }

  #postProcess(x0, b0, b1, b2, a1, a2) {
    const y0 = b0 * x0 + b1 * this.#x1 + b2 * this.#x2 - a1 * this.#y1 - a2 * this.#y2;
    this.#x2 = this.#x1;
    this.#x1 = x0;
    this.#y2 = this.#y1;
    this.#y1 = y0;
    return y0;
  }

  lp(x0, cutoffNormalized, Q) {
    const [ω0, a1, a2] = this.#preProcess(cutoffNormalized, Q);

    const r0 = 1 + a1 + a2;
    const ωQ = ω0 / Q;
    const one_ωω = 1 - ω0 * ω0;
    const r1 = ω0 * ω0 * (1 - a1 + a2) / Math.sqrt(one_ωω * one_ωω + ωQ * ωQ);

    const b0 = 0.5 * (r0 + r1);
    const b1 = r0 - b0;

    const y0 = b0 * x0 + b1 * this.#x1 - a1 * this.#y1 - a2 * this.#y2;
    this.#x1 = x0;
    this.#y2 = this.#y1;
    this.#y1 = y0;
    return y0;
  }

  hp(x0, cutoffNormalized, Q) {
    const [ω0, a1, a2] = this.#preProcess(cutoffNormalized, Q);

    const ωQ = ω0 / Q;
    const one_ωω = 1 - ω0 * ω0;
    const r1 = (1 - a1 + a2) / Math.sqrt(one_ωω * one_ωω + ωQ * ωQ);

    const b0 = 0.25 * r1;
    const b1 = -2 * b0;

    return this.#postProcess(x0, b0, b1, b0, a1, a2);
  }

  bp(x0, cutoffNormalized, Q) {
    const [ω0, a1, a2] = this.#preProcess(cutoffNormalized, Q);

    const r0 = (1 + a1 + a2) / (ω0 * Q);
    const ωQ = ω0 / Q;
    const one_ωω = 1 - ω0 * ω0;
    const r1 = ωQ * (1 - a1 + a2) / Math.sqrt(one_ωω * one_ωω + ωQ * ωQ);

    const b0 = 0.5 * r0 + 0.25 * r1;
    const b1 = -0.5 * r1;
    const b2 = -b0 - b1;

    return this.#postProcess(x0, b0, b1, b2, a1, a2);
  }
}

export class BiquadResonator {
  #x1 = 0;
  #x2 = 0;
  #y1 = 0;
  #y2 = 0;

  constructor() { this.reset(); }

  reset() {
    this.#x1 = 0;
    this.#x2 = 0;
    this.#y1 = 0;
    this.#y2 = 0;
  }

  // `resonance` in [0, 1).
  process(x0, cutoffNormalized, resonance) {
    const R = resonance;
    const b0 = (1 - R * R) * 0.5;
    const a1 = -2 * R * Math.cos(2 * Math.PI * cutoffNormalized);
    const a2 = R * R;

    const y0 = b0 * x0 - b0 * this.#x2 - a1 * this.#y1 - a2 * this.#y2;
    this.#x2 = this.#x1;
    this.#x1 = x0;
    this.#y2 = this.#y1;
    this.#y1 = y0;
    return y0;
  }
}

export class BiquadResonatorLattice {
  #a = 0;
  #b = 0;

  reset() {
    this.#a = 0;
    this.#b = 0;
  }

  // `resonance` R in [0, 1), `cutoffNormalized` in [0, 0.5].
  process(x0, cutoffNormalized, resonance) {
    const R = clamp(resonance, 0, 0.999999);
    const k2 = R * R;
    const c2 = Math.sqrt(1 - k2 * k2);
    const k1 = -2 * R * Math.cos(2 * Math.PI * clamp(cutoffNormalized, 0, 0.5)) / (1 + k2);
    const c1 = Math.sqrt(1 - k1 * k1);

    const f1 = c2 * x0 - k2 * this.#b;
    const y0 = ((1 - k2) * x0 - c2 * this.#b) * 0.5;

    this.#b = k1 * f1 + c1 * this.#a;
    this.#a = c1 * f1 - k1 * this.#a;

    return y0;
  }

  // `decaySamples` is the T60 decay time in samples (time to decay by 60 dB).
  processDecay(x0, cutoffNormalized, decaySamples) {
    const d = Math.max(1, decaySamples);
    return this.process(x0, cutoffNormalized, Math.exp(-3 * Math.LN10 / d));
  }

  // Constant Q. `u` in [0, 1].
  process4(x0, cutoffNormalized, u, minQ = 0.5, maxQ = 100.0) {
    const clampedU = clamp(u, 0, 1);
    const q = minQ * Math.pow(maxQ / minQ, clampedU);
    const resonance = Math.exp(-Math.PI * clamp(cutoffNormalized, 0, 0.5) / q);
    return this.process(x0, cutoffNormalized, resonance);
  }
}

// Complex transfer function:
//
// ```
//         1
// H(z) = ---------------
//         1 - a1 * z^-1
// ```
//
// Real part transfer function:
//
// ```
//         1 - (a1im + a1re) * z^-1
// H(z) = -----------------------------------------------------
//         1 -      2 * a1re * z^-1 + (a1re^2 + a1im^2) * z^-2
// ```
//
// Imaginary part transfer function:
//
// ```
//         1 + (a1im - a1re) * z^-1
// H(z) = -----------------------------------------------------
//         1 -      2 * a1re * z^-1 + (a1re^2 + a1im^2) * z^-2
// ```
export class ComplexResonator {
  #y = {re: 0, im: 0};
  #out = {re: 0, im: 0};

  reset() {
    this.#y = {re: 0, im: 0};
    this.#out = {re: 0, im: 0};
  }

  // `resonance` in [0, 1).
  process(x0, cutoff, R) {
    const w = 2 * Math.PI * clamp(cutoff, 0, 0.5);
    const ar = R * Math.cos(w);
    const ai = R * Math.sin(w);
    const {re: yr, im: yi} = this.#y;

    this.#y.re = x0 + ar * yr - ai * yi;
    this.#y.im = x0 + ar * yi + ai * yr;
    return this.#y;
  }

  processNormalized(x0, cutoff, R) {
    const {re, im} = this.process(x0, cutoff, R);
    const g = Math.SQRT2 * (1 - R);
    this.#out.re = g * re;
    this.#out.im = g * im;
    return this.#out;
  }
}

export class ComplexResonatorLattice {
  #out = {re: 0, im: 0};
  #lb0 = 0;
  #lb1 = 0;

  reset() {
    this.#out = {re: 0, im: 0};
    this.#lb0 = this.#lb1 = 0;
  }

  processLattice(x0, cutoff, R, gain = 1) {
    const w = 2 * Math.PI * clamp(cutoff, 0, 0.5);
    const cs = Math.cos(w);
    const sn = Math.sin(w);
    const k1 = -2 * R * cs / (1 + R * R);
    const f0 = x0 - R * R * this.#lb1 - k1 * this.#lb0;

    this.#out.re = gain * (f0 - R * (cs + sn) * this.#lb0);
    this.#out.im = gain * (f0 + R * (sn - cs) * this.#lb0);
    this.#lb1 = k1 * f0 + this.#lb0;
    this.#lb0 = f0;

    return this.#out;
  }

  processLatticeNormalized(x0, cutoff, R) {
    return this.processLattice(x0, cutoff, R, Math.SQRT2 * (1 - R));
  }
}
