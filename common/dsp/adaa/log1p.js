// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

export class Log1pAdaa1 {
  constructor() { this.x1_ = 0.0; }
  reset() { this.x1_ = 0.0; }

  process(input) {
    const x0 = this.x1_;
    const x1 = input;
    this.x1_ = input;

    const sign = v => (v > 0) - (v < 0);

    if (x0 === x1) { return sign(x0) * Math.log1p(Math.abs(x0)); }

    const a = Math.abs(x0);
    const b = Math.abs(x1);
    if (a === b) { return 0.0; }

    const M = Math.max(a, b);
    const crosses_zero = (x0 < 0.0 && x1 > 0.0) || (x1 < 0.0 && x0 > 0.0);

    if (M < 1e-11) {
      const ab = a * b;
      const sum_sq = a * a + (b * b + ab);
      if (!crosses_zero) {
        const s = sign(x0 !== 0.0 ? x0 : x1);
        return s * (0.5 * (a + b) - sum_sq / 6.0);
      } else {
        const s_diff = sign(x1);
        return s_diff * (b - a) * (0.5 - sum_sq / (6.0 * (a + b)));
      }
    }

    let z;
    if (M > 1e300) {
      z = ((a - b) / M) / ((2.0 / M) + (a / M) + (b / M));
    } else {
      z = (a - b) / (2.0 + a + b);
    }

    const z2 = z * z;
    let v_z;
    if (z2 < 0.25) {
      let v = 2.40298150589905612e-01;
      v = v * z2 - 1.94731672925457788e-01;
      v = v * z2 + 1.73909068024243885e-01;
      v = v * z2 - 4.88588950353995542e-03;
      v = v * z2 + 5.94376329102292572e-02;
      v = v * z2 + 5.06048025901778900e-02;
      v = v * z2 + 5.90709584871743007e-02;
      v = v * z2 + 6.66451861439532611e-02;
      v = v * z2 + 7.69243836941193443e-02;
      v = v * z2 + 9.09090368534659632e-02;
      v = v * z2 + 1.11111112555470432e-01;
      v = v * z2 + 1.42857142834278750e-01;
      v = v * z2 + 2.00000000000183115e-01;
      v = v * z2 + 3.33333333333332815e-01;
      v_z = v * z2;
    } else {
      const arctanh_z = 0.5 * (Math.log1p(a) - Math.log1p(b));
      v_z = arctanh_z / z - 1.0;
    }

    const g_pos = 0.5 * (Math.log1p(a) + Math.log1p(b)) + v_z;

    if (!crosses_zero) {
      const s = sign(x0 !== 0.0 ? x0 : x1);
      return s * g_pos;
    }
    let factor;
    if (M > 1e300) {
      factor = ((a - b) / M) / ((x0 / M) - (x1 / M));
    } else {
      factor = (a - b) / (x0 - x1);
    }
    return g_pos * factor;
  }
}
