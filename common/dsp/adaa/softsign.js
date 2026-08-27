export class SoftsignAdaa1 {
  constructor() { this.x1_ = 0.0; }
  reset() { this.x1_ = 0.0; }

  compute_y_softsign_1(x0, x1) {
    if (x0 === x1) { return x0 / (1.0 + Math.abs(x0)); }

    const a0 = Math.abs(x0);
    const a1 = Math.abs(x1);

    if (a0 < 1e-18 && a1 < 1e-18) { return (x0 + x1) * 0.5; }

    const da = a1 - a0;
    const den = 1.0 + a0;

    let hu = 0.0;
    if (Math.abs(da) < 0.22 * den) {
      const xi = da / (a1 + a0 + 2.0);
      const s = xi * xi;

      const c19 = 1.0 / 19.0;
      const c17 = 1.0 / 17.0;
      const c15 = 1.0 / 15.0;
      const c13 = 1.0 / 13.0;
      const c11 = 1.0 / 11.0;
      const c9 = 1.0 / 9.0;
      const c7 = 1.0 / 7.0;
      const c5 = 1.0 / 5.0;
      const c3 = 1.0 / 3.0;

      let h = c19 * s + c17;
      h = h * s + c15;
      h = h * s + c13;
      h = h * s + c11;
      h = h * s + c9;
      h = h * s + c7;
      h = h * s + c5;
      h = h * s + c3;

      hu = (xi - 1.0) * s * h + xi;
    } else {
      const u = da / den;
      let log1pu = 0.0;
      if (u > -0.5) {
        log1pu = Math.log1p(u);
      } else {
        log1pu = Math.log1p(a1) - Math.log1p(a0);
      }
      hu = 1.0 - log1pu / u;
    }

    const g = (a0 + hu) / den;

    const x0_ge = (x0 >= 0.0);
    const x1_ge = (x1 >= 0.0);
    if (x0_ge === x1_ge) { return x0_ge ? g : -g; }

    const dx = x0 - x1;
    let factor = 0.0;
    if (dx === Infinity || dx === -Infinity) {
      factor = (0.5 * a0 - 0.5 * a1) / (0.5 * a0 + 0.5 * a1);
    } else {
      factor = -da / Math.abs(dx);
    }

    if (x0 < 0.0) { factor = -factor; }

    return factor * g;
  }

  process(input) {
    const x_a = this.x1_;
    const x_b = input;
    this.x1_ = input;

    return this.compute_y_softsign_1(x_a, x_b);
  }
}
