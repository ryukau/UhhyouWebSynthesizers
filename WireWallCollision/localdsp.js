export class Wave1D {
  // `a` is damping factor.
  // `c` is wave speed in [m/s].
  // `dt` is interval of time step in [s].
  // `dx` is distance between node in [m].
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
    this.a = a;
    this.c = c;
    this.dt = dt;
    this.dx = dx;

    this.C0 = (this.c * this.dt / this.dx) ** 2;
    this.C1 = 2 * (1 - this.C0);
  }

  step() {
    this.wave.unshift(this.wave.pop());
    for (let x = 1; x < this.wave[0].length - 1; ++x) {
      // clang-format off
      this.wave[0][x] = this.a * (
        + this.C0 * (this.wave[1][x + 1] + this.wave[1][x - 1])
        + this.C1 * this.wave[1][x]
        - this.wave[2][x]
      );
      // clang-format on
    }
  }
}

export class Wave1DDampedForwardFD extends Wave1D {
  setParameter(a, c, dt, dx) {
    this.C0 = 1 / (dt * dt);
    this.C1 = 1 / (this.C0 + a / dt);
    this.C2 = c * c / (dx * dx);
    this.C3 = 2 * this.C0 + a / dt - 2 * this.C2;
  }

  step() {
    this.wave.unshift(this.wave.pop());
    for (let x = 1; x < this.wave[0].length - 1; ++x) {
      // clang-format off
      this.wave[0][x] = this.C1 * (
        + this.C2 * (this.wave[1][x - 1] + this.wave[1][x + 1])
        + this.C3 * this.wave[1][x]
        - this.C0 * this.wave[2][x]
      );
      // clang-format on
    }
  }
}

export class Wave1DDampedCentralFD extends Wave1D {
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

export class CollidingWave1DWallWire {
  constructor(nNode, a, c, dt, dx, distance = 0, restitution = 0.5) {
    this.wire = new Wave1DDampedCentralFD(nNode, a, c, dt, dx);
    this.distance = distance;
    this.restitution = restitution;
  }

  getDisplacement() { return this.wire.getDisplacement(); }

  pick(x, displacement) {
    this.wire.pick(x, displacement > this.distance ? this.distance : displacement);
  }

  step() {
    this.wire.step();

    const last = this.wire.wave[0].length - 1;
    for (let x = 1; x < last; ++x) {
      if (this.distance < this.wire.wave[0][x]) {
        this.wire.wave[0][x]
          = this.distance - this.restitution * (this.wire.wave[0][x] - this.distance);
      }
    }
  }
}
