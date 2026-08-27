export class TriangleAdaa1 {
  #x1 = 0;
  #rem1 = 0;

  static #rint(x) {
    if (!Number.isFinite(x)) return x;
    let r = Math.floor(x + 0.5);
    if (Math.abs(x - Math.trunc(x)) === 0.5 && (Math.trunc(r) & 1) !== 0) { r -= 1; }
    return r;
  }

  static #signbit(x) { return x < 0 || Object.is(x, -0); }

  static #fma(a, b, c) { return typeof Math.fma === 'function' ? Math.fma(a, b, c) : a * b + c; }

  static #f0Rem2(rem) {
    const absRem = Math.abs(rem);
    if (absRem <= 1) { return -rem; }
    const s = TriangleAdaa1.#signbit(rem) ? -1 : 1;
    return rem - 2 * s;
  }

  static #diffQuotientExtended(r0, r1) {
    if (r0 === r1) { return TriangleAdaa1.#f0Rem2(r0); }
    if (r0 > r1) {
      const temp = r0;
      r0 = r1;
      r1 = temp;
    }
    if (r1 <= 1 && r0 >= -1) { return -0.5 * (r0 + r1); }

    const dx = r1 - r0;
    const s = r1 <= 1 ? 1 : -1;
    const x = r0 + s;
    const y = r1 + s;
    const num = TriangleAdaa1.#fma(y, 2 - y, (-x) * (x + 2));
    return (0.5 * s) * num / dx;
  }

  static #diffQuotientModulo4(rem0, rem1Prime) {
    const n = TriangleAdaa1.#rint(0.25 * (rem0 + rem1Prime));
    const r0 = TriangleAdaa1.#fma(-2, n, rem0);
    const r1 = TriangleAdaa1.#fma(-2, n, rem1Prime);

    let D = TriangleAdaa1.#diffQuotientExtended(r0, r1);
    if ((Math.trunc(n) & 1) !== 0) { D = -D; }
    return D;
  }

  static #computeYTriangle1Internal(x0, rem0, x1, rem1) {
    const dx = x1 - x0;
    if (dx === 0) { return TriangleAdaa1.#f0Rem2(rem0); }

    let rem1Prime = rem1;
    if (rem1 - rem0 > 2) {
      rem1Prime = rem1 - 4;
    } else if (rem1 - rem0 < -2) {
      rem1Prime = rem1 + 4;
    }

    const D = TriangleAdaa1.#diffQuotientModulo4(rem0, rem1Prime);

    const dxPrime = rem1Prime - rem0;
    const ans = D * (dxPrime / dx);
    return ans;
  }

  reset() {
    this.#x1 = 0;
    this.#rem1 = 0;
  }

  process(input) {
    const x0 = this.#x1;
    const rem0 = this.#rem1;

    const x1 = Number(input);
    const k1 = TriangleAdaa1.#rint(x1 * 0.25);
    const rem1 = TriangleAdaa1.#fma(-4, k1, x1);

    this.#x1 = x1;
    this.#rem1 = rem1;

    if (!Number.isFinite(x0) || !Number.isFinite(x1)) { return NaN; }

    if (TriangleAdaa1.#signbit(x0) !== TriangleAdaa1.#signbit(x1)) {
      const y1 = -x1;
      const remY1 = -rem1;
      const dx = x1 - x0;
      if (dx === 0) { return TriangleAdaa1.#computeYTriangle1Internal(x0, rem0, x0, rem0); }
      const DNew = TriangleAdaa1.#computeYTriangle1Internal(x0, rem0, y1, remY1);
      return DNew * ((-x1 - x0) / dx);
    } else {
      return TriangleAdaa1.#computeYTriangle1Internal(x0, rem0, x1, rem1);
    }
  }
}
