export class Cubicclip2bAdaa1 {
  #x1_ = 0.0;

  reset() { this.#x1_ = 0.0; }

  process(input) {
    const x0 = input;
    const x1 = this.#x1_;
    this.#x1_ = input;

    const inv3 = 1.0 / 3.0;
    const inv9 = 1.0 / 9.0;
    const inv27 = 1.0 / 27.0;
    const inv54 = 1.0 / 54.0;
    const inv108 = 1.0 / 108.0;

    const copysign = (mag, sign) => {
      const is_neg = sign < 0 || (sign === 0 && 1 / sign < 0);
      return is_neg ? -Math.abs(mag) : Math.abs(mag);
    };

    if (x0 === x1) {
      const z = Math.abs(x0);
      if (z >= 3.0) { return copysign(1.0, x0); }
      return ((inv27 * z - inv3) * z + 1.0) * x0;
    }

    const a = Math.min(x0, x1);
    const b = Math.max(x0, x1);

    if (b <= -3.0) { return -1.0; }
    if (a >= 3.0) { return 1.0; }

    if (a <= -3.0 && b >= 3.0) {
      const ha = 0.5 * a;
      const hb = 0.5 * b;
      const s = hb + ha;
      const e = (Math.abs(hb) > Math.abs(ha)) ? (ha - (s - hb)) : (hb - (s - ha));
      return (s + e) / (hb - ha);
    }

    // Fast-path: Both inputs are entirely within the active region [-3, 3]
    if (a >= -3.0 && b <= 3.0) {
      const a2_plus_b2 = a * a + b * b;
      if (a * b >= 0.0) {
        const m = 0.5 * (a + b);
        return m * (a2_plus_b2 * inv54 + 1.0) - copysign(1.0, m) * (a * b + a2_plus_b2) * inv9;
      } else {
        const diff = b - a;
        const v2 = (-b * a + a2_plus_b2);
        const base = (a2_plus_b2 * inv108 + 0.5);
        return (b + a) * (base - (v2 * inv9) / diff);
      }
    }

    // Slow-path: Exactly one of the inputs is outside the [-3, 3] interval
    const diff = b - a;
    const p = Math.max(a, -3.0);
    const q = Math.min(b, 3.0);
    const p2_q2 = p * p + q * q;

    let I_pq;
    if (p * q >= 0.0) {
      const m = 0.5 * (p + q);
      const I_pq_avg = m * (p2_q2 * inv54 + 1.0) - copysign(1.0, m) * (p * q + p2_q2) * inv9;
      I_pq = (q - p) * I_pq_avg;
    } else {
      const qp_diff = q - p;
      const v2 = (-q * p + p2_q2);
      const base = (p2_q2 * inv108 + 0.5);
      I_pq = (q + p) * (base * qp_diff - v2 * inv9);
    }

    // Safe handling of values near overflow limit
    const limit = 0.5 * Number.MAX_VALUE;
    if (b > limit || a < -limit) {
      const ha = 0.5 * a;
      const hb = 0.5 * b;
      const hp = 0.5 * p;
      const hq = 0.5 * q;
      const hdiff = hb - ha;
      return ((ha - hp) + 0.5 * I_pq + (hb - hq)) / hdiff;
    }

    return ((a - p) + I_pq + (b - q)) / diff;
  }
}
