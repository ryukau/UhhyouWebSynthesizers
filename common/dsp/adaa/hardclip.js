export class HardclipAdaa1_fast {
  constructor() { this.x1_ = 0.0; }

  reset() { this.x1_ = 0.0; }

  process(input) {
    const x_a = this.x1_;
    const x_b = input;
    this.x1_ = input;

    if (Math.abs(x_a) <= 1.0 && Math.abs(x_b) <= 1.0) { return 0.5 * (x_a + x_b); }
    if (x_a >= 1.0 && x_b >= 1.0) { return 1.0; }
    if (x_a <= -1.0 && x_b <= -1.0) { return -1.0; }

    const a = Math.min(x_a, x_b);
    const b = Math.max(x_a, x_b);
    const abs_diff = b - a;

    const p = Math.max(a, -1.0);
    const q = Math.min(b, 1.0);

    const I = (b - q) - (p - a) + 0.5 * (q - p) * (q + p);
    return I / abs_diff;
  }
}

export class HardclipAdaa1 {
  #threshold = 1e150;
  #scale = 2 ** -600; // 0x1.0p-600

  constructor() { this.x1_ = 0.0; }

  // Helper when one sample is in [-1, 1] and the other is above 1
  #process_one_inside_one_above_1(inside, above_1) {
    const a = inside;
    const b = above_1;
    const abs_diff = b - a;

    if (b > this.#threshold) {
      const as = a * this.#scale;
      const bs = b * this.#scale;
      const Is = (bs - this.#scale) + 0.5 * (1.0 - a) * (1.0 + a) * this.#scale;
      const Ds = bs - as;
      return Is / Ds;
    }

    const I = (b - 1.0) + 0.5 * (1.0 - a) * (1.0 + a);
    return I / abs_diff;
  }

  // Helper when one sample is in [-1, 1] and the other is below -1
  #process_one_inside_one_below_minus_1(inside, below_minus_1) {
    const a = below_minus_1;
    const b = inside;
    const abs_diff = b - a;

    if (a < -this.#threshold) {
      const as = a * this.#scale;
      const bs = b * this.#scale;
      const Is = (this.#scale + as) + 0.5 * (b + 1.0) * (b - 1.0) * this.#scale;
      const Ds = bs - as;
      return Is / Ds;
    }

    const I = (1.0 + a) + 0.5 * (b + 1.0) * (b - 1.0);
    return I / abs_diff;
  }

  // Helper when samples span across the entire [-1, 1] region
  #process_crossover(a, b) {
    const abs_diff = b - a;

    if (b > this.#threshold || a < -this.#threshold) {
      const as = a * this.#scale;
      const bs = b * this.#scale;
      const Is = bs + as;
      const Ds = bs - as;
      return Is / Ds;
    }

    const I = b + a;
    return I / abs_diff;
  }

  reset() { this.x1_ = 0.0; }

  process(input) {
    const x_a = this.x1_;
    const x_b = input;
    this.x1_ = input;

    const abs_a = Math.abs(x_a);

    if (abs_a <= 1.0) {
      const abs_b = Math.abs(x_b);
      if (abs_b <= 1.0) {
        return 0.5 * (x_a + x_b); // Hot path: both inside
      }
      if (x_b > 0.0) {
        return this.#process_one_inside_one_above_1(x_a, x_b);
      } else {
        return this.#process_one_inside_one_below_minus_1(x_a, x_b);
      }
    } else {
      if (x_a >= 1.0) {
        if (x_b >= 1.0) { return 1.0; }
        const abs_b = Math.abs(x_b);
        if (abs_b <= 1.0) {
          return this.#process_one_inside_one_above_1(x_b, x_a);
        } else {
          return this.#process_crossover(x_b, x_a);
        }
      } else {
        if (x_b <= -1.0) { return -1.0; }
        const abs_b = Math.abs(x_b);
        if (abs_b <= 1.0) {
          return this.#process_one_inside_one_below_minus_1(x_b, x_a);
        } else {
          return this.#process_crossover(x_a, x_b);
        }
      }
    }
  }
}
