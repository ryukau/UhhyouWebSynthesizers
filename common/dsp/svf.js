// Copyright 2022 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {clamp} from "../util.js";

const minCutoff = 0.00001;
const nyquist = 0.49998;

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
    const v1 = (this.#ic1eq + this.#g * (v0 - this.#ic2eq))
      / (1 + this.#g * (this.#g + this.#k));
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
}

export class SVFHP extends SVF {
  process(v0) { return this.hp(v0); }
}

export class SVFNotch extends SVF {
  process(v0) { return this.notch(v0); }
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
    this.#A = Math.sqrt(shelvingGainAmp);
    this.#g = Math.tan(clamp(cutoffNormalized, minCutoff, nyquist) * Math.PI);
    this.#k = 1 / Q / this.#A;
  }

  process(v0) {
    const v1 = (this.#ic1eq + this.#g * (v0 - this.#ic2eq))
      / (1 + this.#g * (this.#g + this.#k));
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
    this.#g = Math.tan(clamp(cutoffNormalized, minCutoff, nyquist) * Math.PI)
      / Math.sqrt(this.#A);
    this.#k = 1 / Q;
  }

  process(v0) {
    const v1 = (this.#ic1eq + this.#g * (v0 - this.#ic2eq))
      / (1 + this.#g * (this.#g + this.#k));
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
    this.#g = Math.tan(clamp(cutoffNormalized, minCutoff, nyquist) * Math.PI)
      * Math.sqrt(this.#A);
    this.#k = 1 / Q;
  }

  process(v0) {
    const v1 = (this.#ic1eq + this.#g * (v0 - this.#ic2eq))
      / (1 + this.#g * (this.#g + this.#k));
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
