// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

// Cascaded exponential moving average filter.
class ReleaseFilter {
  constructor(timeSamples) {
    this.v1 = 0;
    this.v2 = 0;

    this.kp = 1;
    if (timeSamples > Number.EPSILON) { // Avoid 0 division.
      const y = 1 - Math.cos(2 * Math.PI / timeSamples);
      this.kp = Math.sqrt((y + 2) * y) - y;
    }
  }

  // Force refresh when limiter gain goes down.
  setMin(input) {
    this.v1 = Math.min(this.v1, input);
    this.v2 = Math.min(this.v2, input);
  }

  // Force refresh when gate gain goes up.
  setMax(input) {
    this.v1 = Math.max(this.v1, input);
    this.v2 = Math.max(this.v2, input);
  }

  process(input) {
    this.v1 += this.kp * (input - this.v1);
    this.v2 += this.kp * (this.v1 - this.v2);
    return this.v2;
  }
}

export class FixedIntDelay {
  #wptr;
  #buf;

  constructor(delaySamples) {
    this.#wptr = 0;
    this.#buf = new Array(delaySamples + 1).fill(0);
  }

  reset() {
    this.#wptr = 0;
    this.#buf.fill(0);
  }

  process(input) {
    if (++this.#wptr >= this.#buf.length) this.#wptr = 0;
    this.#buf[this.#wptr] = input;
    return this.#buf[this.#wptr === this.#buf.length - 1 ? 0 : this.#wptr + 1];
  }
}

export class PeakHold {
  constructor(holdSamples) {
    this.delay = new FixedIntDelay(holdSamples);
    this.queue = [];
  }

  process(x0) {
    while (this.queue.length > 0) {
      if (this.queue.at(-1) >= x0) break;
      this.queue.pop();
    }
    this.queue.push(x0);
    if (this.delay.process(x0) === this.queue[0]) this.queue.shift();
    return this.queue[0];
  }
}

// Operator +, but rounds floating point number towards 0.
// Both `lhs` and `rhs` must be 0 or postive number.
//
// Details are written in `common/wasm/basiclimiter.cpp`.
function fadd(lhs, rhs) {
  if (lhs < rhs) [lhs, rhs] = [rhs, lhs];
  if (rhs <= lhs * Number.EPSILON) return lhs;
  const expL = Math.ceil(Math.log2(lhs));
  const cut = 2 ** (expL - 53); // 53 is mantissa bits of double float.
  const rounded = rhs - rhs % cut;
  return lhs + rounded;
}

export class MovingAverageFilter {
  constructor(smoothingSamples) {
    this.delay = new FixedIntDelay(smoothingSamples);
    this.scaler = 1 / smoothingSamples;
    this.sum = 0;
  }

  process(input) {
    input *= this.scaler;
    this.sum = fadd(this.sum, input);
    const d1 = this.delay.process(input);
    return this.sum = Math.max(0, this.sum - d1);
  }

  processNaive(input) {
    input *= this.scaler;
    this.sum += input;
    const d1 = this.delay.process(input);
    return this.sum = this.sum - d1;
  }
}

export class DoubleAverageFilter {
  // `smoothingSamples` must be even.
  constructor(smoothingSamples) {
    const half = smoothingSamples / 2;
    this.delay1 = new FixedIntDelay(half + 1);
    this.delay2 = new FixedIntDelay(half);

    this.scaler = half === 0 ? 1 : 1 / ((half + 1) * half);
    this.sum1 = 0;
    this.sum2 = 0;
    this.buf = 0;
  }

  process(input) {
    input *= this.scaler;

    this.sum1 = fadd(this.sum1, input);
    const d1 = this.delay1.process(input);
    this.sum1 = Math.max(0, this.sum1 - d1);

    this.sum2 = fadd(this.sum2, this.sum1);
    const d2 = this.delay2.process(this.sum1);
    this.sum2 = Math.max(0, this.sum2 - d2);

    const out = this.buf;
    this.buf = this.sum2;
    return out;
  }
}

export class Limiter {
  constructor(attackSamples, sustainSamples, releaseSamples, thresholdAmplitude) {
    attackSamples = Math.floor(attackSamples);
    attackSamples += attackSamples % 2; // Align to even number.
    this.latency = attackSamples;
    sustainSamples = Math.floor(sustainSamples);

    this.peakhold = new PeakHold(attackSamples + sustainSamples);
    this.thresholdAmp = thresholdAmplitude;
    this.releaseFilter = new ReleaseFilter(releaseSamples);
    this.smoother = new DoubleAverageFilter(attackSamples);
    this.lookaheadDelay = new FixedIntDelay(attackSamples);
  }

  process(input) {
    const inAbs = Math.abs(input);
    const peakAmp = this.peakhold.process(inAbs);
    const candidate = peakAmp > this.thresholdAmp ? this.thresholdAmp / peakAmp : 1;
    this.releaseFilter.setMin(candidate);
    const released = this.releaseFilter.process(candidate);
    return this.smoother.process(released) * this.lookaheadDelay.process(input);
  }
}

export class Gate {
  constructor(attackSamples, sustainSamples, releaseSamples, thresholdAmplitude) {
    attackSamples = Math.floor(attackSamples);
    attackSamples += attackSamples % 2; // Align to even number.
    this.latency = attackSamples;
    sustainSamples = Math.floor(sustainSamples);

    this.peakhold = new PeakHold(attackSamples + sustainSamples);
    this.thresholdAmp = thresholdAmplitude;
    this.releaseFilter = new ReleaseFilter(releaseSamples);
    this.smoother = new DoubleAverageFilter(attackSamples);
    this.lookaheadDelay = new FixedIntDelay(attackSamples);
  }

  process(input) {
    const inAbs = Math.abs(input);
    const peakAmp = this.peakhold.process(inAbs);
    const candidate = peakAmp >= this.thresholdAmp ? 1 : 0;
    this.releaseFilter.setMax(candidate);
    const released = this.releaseFilter.process(candidate);
    return this.smoother.process(released) * this.lookaheadDelay.process(input);
  }
}
