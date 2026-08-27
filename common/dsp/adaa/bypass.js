export class BypassAdaa1 {
  #x1 = 0.0;

  reset() { this.#x1 = 0.0; }

  process(input) {
    const y = (input + this.#x1) * 0.5;
    this.#x1 = input;
    return y;
  }
}
