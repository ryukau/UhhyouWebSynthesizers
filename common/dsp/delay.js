// Copyright 2022 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {clamp} from "../util.js";

export class IntDelay {
  #wptr;
  #buf;

  constructor(sampleRate, maxSecond) {
    this.#wptr = 0;

    const size = Math.ceil(sampleRate * maxSecond) + 2;
    this.#buf = new Array(size < 4 ? 4 : size);

    this.reset();
  }

  reset() { this.#buf.fill(0); }

  setTime(timeInSample) {
    this.timeInt = clamp(Math.floor(timeInSample), 0, this.#buf.length - 2);
  }

  // Always call `setTime` before `process`.
  process(input) {
    let rptr = this.#wptr - this.timeInt;
    if (rptr < 0) rptr += this.#buf.length;

    this.#buf[this.#wptr] = input;
    if (++this.#wptr >= this.#buf.length) this.#wptr -= this.#buf.length;

    return this.#buf[rptr];
  }
}

export class Delay {
  #wptr;
  #buf;

  constructor(sampleRate, maxSecond) {
    this.#wptr = 0;

    const size = Math.ceil(sampleRate * maxSecond) + 2;
    this.#buf = new Array(size < 4 ? 4 : size);

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
}

/**
Allpass filter with arbitrary length delay.
https://ccrma.stanford.edu/~jos/pasp/Allpass_Two_Combs.html
*/
export class LongAllpass {
  #buffer;

  constructor(sampleRate, maxTime, DelayType = Delay) {
    this.#buffer = 0;
    this.gain = 0;
    this.delay = new DelayType(sampleRate, maxTime);
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
}

export class NestedLongAllpass {
  #in;
  #buffer;

  constructor(
    sampleRate,
    maxTime,
    size,
    factoryFunc = (fs, time) => new LongAllpass(fs, time),
  ) {
    this.#in = new Array(size).fill(0);
    this.#buffer = new Array(size).fill(0);

    this.allpass = new Array(size);
    for (let i = 0; i < size; ++i) {
      this.allpass[i] = factoryFunc(sampleRate, maxTime, size);
    }

    this.feed = new Array(size).fill(0); // in [-1, 1].
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
  constructor(sampleRate, maxTime, size) {
    super(
      sampleRate, maxTime, size,
      (fs, time, size) => new NestedLongAllpass(fs, time, size));
  }
}

export class Lattice3 extends NestedLongAllpass {
  constructor(sampleRate, maxTime, size) {
    super(sampleRate, maxTime, size, (fs, time, size) => new Lattice2(fs, time, size));
  }
}

export class Lattice4 extends NestedLongAllpass {
  constructor(sampleRate, maxTime, size) {
    super(sampleRate, maxTime, size, (fs, time, size) => new Lattice3(fs, time, size));
  }
}
