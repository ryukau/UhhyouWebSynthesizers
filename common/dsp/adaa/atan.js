export class AtanAdaa1 {
  constructor() { this.x1_ = 0.0; }
  reset() { this.x1_ = 0.0; }

  process(input) {
    const x0 = this.x1_;
    this.x1_ = input;
    return AtanAdaa1.compute_y_atan_1(x0, input);
  }

  static log1p_sq(x) {
    if (x > 1e150) { return 2.0 * Math.log(x) + Math.log1p(1.0 / (x * x)); }
    return x > 0.0 ? Math.log1p(x * x) : 0.0;
  }

  static compute_y_atan_1(x0, x1) {
    const a_abs = Math.abs(x0);
    const b_abs = Math.abs(x1);
    const a = Math.min(a_abs, b_abs);
    const b = Math.max(a_abs, b_abs);

    if (b < 1e-9) { return 0.5 * (x0 + x1); }

    if (x0 === x1) { return Math.atan(x0); }

    const delta = b - a;
    let avg_pos;

    if (delta === 0.0) {
      avg_pos = Math.atan(a);
    } else if (delta < 0.005) {
      const mid = 0.5 * (a + b);
      const mid_sq = mid * mid;
      const scale_sq = 1.0 + mid_sq;

      const inv_scale_sq = 1.0 / scale_sq;
      const inv_scale_sq2 = inv_scale_sq * inv_scale_sq;

      const m_inv = mid * inv_scale_sq2;
      const t2 = m_inv * (-1.0 / 12.0);
      const t4 = m_inv * (1.0 - mid_sq) * (inv_scale_sq2 * (1.0 / 80.0));

      const delta_sq = delta * delta;
      avg_pos = Math.atan(mid) + delta_sq * (t2 + delta_sq * t4);
    } else {
      let u;
      if (b > 1e150) {
        if (a > 1e300 / b) {
          u = 1.0 / a - 1.0 / b;
        } else {
          u = delta / (1.0 + a * b);
        }
      } else {
        u = delta / (1.0 + a * b);
      }

      let v;
      if (a > 1e150) {
        v = (delta / a) * (1.0 + b / a);
      } else {
        v = delta * (a + b) / (1.0 + a * a);
      }

      let log1p_v;
      if (v < 1e100) {
        log1p_v = Math.log1p(v);
      } else {
        log1p_v = AtanAdaa1.log1p_sq(b) - AtanAdaa1.log1p_sq(a);
      }

      const inv_delta = 1.0 / delta;
      avg_pos = Math.atan(b) + (a * Math.atan(u) - 0.5 * log1p_v) * inv_delta;
    }

    if (x0 >= 0.0 && x1 >= 0.0) { return avg_pos; }
    if (x0 <= 0.0 && x1 <= 0.0) { return -avg_pos; }

    let multiplier;
    if (b > 0.8e308) {
      multiplier = (x0 * 0.5 + x1 * 0.5) / (a_abs * 0.5 + b_abs * 0.5);
    } else {
      multiplier = (x0 + x1) / (a_abs + b_abs);
    }
    return multiplier * avg_pos;
  }
}
