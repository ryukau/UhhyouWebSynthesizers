// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {clamp, lagrange3Interp} from "../util.js";

export class IntDelay {
  #wptr;
  #buf;

  constructor(maxDelayTimeInSamples) {
    this.#wptr = 0;

    const requiredSize = Math.max(Math.ceil(maxDelayTimeInSamples), 4);
    this.#buf = new Array(requiredSize);

    this.reset();
  }

  reset() { this.#buf.fill(0); }

  setTime(timeInSample) { this.timeInt = clamp(Math.floor(timeInSample), 0, this.#buf.length - 1); }

  // Call `setTime` at least once before `process`.
  process(input) {
    if (++this.#wptr >= this.#buf.length) this.#wptr -= this.#buf.length;
    this.#buf[this.#wptr] = input;

    let rptr = this.#wptr - this.timeInt;
    if (rptr < 0) rptr += this.#buf.length;

    return this.#buf[rptr];
  }

  // Convenient method for audio-rate modulation.
  processMod(input, timeInSample) {
    this.setTime(timeInSample);
    return this.process(input);
  }
}

export class Delay {
  #wptr;
  #buf;

  constructor(maxDelayTimeInSamples) {
    this.#wptr = 0;

    const requiredSize = Math.max(Math.ceil(maxDelayTimeInSamples) + 2, 4);
    this.#buf = new Array(requiredSize);

    this.reset();
  }

  reset() { this.#buf.fill(0); }

  setTime(timeInSample) {
    const clamped = clamp(timeInSample, 0, this.#buf.length - 2);
    this.timeInt = Math.floor(clamped);
    this.rFraction = clamped - this.timeInt;
  }

  // Call `setTime` at least once before `process`.
  process(input) {
    // Write to buffer.
    if (++this.#wptr >= this.#buf.length) this.#wptr -= this.#buf.length;
    this.#buf[this.#wptr] = input;

    // Read from buffer.
    let rptr0 = this.#wptr - this.timeInt;
    let rptr1 = rptr0 - 1;
    if (rptr0 < 0) rptr0 += this.#buf.length;
    if (rptr1 < 0) rptr1 += this.#buf.length;

    return this.#buf[rptr0] + this.rFraction * (this.#buf[rptr1] - this.#buf[rptr0]);
  }

  // Convenient method for audio-rate modulation.
  processMod(input, timeInSample) {
    this.setTime(timeInSample);
    return this.process(input);
  }
}

export class CubicDelay {
  #wptr;
  #buf;

  constructor(maxDelayTimeInSamples) {
    this.#wptr = 0;

    const requiredSize = Math.max(Math.ceil(maxDelayTimeInSamples) + 4, 4);
    this.#buf = new Array(requiredSize);

    this.reset();
  }

  reset() { this.#buf.fill(0); }

  setTime(timeInSample) {
    const clamped = clamp(timeInSample - 1, 0, this.#buf.length - 4);
    this.timeInt = Math.floor(clamped);
    this.rFraction = clamped - this.timeInt;
  }

  // Call `setTime` at least once before `process`.
  process(input) {
    // Write to buffer.
    if (++this.#wptr >= this.#buf.length) this.#wptr = 0;
    this.#buf[this.#wptr] = input;

    let rptr0 = this.#wptr - this.timeInt;
    let rptr1 = rptr0 - 1;
    let rptr2 = rptr0 - 2;
    let rptr3 = rptr0 - 3;
    if (rptr0 < 0) rptr0 += this.#buf.length;
    if (rptr1 < 0) rptr1 += this.#buf.length;
    if (rptr2 < 0) rptr2 += this.#buf.length;
    if (rptr3 < 0) rptr3 += this.#buf.length;

    // Read from buffer.
    return lagrange3Interp(
      this.#buf[rptr0], this.#buf[rptr1], this.#buf[rptr2], this.#buf[rptr3], this.rFraction);
  }

  // Convenient method for audio-rate modulation.
  processMod(input, timeInSample) {
    this.setTime(timeInSample);
    return this.process(input);
  }
}

export class SincDelay {
  /**
   * @param {number} maxTap Maximum number of taps for the convolution filter (must be positive and
   *   even).
   * @param {number} [maxTimeSamples] Optional maximum delay time in samples to pre-allocate buffer.
   */
  constructor(maxTimeSamples = null, maxTap = 64) {
    if (typeof maxTap !== 'number' || maxTap <= 0 || maxTap % 2 !== 0) {
      throw new Error("maxTap must be a positive, even integer.");
    }

    this.maxTap = maxTap;
    this.maxTime_ = 0;
    this.prevTime_ = null;
    this.wptr_ = 0;

    this.buf_ = new Array(maxTap);

    this.timeSamples_ = 0;
    this.cutoff_ = 0.5;
    this.isZeroOrLess_ = false;
    this.localTap_ = 2;
    this.halfTap_ = 1;
    this.timeInt_ = 0;
    this.mid_ = 0;

    this.o1_k_ = 0;
    this.o1_u1_ = 0;
    this.o1_u2_ = 0;

    this.o2_k_ = 0;
    this.o2_u1_ = 0;
    this.o2_u2_ = 0;

    this.theta_scale_ = 0;

    if (maxTimeSamples !== null) { this.setup(maxTimeSamples); }
  }

  setup(maxTimeSamples) {
    this.maxTime_ = maxTimeSamples;
    const size = Math.max(this.maxTap, Math.trunc(this.maxTime_) + Math.trunc(this.maxTap / 2) + 1);
    this.buf_ = new Array(size);
    this.reset();
  }

  reset() {
    this.prevTime_ = null;
    this.wptr_ = 0;
    this.buf_.fill(0);
  }

  setTime(timeSamples) {
    this.timeSamples_ = timeSamples;
    const localTap = Math.min(Math.max(2 * Math.trunc(timeSamples), 2), this.maxTap);
    const halfTap = Math.floor(localTap) >> 1;
    const clamped = Math.min(Math.max(timeSamples, halfTap - 1), this.maxTime_);

    const timeDiff = (this.prevTime_ === null) ? 1 : Math.abs(this.prevTime_ - clamped + 1);
    this.prevTime_ = clamped;
    const cutoff = timeDiff <= 1 ? 0.5 : Math.pow(2, -timeDiff);

    this.cutoff_ = cutoff;
    if (timeSamples <= 0) {
      this.isZeroOrLess_ = true;
      return;
    }
    this.isZeroOrLess_ = false;

    const timeInt = Math.trunc(clamped);
    const fraction = clamped - timeInt;
    const mid = fraction - halfTap;

    const pi = Math.PI;
    const o1_omega = 2 * pi * cutoff;
    const o1_k = 2 * Math.cos(o1_omega);
    const o1_u1 = Math.sin((mid - 1) * o1_omega);
    const o1_u2 = Math.sin((mid - 2) * o1_omega);

    const o2_omega = (2 * pi) / (this.maxTap + 1);
    const o2_phi = o2_omega * ((this.maxTap >> 1) - halfTap);
    const o2_k = 2 * Math.cos(o2_omega);
    const o2_u1 = Math.cos(o2_phi + o2_omega * (-1 + fraction));
    const o2_u2 = Math.cos(o2_phi + o2_omega * (-2 + fraction));

    this.localTap_ = localTap;
    this.halfTap_ = halfTap;
    this.timeInt_ = timeInt;
    this.mid_ = mid;

    this.o1_k_ = o1_k;
    this.o1_u1_ = o1_u1;
    this.o1_u2_ = o1_u2;

    this.o2_k_ = o2_k;
    this.o2_u1_ = o2_u1;
    this.o2_u2_ = o2_u2;

    this.theta_scale_ = 2 * cutoff * pi;
  }

  // Call `setTime` at least once before `process`.
  process(input) {
    const size = this.buf_.length;
    this.wptr_++;
    if (this.wptr_ >= size) { this.wptr_ = 0; }
    this.buf_[this.wptr_] = input;

    if (this.isZeroOrLess_) { return input * 2 * this.cutoff_; }

    // Copy oscillator states to local variables so process() is pure
    // and can be called safely without altering initial setTime coefficients.
    let o1_u1 = this.o1_u1_;
    let o1_u2 = this.o1_u2_;
    let o2_u1 = this.o2_u1_;
    let o2_u2 = this.o2_u2_;

    let rptr = this.wptr_ - this.timeInt_ - this.halfTap_;
    if (rptr < 0) { rptr += size; }

    let sum = 0;
    for (let i = 0; i < this.localTap_; ++i) {
      const o1_u0 = this.o1_k_ * o1_u1 - o1_u2;
      o1_u2 = o1_u1;
      o1_u1 = o1_u0;

      const o2_u0 = this.o2_k_ * o2_u1 - o2_u2;
      o2_u2 = o2_u1;
      o2_u1 = o2_u0;

      const window = 0.21747 + o2_u0 * (-0.45325 + o2_u0 * (0.28256 + o2_u0 * -0.04672));

      const x = i + this.mid_;
      const theta = this.theta_scale_ * x;
      let sinc;
      if (Math.abs(theta) <= 0.32) {
        const t2 = theta * theta;

        let y = -1.0 / 39916800.0;
        y = y * t2 + 1.0 / 362880.0;
        y = y * t2 - 1.0 / 5040.0;
        y = y * t2 + 1.0 / 120.0;
        y = y * t2 - 1.0 / 6.0;
        y = y * t2 + 1.0;

        sinc = 2 * this.cutoff_ * y;
      } else {
        sinc = o1_u0 / (Math.PI * x);
      }
      sum += sinc * window * this.buf_[rptr];
      rptr++;
      if (rptr >= size) { rptr = 0; }
    }
    return sum;
  }

  processMod(input, timeSamples) {
    this.setTime(timeSamples);
    return this.process(input);
  }
}

export class MultiTapDelay {
  #wptr;
  #buf;
  #timeInt;
  #rFraction;

  constructor(maxDelayTimeInSamples, nTap) {
    this.#wptr = 0;

    const requiredSize = Math.max(Math.ceil(maxDelayTimeInSamples) + 2, 4);
    this.#buf = new Array(requiredSize);

    this.#timeInt = new Int32Array(nTap);
    this.#rFraction = new Array(nTap);
    this.output = new Array(nTap);
    this.reset();
  }

  reset() {
    this.#buf.fill(0);
    this.output.fill(0);
  }

  // `timeInSamples` is an array.
  setTime(timeInSamples) {
    for (let idx = 0; idx < this.#timeInt.length; ++idx) {
      const clamped = clamp(timeInSamples[idx], 0, this.#buf.length - 2);
      this.#timeInt[idx] = Math.floor(clamped);
      this.#rFraction[idx] = clamped - this.#timeInt[idx];
    }
  }

  // Always call `setTime` before `process`.
  process(input) {
    if (++this.#wptr >= this.#buf.length) this.#wptr = 0;
    this.#buf[this.#wptr] = input;

    let sum = 0;
    for (let idx = 0; idx < this.#timeInt.length; ++idx) {
      let rptr0 = this.#wptr - this.#timeInt[idx];
      if (rptr0 < 0) rptr0 += this.#buf.length;

      let rptr1 = rptr0 - 1;
      if (rptr1 < 0) rptr1 += this.#buf.length;

      sum += this.#buf[rptr0] + this.#rFraction[idx] * (this.#buf[rptr1] - this.#buf[rptr0]);
    }

    return sum;
  }

  processSplit(input) {
    if (++this.#wptr >= this.#buf.length) this.#wptr = 0;
    this.#buf[this.#wptr] = input;

    for (let idx = 0; idx < this.#timeInt.length; ++idx) {
      let rptr0 = this.#wptr - this.#timeInt[idx];
      if (rptr0 < 0) rptr0 += this.#buf.length;

      let rptr1 = rptr0 - 1;
      if (rptr1 < 0) rptr1 += this.#buf.length;

      // Read from buffer.
      this.output[idx]
        = this.#buf[rptr0] + this.#rFraction[idx] * (this.#buf[rptr1] - this.#buf[rptr0]);
    }
    return this.output;
  }
}

/**
Allpass filter with arbitrary length delay.
https://ccrma.stanford.edu/~jos/pasp/Allpass_Two_Combs.html
*/
export class LongAllpass {
  #buffer;

  constructor(maxDelayTimeInSamples, DelayType = Delay) {
    this.#buffer = 0;
    this.gain = 0;
    this.delay = new DelayType(maxDelayTimeInSamples);
  }

  reset() {
    this.#buffer = 0;
    this.delay.reset();
  }

  // gain in [0, 1].
  prepare(timeInSample, gain) {
    this.delay.setTime(timeInSample);
    this.gain = gain;
  }

  process(input) {
    input -= this.gain * this.#buffer;
    const output = this.#buffer + this.gain * input;
    this.#buffer = this.delay.process(input);
    return output;
  }

  processMod(input, timeInSample, gain) {
    this.prepare(timeInSample, gain);
    return this.process(input);
  }
}

export class NestedLongAllpass {
  #in;
  #buffer;

  constructor(
    delayTimeInSamples,
    nAllpass,
    factoryFunc = (maxSamples) => new LongAllpass(maxSamples),
  ) {
    this.#in = new Array(nAllpass);
    this.#buffer = new Array(nAllpass);

    this.allpass = new Array(nAllpass);
    for (let i = 0; i < nAllpass; ++i) {
      this.allpass[i] = factoryFunc(delayTimeInSamples, nAllpass);
    }

    this.feed = new Array(nAllpass).fill(0); // in [-1, 1].

    this.reset();
  }

  reset() {
    this.#in.fill(0);
    this.#buffer.fill(0);
    for (let ap of this.allpass) ap.reset();
  }

  process(input) {
    for (let idx = 0; idx < this.#buffer.length; ++idx) {
      input -= this.feed[idx] * this.#buffer[idx];
      this.#in[idx] = input;
    }

    let out = this.#in.at(-1);
    for (let idx = this.allpass.length - 1; idx >= 0; --idx) {
      const apOut = this.allpass[idx].process(out);
      out = this.#buffer[idx] + this.feed[idx] * this.#in[idx];
      this.#buffer[idx] = apOut;
    }
    return out;
  }
}

export class Lattice2 extends NestedLongAllpass {
  constructor(delaySamples, size) {
    super(delaySamples, size, (nSample, size) => new NestedLongAllpass(nSample, size));
  }
}

export class Lattice3 extends NestedLongAllpass {
  constructor(delaySamples, size) {
    super(delaySamples, size, (nSample, size) => new Lattice2(nSample, size));
  }
}

export class Lattice4 extends NestedLongAllpass {
  constructor(delaySamples, size) {
    super(delaySamples, size, (nSample, size) => new Lattice3(nSample, size));
  }
}
