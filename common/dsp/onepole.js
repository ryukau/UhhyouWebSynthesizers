// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

/*
Details:
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

  processMod(x0, cutoffNormalized) {
    this.setCutoff(cutoffNormalized);
    return this.process(x0);
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

  processMod(x0, cutoffNormalized) {
    this.setCutoff(cutoffNormalized);
    return this.process(x0);
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

  processMod(x0, cutoffNormalized) {
    this.setCutoff(cutoffNormalized);
    return this.process(x0);
  }
}

export class AP1TPT {
  #s = 0;

  reset() { this.#s = 0; }

  // `cutoffNormalized` in [0, 0.5).
  processMod(x0, cutoffNormalized) {
    const fc = clamp(cutoffNormalized, minCutoff, nyquist);
    const xs = x0 - this.#s;
    this.#s += (2 * xs * fc) / ((1 / Math.PI) + fc);
    return this.#s - xs;
  }
}

// High-shelving.
export class HS1 {
  #b0 = 1;
  #a1 = 1;
  #gain = 1;
  #x1 = 0;
  #y1 = 0;

  constructor(cutoffNormalized, gain = 1) {
    this.setCutoff(cutoffNormalized);
    this.setGain(gain);
  }

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

  setGain(gain) { this.#gain = gain; }

  process(x0) {
    const hp = this.#b0 * (x0 - this.#x1) - this.#a1 * this.#y1;
    this.#x1 = x0;
    this.#y1 = hp;
    return x0 + (this.#gain - 1) * hp;
  }

  processMod(x0, cutoffNormalized, gain) {
    this.setCutoff(cutoffNormalized);
    this.setGain(gain);
    return this.process(x0);
  }
}

export class TiltFilter {
  #b0 = 1;
  #b1 = 0;
  #a1 = 0;
  #x1 = 0;
  #y1 = 0;

  constructor(cutoffNormalized = 0.1, tilt = 0) { this.set(cutoffNormalized, tilt); }

  reset() {
    this.#x1 = 0;
    this.#y1 = 0;
  }

  // `tilt = 0`: pass-through, `tilt > 0`: treble heavy, `tilt < 0`: bass heavy.
  set(cutoffNormalized, tiltDecibel, energyNormalization = false) {
    const g = Math.tan(Math.PI * clamp(cutoffNormalized, minCutoff, nyquist));
    const alpha = Math.exp(-tiltDecibel * 0.05 * Math.LN10);

    const invDenom = energyNormalization ? 1 / Math.sqrt((1 + g) * (1 + g * alpha * alpha))
                                         : 1 / ((1 + g) * Math.max(1, alpha));
    this.#b0 = (g * alpha + 1) * invDenom;
    this.#b1 = (g * alpha - 1) * invDenom;
    this.#a1 = (1 - g) / (1 + g); // Negated (-a1) for Direct Form I.
  }

  process(x0) {
    this.#y1 = this.#b0 * x0 + this.#b1 * this.#x1 + this.#a1 * this.#y1;
    this.#x1 = x0;
    return this.#y1;
  }
}

export class WidePeakingFilter {
  /**
  @param {number} cutoff - Normalized center frequency f0 in (0, 0.5) (i.e. f / fs).
  @param {number} bandWidth - Bandwidth in octaves.
  @param {number} gain - Linear peaking gain (1.0 = flat bypass).
  */
  constructor(cutoff, bandWidth, gain) {
    this.s1 = 0.0;
    this.s2 = 0.0;

    this.b0 = 1.0;
    this.b1 = 0.0;
    this.b2 = 0.0;
    this.a1 = 0.0;
    this.a2 = 0.0;

    this.update(cutoff, bandWidth, gain);
  }

  update(cutoff, bandWidth, gain) {
    const ratio = 2.0 ** (bandWidth * 0.5);
    const cutLow = clamp(cutoff * ratio, minCutoff, nyquist);
    const cutHigh = clamp(cutoff / ratio, minCutoff, nyquist);

    // LP1 coefficients.
    const kL = 1 / Math.tan(Math.PI * cutLow);
    const a0L = 1 + kL;
    const a1L = (kL - 1) / a0L;

    // HP1 coefficients.
    const kH = 1 / Math.tan(Math.PI * cutHigh);
    const a0H = 1 + kH;
    const a1H = (1 - kH) / a0H;

    // Denominator: (1 - a1L * z^-1) * (1 + a1H * z^-1)
    this.a1 = a1H - a1L;
    this.a2 = -a1L * a1H;

    const w0 = 2.0 * Math.PI * cutoff;
    const sn0 = Math.sin(w0);

    let b0Bp = 0.0;
    if (sn0 > 0.0) {
      const cos0 = Math.cos(w0);
      const dL = Math.sqrt(1.0 - 2.0 * a1L * cos0 + a1L * a1L);
      const dH = Math.sqrt(1.0 + 2.0 * a1H * cos0 + a1H * a1H);
      b0Bp = (dL * dH) / (2.0 * sn0);
    }

    const gDiff = gain - 1.0;

    this.b0 = 1.0 + gDiff * b0Bp;
    this.b1 = this.a1;
    this.b2 = this.a2 - gDiff * b0Bp;
  }

  reset() {
    this.s1 = 0.0;
    this.s2 = 0.0;
  }

  process(x) {
    const y = this.b0 * x + this.s1;
    this.s1 = this.b1 * x - this.a1 * y + this.s2;
    this.s2 = this.b2 * x - this.a2 * y;
    return y;
  }
}
