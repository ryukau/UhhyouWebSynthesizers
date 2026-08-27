export class SawtoothAdaa1 {
  constructor() { this.x1_ = 0; }

  reset() { this.x1_ = 0; }

  process(input) {
    const x_a = this.x1_;
    const x_b = input;
    this.x1_ = input;

    const limit = Number.MAX_VALUE;
    if ((x_a < 0 && x_b > 0 && x_b > limit + x_a) || (x_a > 0 && x_b < 0 && x_b < -limit + x_a)) {
      return 0;
    }

    const diff = x_b - x_a;

    let k_a, x_aw;
    if (Math.abs(x_a) > Number.MAX_SAFE_INTEGER) {
      k_a = x_a * 0.5;
      x_aw = 0;
    } else {
      k_a = Math.floor(x_a * 0.5 + 0.5);
      x_aw = k_a * -2 + x_a;
    }

    let k_b, x_bw;
    if (Math.abs(x_b) > Number.MAX_SAFE_INTEGER) {
      k_b = x_b * 0.5;
      x_bw = 0;
    } else {
      k_b = Math.floor(x_b * 0.5 + 0.5);
      x_bw = k_b * -2 + x_b;
    }

    if (k_a === k_b || Math.abs(diff) < Number.EPSILON) {
      return 0.5 * (x_aw + x_bw);
    } else {
      return 0.5 * (x_bw - x_aw) * (x_bw + x_aw) / diff;
    }
  }
}
