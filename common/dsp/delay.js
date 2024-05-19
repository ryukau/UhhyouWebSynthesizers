// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {clamp, lagrange3Interp} from "../util.js";

export class IntDelay {
  #wptr;
  #buf;

  constructor(maxDelayTimeInSamples) {
    this.#wptr = 0;
    this.#buf = new Array(Math.max(Math.ceil(maxDelayTimeInSamples), 4));
    this.reset();
  }

  reset() { this.#buf.fill(0); }

  setTime(timeInSample) {
    this.timeInt = clamp(Math.floor(timeInSample), 0, this.#buf.length - 1);
  }

  // Always call `setTime` before `process`.
  process(input) {
    let rptr = this.#wptr - this.timeInt;
    if (rptr < 0) rptr += this.#buf.length;

    this.#buf[this.#wptr] = input;
    if (++this.#wptr >= this.#buf.length) this.#wptr -= this.#buf.length;

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
    this.#buf = new Array(Math.max(Math.ceil(maxDelayTimeInSamples) + 2, 4));
    this.reset();
  }

  reset() { this.#buf.fill(0); }

  setTime(timeInSample) {
    const clamped = clamp(timeInSample, 0, this.#buf.length - 2);
    this.timeInt = Math.floor(clamped);
    this.rFraction = clamped - this.timeInt;
  }

  // Always call `setTime` before `process`.
  process(input) {
    let rptr0 = this.#wptr - this.timeInt;
    let rptr1 = rptr0 - 1;
    if (rptr0 < 0) rptr0 += this.#buf.length;
    if (rptr1 < 0) rptr1 += this.#buf.length;

    // Write to buffer.
    this.#buf[this.#wptr] = input;
    if (++this.#wptr >= this.#buf.length) this.#wptr -= this.#buf.length;

    // Read from buffer.
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
    this.#buf = new Array(Math.max(Math.ceil(maxDelayTimeInSamples) + 4, 4));
    this.reset();
  }

  reset() { this.#buf.fill(0); }

  setTime(timeInSample) {
    const clamped = clamp(timeInSample - 1, 0, this.#buf.length - 4);
    this.timeInt = Math.floor(clamped);
    this.rFraction = clamped - this.timeInt;
  }

  // Always call `setTime` before `process`.
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
      this.#buf[rptr0], this.#buf[rptr1], this.#buf[rptr2], this.#buf[rptr3],
      this.rFraction);
  }

  // Convenient method for audio-rate modulation.
  processMod(input, timeInSample) {
    this.setTime(timeInSample);
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
    this.#buf = new Array(Math.max(Math.ceil(maxDelayTimeInSamples) + 2, 4));
    this.#timeInt = new Array(nTap).fill(0);
    this.#rFraction = new Array(nTap).fill(0);

    this.output = new Array(nTap).fill(0);
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
    // Write to buffer.
    this.#buf[this.#wptr] = input;
    if (++this.#wptr >= this.#buf.length) this.#wptr = 0;

    let sum = 0;
    for (let idx = 0; idx < this.#timeInt.length; ++idx) {
      let rptr0 = this.#wptr - this.#timeInt[idx];
      if (rptr0 < 0) rptr0 += this.#buf.length;

      let rptr1 = rptr0 - 1;
      if (rptr1 < 0) rptr1 += this.#buf.length;

      // Read from buffer.
      sum += this.#buf[rptr0]
        + this.#rFraction[idx] * (this.#buf[rptr1] - this.#buf[rptr0]);
    }
    return sum;
  }

  processSplit(input) {
    this.#buf[this.#wptr] = input;
    if (++this.#wptr >= this.#buf.length) this.#wptr = 0;

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
    this.#in = new Array(nAllpass).fill(0);
    this.#buffer = new Array(nAllpass).fill(0);

    this.allpass = new Array(nAllpass);
    for (let i = 0; i < nAllpass; ++i) {
      this.allpass[i] = factoryFunc(delayTimeInSamples, nAllpass);
    }

    this.feed = new Array(nAllpass).fill(0); // in [-1, 1].
  }

  reset() {
    this.#in.fill(0);
    this.#buffer.fill(0);
    for (let ap of allpass) ap.reset();
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
