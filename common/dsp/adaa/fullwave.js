// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

export class FullwaveAdaa1_fast {
  constructor() { this.x1 = 0; }
  reset() { this.x1 = 0; }

  process(input) {
    const x_a = this.x1;
    const x_b = input;
    this.x1 = input;

    if (x_a >= 0 && x_b >= 0) { return 0.5 * (x_a + x_b); }
    if (x_a <= 0 && x_b <= 0) { return -0.5 * (x_a + x_b); }

    const min_x = Math.min(x_a, x_b);
    const max_x = Math.max(x_a, x_b);
    const abs_diff = max_x - min_x;

    const integral = 0.5 * (min_x * min_x + max_x * max_x);
    return integral / abs_diff;
  }
}

export class FullwaveAdaa1 {
  static #computeMaxSafe() {
    let val = 1.0;
    const limit = Number.MAX_VALUE / 4.0;
    while (val < limit / val) { val *= 2.0; }
    return val;
  }

  static #computeMinSafe() {
    let val = 1.0;
    const limit = Number.MIN_VALUE * 4.0;
    while (val > limit / val) { val /= 2.0; }
    return val;
  }

  static #MAX_SAFE = FullwaveAdaa1.#computeMaxSafe();
  static #MIN_SAFE = FullwaveAdaa1.#computeMinSafe();

  static #signbit(x) { return x < 0 || Object.is(x, -0); }
  static #fma(a, b, c) { return typeof Math.fma === 'function' ? Math.fma(a, b, c) : (a * b + c); }

  static #frexp(value) {
    if (value === 0 || !Number.isFinite(value)) { return [value, 0]; }
    let exp = Math.floor(Math.log2(value)) + 1;
    let frac = value * Math.pow(2, -exp);

    if (frac >= 1.0) {
      frac *= 0.5;
      exp += 1;
    } else if (frac < 0.5) {
      frac *= 2.0;
      exp -= 1;
    }
    return [frac, exp];
  }

  constructor() { this.x1 = 0; }
  reset() { this.x1 = 0; }

  process(input) {
    const x0 = input;
    const x1 = this.x1;
    this.x1 = input;

    const abs_x0 = Math.abs(x0);
    const abs_x1 = Math.abs(x1);
    const m = Math.max(abs_x0, abs_x1);

    if (m > FullwaveAdaa1.#MIN_SAFE && m < FullwaveAdaa1.#MAX_SAFE) {
      if (FullwaveAdaa1.#signbit(x0) === FullwaveAdaa1.#signbit(x1)) {
        return 0.5 * (abs_x0 + abs_x1);
      } else {
        const num = FullwaveAdaa1.#fma(abs_x0, abs_x0, abs_x1 * abs_x1);
        const den = 2.0 * (abs_x0 + abs_x1);
        return num / den;
      }
    }

    if (m === 0) { return 0; }

    if (!Number.isFinite(m)) {
      if (Number.isNaN(x0) || Number.isNaN(x1)) { return NaN; }
      return Infinity;
    }

    const [, e] = FullwaveAdaa1.#frexp(m);
    const scaleDown = Math.pow(2, -e);
    const scaleUp = Math.pow(2, e);

    const x0_s = x0 * scaleDown;
    const x1_s = x1 * scaleDown;

    let val = 0;
    if (FullwaveAdaa1.#signbit(x0) === FullwaveAdaa1.#signbit(x1)) {
      val = 0.5 * (Math.abs(x0_s) + Math.abs(x1_s));
    } else {
      const abs_x0_s = Math.abs(x0_s);
      const abs_x1_s = Math.abs(x1_s);
      const num = FullwaveAdaa1.#fma(abs_x0_s, abs_x0_s, abs_x1_s * abs_x1_s);
      const den = 2.0 * (abs_x0_s + abs_x1_s);
      val = num / den;
    }

    return val * scaleUp;
  }
}
