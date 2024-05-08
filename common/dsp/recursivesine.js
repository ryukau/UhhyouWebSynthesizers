// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

/*
TODO: Fast pitch bend, at least for QuadOsc. Other oscillators are unstable for frequency
modulation. Use lookup table.

Reference:
- Martin Vicanek, "A New Recursive Quadrature Oscillator", 21. October 2015.
  - https://www.vicanek.de/articles/QuadOsc.pdf
*/

import {clamp} from "../util.js";

// Output is sin.
export class BiquadOsc {
  // `freqNormalized` is in [0, 0.5).
  // `initialPhase` is in [0, 1).
  constructor(freqNormalized, initialPhase) {
    const omega = 2 * Math.PI * clamp(freqNormalized, 0, 0.4999);
    const phi = 2 * Math.PI * initialPhase;
    this.u1 = Math.sin(phi - omega);
    this.u2 = Math.sin(phi - 2 * omega);
    this.k = 2 * Math.cos(omega);
  }

  process() {
    const u0 = this.k * this.u1 - this.u2;
    this.u2 = this.u1;
    this.u1 = u0;
    return u0;
  }
}

// Output is sin.
export class ReinshcOsc {
  constructor(freqNormalized, initialPhase) {
    const omega = 2 * Math.PI * clamp(freqNormalized, 0, 0.4999);
    const phi = 2 * Math.PI * initialPhase;
    const A = 2 * Math.sin(omega / 2);
    this.u = Math.sin(phi - omega);
    this.v = A * Math.cos(phi - omega / 2);
    this.k = A * A;
  }

  process() {
    this.u = this.u + this.v;
    this.v = this.v - this.k * this.u;
    return this.u;
  }
}

// Output is cos.
export class DigialWaveguideOsc {
  constructor(freqNormalized, initialPhase) {
    const omega = 2 * Math.PI * clamp(freqNormalized, 0, 0.4999);
    const phi = 2 * Math.PI * initialPhase;
    const A = 2 * Math.sin(omega / 2);
    this.u = -Math.tan(omega / 2) * Math.sin(phi - omega);
    this.v = Math.cos(phi - omega);
    this.k = Math.cos(omega);
  }

  process() {
    const s = this.k * (this.u + this.v);
    const t = s + this.u;
    this.u = s - this.v;
    this.v = t;
    return this.v;
  }
}

// Output is cos.
export class QuadOscWithStaggeredUpdate {
  constructor(freqNormalized, initialPhase) {
    const omega = 2 * Math.PI * clamp(freqNormalized, 0, 0.4999);
    const phi = 2 * Math.PI * initialPhase;
    this.u = -Math.sin(omega) * Math.sin(phi - omega);
    this.v = Math.cos(phi - omega);
    this.k = Math.cos(omega);
  }

  process() {
    const t = this.v;
    this.v = this.u + this.k * this.v;
    this.u = this.k * this.v - t;
    return this.v;
  }
}

// Output is sin.
export class MagicCircleOsc {
  constructor(freqNormalized, initialPhase) {
    const omega = 2 * Math.PI * clamp(freqNormalized, 0, 0.4999);
    const phi = 2 * Math.PI * initialPhase;
    this.u = Math.cos(phi - omega * 3 / 2);
    this.v = Math.sin(phi - omega);
    this.k = 2 * Math.sin(omega / 2);
  }

  process() {
    this.u -= this.k * this.v;
    this.v += this.k * this.u;
    return this.v;
  }
}

// Considered unstable.
export class CoupledFormOsc {
  constructor(freqNormalized, initialPhase) {
    const omega = 2 * Math.PI * clamp(freqNormalized, 0, 0.4999);
    const phi = 2 * Math.PI * initialPhase;
    this.u = Math.cos(phi - omega);
    this.v = Math.sin(phi - omega);
    this.k1 = Math.cos(omega);
    this.k2 = Math.sin(omega);
  }

  #tick() {
    const u0 = this.u;
    const v0 = this.v;
    this.u = this.k1 * u0 - this.k2 * v0;
    this.v = this.k2 * u0 + this.k1 * v0;
  }

  process() { this.processSin(); }

  processSin() {
    this.#tick();
    return this.v;
  }

  processCos() {
    this.#tick();
    return this.u;
  }
}

// This one doesn't change amplitude on frequency modulation. However, naive frequency
// modulation is slow, because it needs to compute tan for `k1`, and sin for `k2`.
export class QuadOsc {
  constructor(freqNormalized, initialPhase) {
    const omega = 2 * Math.PI * clamp(freqNormalized, 0, 0.4999);
    const phi = 2 * Math.PI * initialPhase;

    this.u = Math.cos(phi - omega);
    this.v = Math.sin(phi - omega);

    this.k1 = Math.tan(omega / 2);
    this.k2 = Math.sin(omega);
  }

  #tick() {
    const w = this.u - this.k1 * this.v;
    this.v += this.k2 * w;
    this.u = w - this.k1 * this.v;
  }

  process() { this.processSin(); }

  processSin() {
    this.#tick();
    return this.v;
  }

  processCos() {
    this.#tick();
    return this.u;
  }

  processQuad() {
    this.#tick();
    return [this.u, this.v];
  }
}
