export class EvenQuadraticClipAdaa1 {
  #x1 = 0;

  reset() { this.#x1 = 0; }

  process(input) {
    const x0 = this.#x1;
    const x1 = input;
    this.#x1 = input;

    let a = Math.min(x0, x1);
    let b = Math.max(x0, x1);

    if (a >= -1 && b <= 1) { return (a * a + a * b + b * b) / 3; }
    if (b <= -1 || a >= 1) { return 1; }
    if (a < -1) {
      if (b > 1) { return 1 - 4 / (3 * (b - a)); }
      const nextA = -b;
      b = -a;
      a = nextA;
    }
    const d = 1 - a;
    return 1 - (d * d * (2 + a)) / (3 * (b - a));
  }
}

export class EvenQuadraticClipAdaa2 {
  #x0 = 0;
  #x1 = 0;

  #compute_I(a, b) {
    if (b < 0) {
      a = -a;
      b = -b;
    }

    if (b <= 1 && Math.abs(a) <= 1) { return (a * (a + 2 * b) + 3 * b * b) / 12; }
    if (a >= 1 && b >= 1) { return 0.5; }

    const ba = b - a;
    if (Math.abs(ba) > 2.5e16) { return 0.5; }

    if (b <= 1) {
      const sb = (a > 0) ? b : -b;
      const d = (1 - sb) / ba;
      const term = 4 * Math.abs(a) * (2 + sb) - 3 * (1 + sb) * (1 + sb);
      return 0.5 - (d * d * term) / 12;
    }

    if (a >= -1) {
      const d = (1 - a) / ba;
      return 0.5 - (d * d * ((1 - a) * (a + 3))) / 12;
    }

    return 0.5 + (4 * a) / (3 * ba * ba);
  }

  reset() {
    this.#x0 = 0;
    this.#x1 = 0;
  }

  process(input) {
    const x0 = this.#x0;
    const x1 = this.#x1;
    const x2 = input;

    this.#x0 = x1;
    this.#x1 = input;

    return (this.#compute_I(x0, x1) + this.#compute_I(x2, x1));
  }
}
