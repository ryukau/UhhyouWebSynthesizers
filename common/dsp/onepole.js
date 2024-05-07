// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

/*
Details are written in:
https://ryukau.github.io/filter_notes/one_pole_lowpass/one_pole_lowpass.html
*/

import {clamp} from "../util.js";

const minCutoff = 0.00001;
const nyquist = 0.49998;

export class LP1 {
  #bn = 1;
  #a1 = -1; // Negated.
  #x1 = 0;
  #y1 = 0;

  constructor(cutoffNormalized) { this.setCutoff(cutoffNormalized); }

  reset() {
    this.#x1 = 0;
    this.#y1 = 0;
  }

  setCutoff(cutoffNormalized) {
    const k = 1 / Math.tan(Math.PI * clamp(cutoffNormalized, minCutoff, nyquist));
    const a0 = 1 + k;
    this.#bn = 1 / a0;
    this.#a1 = (k - 1) / a0; // Negated.
  }

  process(x0) {
    this.#y1 = this.#bn * (x0 + this.#x1) + this.#a1 * this.#y1;
    this.#x1 = x0;
    return this.#y1;
  }
}

export class HP1 {
  #b0 = 1;
  #a1 = 1;
  #x1 = 0;
  #y1 = 0;

  constructor(cutoffNormalized) { this.setCutoff(cutoffNormalized); }

  reset() {
    this.#x1 = 0;
    this.#y1 = 0;
  }

  setCutoff(cutoffNormalized) {
    const k = 1 / Math.tan(Math.PI * clamp(cutoffNormalized, minCutoff, nyquist));
    const a0 = 1 + k;
    this.#b0 = k / a0;
    this.#a1 = (1 - k) / a0;
  }

  process(x0) {
    this.#y1 = this.#b0 * (x0 - this.#x1) - this.#a1 * this.#y1;
    this.#x1 = x0;
    return this.#y1;
  }
}

export class AP1 {
  #a = 0;
  #x1 = 0;
  #y1 = 0;

  constructor(cutoffNormalized) { this.setCutoff(cutoffNormalized); }

  groupDelayAt(cutoffNormalized) {
    const omega = 2 * Math.PI * cutoffNormalized;
    const a2 = this.#a * this.#a;
    return (1 - a2) / (1 + 2 * this.#a * Math.cos(omega) + a2);
  }

  reset() {
    this.#x1 = 0;
    this.#y1 = 0;
  }

  setCutoff(cutoffNormalized) {
    const k = Math.tan(Math.PI * Math.min(cutoffNormalized, nyquist));
    this.#a = (k - 1) / (k + 1);
  }

  process(x0) {
    this.#y1 = this.#a * (x0 - this.#y1) + this.#x1;
    this.#x1 = x0;
    return this.#y1;
  }
}
