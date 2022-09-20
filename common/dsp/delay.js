import {clamp} from "../util.js";

export class Delay {
  #wptr;
  #buf;

  constructor(sampleRate, maxSecond) {
    this.#wptr = 0;

    const size = Math.floor(sampleRate * maxSecond) + 2;
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
