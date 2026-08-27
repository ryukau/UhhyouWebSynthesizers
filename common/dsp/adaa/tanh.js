// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

export class TanhAdaa1 {
  constructor() { this.x1_ = 0.0; }
  reset() { this.x1_ = 0.0; }

  process(input) {
    const x0 = this.x1_;
    const x1 = input;
    this.x1_ = input;

    const x0_finite = Number.isFinite(x0);
    const x1_finite = Number.isFinite(x1);

    if (!x0_finite || !x1_finite) {
      if (Number.isNaN(x0) || Number.isNaN(x1)) { return NaN; }
      if (x0 === x1) { return Math.tanh(x0); }
      const inf = Infinity;
      if ((x0 === -inf && x1 === inf) || (x0 === inf && x1 === -inf)) { return 0.0; }
      if (x0 === -inf || x1 === -inf) { return -1.0; }
      return 1.0;
    }

    if (x0 === x1) { return Math.tanh(x0); }

    const abs_x0 = Math.abs(x0);
    const abs_x1 = Math.abs(x1);
    if (Math.max(abs_x0, abs_x1) < 1e-100) { return (x0 + x1) * 0.5; }

    const x1_half = x1 * 0.5;
    const x0_half = x0 * 0.5;
    const m = x1_half + x0_half;
    const h = x1_half - x0_half;

    let res;
    const abs_h = Math.abs(h);
    if (abs_h < 1e-4) {
      const tm = Math.tanh(m);
      const tm2 = -tm * tm + 1.0;
      const h2_3 = (h * h) * (1.0 / 3.0);
      res = tm * (-h2_3 * tm2 + 1.0);
    } else {
      const tm = Math.tanh(m);
      const th = Math.tanh(h);
      const z = tm * th;
      const abs_z = Math.abs(z);

      if (abs_z < 0.9) {
        res = Math.atanh(z) / h;
      } else {
        const LOG_COSH_THRESHOLD = 350.0;
        const term1 = (abs_x1 < LOG_COSH_THRESHOLD) ? Math.log1p(Math.exp(-2.0 * abs_x1)) : 0.0;
        const term2 = (abs_x0 < LOG_COSH_THRESHOLD) ? Math.log1p(Math.exp(-2.0 * abs_x0)) : 0.0;
        const diff = (abs_x1 - abs_x0) + (term1 - term2);
        res = (diff * 0.5) / h;
      }
    }

    return Math.max(-1.0, Math.min(1.0, res));
  }
}
