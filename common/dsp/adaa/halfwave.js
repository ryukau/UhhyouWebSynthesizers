// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

export class HalfwaveAdaa1_fast {
  constructor() { this.x1 = 0; }
  reset() { this.x1 = 0; }

  process(input) {
    const x_a = this.x1;
    const x_b = input;
    this.x1 = input;

    if (x_a <= 0 && x_b <= 0) { return 0; }
    if (x_a >= 0 && x_b >= 0) { return 0.5 * (x_a + x_b); }

    const min_x = Math.min(x_a, x_b);
    const max_x = Math.max(x_a, x_b);
    return (0.5 * max_x * max_x) / (max_x - min_x);
  }
}

export class HalfwaveAdaa1 {
  static #MIN_THRESHOLD = 1e-150;
  static #MULTIPLIER_UP = 2 ** 1022;
  static #MULTIPLIER_DOWN = 2 ** -1022;
  static #SHIFT_DOWN_MULTIPLIER = 2 ** -512;
  static #SHIFT_UP_MULTIPLIER = 2 ** 512;

  constructor() { this.x1 = 0; }
  reset() { this.x1 = 0; }

  process(input) {
    let x0 = input;
    let x1 = this.x1;
    this.x1 = input;

    const abs_x0 = Math.abs(x0);
    const abs_x1 = Math.abs(x1);
    const m = Math.max(abs_x0, abs_x1);

    const scale_needed = m < HalfwaveAdaa1.#MIN_THRESHOLD;
    if (scale_needed) {
      x0 *= HalfwaveAdaa1.#MULTIPLIER_UP;
      x1 *= HalfwaveAdaa1.#MULTIPLIER_UP;
    }

    let v = 0;
    const max_val = Math.max(x0, x1);
    const min_val = Math.min(x0, x1);

    if (max_val <= 0) {
      v = 0;
    } else if (min_val >= 0) {
      v = 0.5 * x0 + (0.5 * x1);
    } else {
      const a = max_val;
      const b = -min_val;

      if (a > Number.MAX_VALUE - b) {
        const a_s = a * HalfwaveAdaa1.#SHIFT_DOWN_MULTIPLIER;
        const b_s = b * HalfwaveAdaa1.#SHIFT_DOWN_MULTIPLIER;
        const denom = a_s + b_s;
        v = 0.5 * a_s * (a_s / denom) * HalfwaveAdaa1.#SHIFT_UP_MULTIPLIER;
      } else {
        const denom = a + b;
        v = 0.5 * a * (a / denom);
      }
    }

    if (scale_needed) { v *= HalfwaveAdaa1.#MULTIPLIER_DOWN; }

    return v;
  }
}
