export class LeakyHalfwaveAdaa1_fast {
  #x1_ = 0;

  reset() { this.#x1_ = 0; }

  process(input, a) {
    const x0 = this.#x1_;
    const x1 = input;
    this.#x1_ = input;

    if (x0 >= 0 && x1 >= 0) { return 0.5 * (x0 + x1); }
    if (x0 <= 0 && x1 <= 0) { return 0.5 * a * (x0 + x1); }

    const u = Math.max(x0, x1);
    const v = Math.min(x0, x1);

    const num = u * u - a * v * v;
    const denom = u - v;
    return (0.5 * num) / denom;
  }
}
