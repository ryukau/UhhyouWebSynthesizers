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

  // normalizedFreq = cutoffHz / sampleRate.
  constructor(normalizedFreq, Q) { this.setCutoff(normalizedFreq, Q); }

  setCutoff(normalizedFreq, Q) {
    this.#g = Math.tan(clamp(normalizedFreq, minCutoff, nyquist) * Math.PI);
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

export class SVFBell {
  #ic1eq = 0;
  #ic2eq = 0;

  #g;
  #k;
  #A;

  constructor(normalizedFreq, Q, shelvingGainAmp) {
    this.setCutoff(normalizedFreq, Q, shelvingGainAmp);
  }

  reset() {
    this.#ic1eq = 0;
    this.#ic2eq = 0;
  }

  setCutoff(normalizedFreq, Q, shelvingGainAmp) {
    this.#A = Math.sqrt(shelvingGainAmp);
    this.#g = Math.tan(clamp(normalizedFreq, minCutoff, nyquist) * Math.PI);
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

  constructor(normalizedFreq, Q, shelvingGainAmp) {
    this.setCutoff(normalizedFreq, Q, shelvingGainAmp);
  }

  reset() {
    this.#ic1eq = 0;
    this.#ic2eq = 0;
  }

  setCutoff(normalizedFreq, Q, shelvingGainAmp) {
    this.#A = Math.sqrt(shelvingGainAmp);
    this.#g = Math.tan(clamp(normalizedFreq, minCutoff, nyquist) * Math.PI)
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

  constructor(normalizedFreq, Q, shelvingGainAmp) {
    this.setCutoff(normalizedFreq, Q, shelvingGainAmp);
  }

  reset() {
    this.#ic1eq = 0;
    this.#ic2eq = 0;
  }

  setCutoff(normalizedFreq, Q, shelvingGainAmp) {
    this.#A = Math.sqrt(shelvingGainAmp);
    this.#g = Math.tan(clamp(normalizedFreq, minCutoff, nyquist) * Math.PI)
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
