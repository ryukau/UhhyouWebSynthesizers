export class Wave1DDampedCentralFD {
  constructor(nNode, a, c, dt, dx) {
    this.wave = [];
    for (let i = 0; i < 3; ++i) this.wave.push(new Array(nNode).fill(0));
    this.setParameter(a, c, dt, dx);
  }

  getDisplacement() { return this.wave[0]; }

  pick(x, displacement) {
    this.wave[0][x] = displacement + 0.995 * (this.wave[0][x] - displacement);
  }

  setParameter(a, c, dt, dx) {
    this.C0 = 1 / (dt * dt);
    this.C1 = a / dt / 2;
    this.C2 = c * c / (dx * dx);
    this.C3 = 1 / (this.C0 + this.C1);
    this.C4 = 2 * (this.C0 - this.C2);
    this.C5 = this.C0 - this.C1;
  }

  step() {
    this.wave.unshift(this.wave.pop());
    for (let x = 1; x < this.wave[0].length - 1; ++x) {
      // clang-format off
      this.wave[0][x] = this.C3 * (
        + this.C2 * (this.wave[1][x - 1] + this.wave[1][x + 1])
        + this.C4 * this.wave[1][x]
        - this.C5 * this.wave[2][x]
      );
      // clang-format on
    }
  }
}

export class CollidingWave1DWireWire {
  // - `a` is damping factor.
  // - `c` is wave speed in [m/s].
  // - `dt` is interval of time step in [s].
  // - `dx` is distance between node in [m].
  // - `restitution` is in [0, 1]. This value only imitates coefficient of restitution. 0
  //    means no bounce, 1 means somewhat bounce.
  constructor(nNode, a0, a1, c0, c1, dt, dx, restitution0, restitution1, distance) {
    this.w0 = new Wave1DDampedCentralFD(nNode, a0, c0, dt, dx);
    this.w1 = new Wave1DDampedCentralFD(nNode, a1, c1, dt, dx);

    this.r0 = 1 - restitution0;
    this.r1 = 1 - restitution1;
    this.distance = distance;
  }

  getDisplacement(index) {
    if (index === 0) return this.w0.getDisplacement();
    return this.w1.getDisplacement();
  }

  pick(x, displacement) { this.w1.pick(x, displacement); }

  step() {
    this.w0.step();
    this.w1.step();

    const last = this.w0.wave[0].length - 1;
    for (let x = 1; x < last; ++x) {
      if (this.w0.wave[0][x] < this.w1.wave[0][x] - this.distance) {
        const mid = 0.5 * (this.w0.wave[1][x] + this.w1.wave[1][x]);
        this.w0.wave[0][x] = mid + this.r0 * (this.w0.wave[1][x] - mid);
        this.w1.wave[0][x] = mid + this.r1 * (this.w1.wave[1][x] - mid);
      }
    }
  }
}
