// Copyright 2022 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {Delay, LongAllpass} from "../common/dsp/delay.js";
import {FeedbackDelayNetwork} from "../common/dsp/fdn.js";
import {RateLimiter} from "../common/dsp/smoother.js";
import {SVF, SVFHighShelf} from "../common/dsp/svf.js";
import * as util from "../common/util.js";

export class TimeModulatedFDN extends FeedbackDelayNetwork {
  constructor(
    size,
    sampleRate,
    maxSecond,
    lowpassType,
    highpassType,
    delayType,
    timeModulation,
    rateLimit,
  ) {
    super(size, sampleRate, maxSecond, lowpassType, highpassType, delayType);

    this.delayTime = new Array(size);
    for (let i = 0; i < size; ++i) this.delayTime[i] = new RateLimiter(rateLimit);

    this.neutralTime = new Array(size).fill(0);
    this.timeModulation = timeModulation;
  }

  setTimeAt(index, timeInSamples) {
    this.neutralTime[index] = timeInSamples;
    this.delayTime[index].reset(timeInSamples);
  }

  process(input, feedback) {
    this.bufIndex ^= 1;
    let front = this.buf[this.bufIndex];
    let back = this.buf[this.bufIndex ^ 1];
    front.fill(0);
    for (let i = 0; i < front.length; ++i) {
      for (let j = 0; j < front.length; ++j) front[i] += this.matrix[i][j] * back[j];
    }

    for (let i = 0; i < front.length; ++i) {
      front[i] = 8 * input + feedback * front[i];

      const timeMod = 1 - this.timeModulation * Math.abs(front[i]);
      const targetTime = this.neutralTime[i] * Math.max(0.1, timeMod);
      this.delay[i].setTime(this.delayTime[i].process(targetTime));

      front[i] = this.delay[i].process(front[i]);
      front[i] = this.lowpass[i].process(front[i]);
      front[i] = this.highpass[i].process(front[i]);
    }

    return front.reduce((sum, val) => sum + val, 0);
  }
}

export class ParallelLowpassComb {
  constructor(sampleRate, nDelay) {
    this.delay = [];
    this.filter = [];
    for (let i = 0; i < nDelay; ++i) {
      const timeInSeconds = 10 ** (util.uniformDistributionMap(rng.number(), -4, -2));
      this.delay.push(new Delay(sampleRate, timeInSeconds));
      this.filter.push(new SVF(timeInSeconds / sampleRate, Math.SQRT1_2));
    }

    this.buffer = new Array(nDelay).fill(0);
  }

  reset() {
    for (let i = 0; i < nDelay; ++i) {
      this.delay.reset();
      this.filter.reset();
    }
    this.buffer.fill(0);
  }

  process(input) {
    let sig = 0;
    for (let i = 0; i < nDelay; ++i) {
      this.buffer[i] = this.delay.process(this.filter.lp(sig + this.buffer[i]));
      sig += this.buffer[i];
    }
    return sig;
  }
}

export class SerialComb {
  #buffer = 0;
  #feedback = 0;
  #sumPoint = 0;
  #sumFull = false;

  constructor(
    sampleRate,
    rng,
    nDelay,
    combSum,
    feedback,
    delayTimeSeconds,
    delayTimeRandomness, // In seconds.
    highpassHz,
    highpassQ,
    lowpassHz,
    lowpassQ,
    lowpassGain,
    highpassCutoffSlope,
    lowpassCutoffSlope,
    overtoneStart,
    timeUniformOvertoneRatio,
  ) {
    this.#feedback = feedback;
    this.#sumPoint = combSum === 0 ? 1 : combSum === 1 ? 0 : -1;
    this.#sumFull = combSum === 3;

    this.delay = [];
    this.highpass = [];
    this.lowpass = [];
    for (let i = nDelay - 1; i >= 0; --i) {
      const timeDenom
        = util.lerp(nDelay, i / overtoneStart + 1, timeUniformOvertoneRatio);
      let timeInSeconds = delayTimeSeconds / timeDenom;
      timeInSeconds += delayTimeRandomness * rng.number();

      let delay = new LongAllpass(sampleRate, timeInSeconds, Delay);
      delay.prepare(sampleRate * timeInSeconds, feedback);
      this.delay.push(delay);

      const hpOffset = highpassCutoffSlope * i * 8 / nDelay;
      const lpOffset = lowpassCutoffSlope * i * 8 / nDelay;
      this.highpass.push(new SVF((hpOffset + 1) * highpassHz / sampleRate, highpassQ));
      this.lowpass.push(
        new SVFHighShelf((lpOffset + 1) * lowpassHz / sampleRate, lowpassQ, lowpassGain));
    }
  }

  reset() {
    this.#buffer = 0;
    for (let i = 0; i < this.delay.length; ++i) {
      this.highpass[i].reset();
      this.lowpass[i].reset();
      this.delay[i].reset();
    }
  }

  process(sig) {
    let ap = sig - this.#feedback * this.#buffer;
    sig = this.#buffer;
    for (let i = 0; i < this.delay.length; ++i) {
      ap = this.highpass[i].hp(ap);
      ap = this.lowpass[i].process(ap);
      ap = this.delay[i].process(ap);

      if (this.#sumFull || i % 2 == this.#sumPoint) sig += ap;
    }
    this.#buffer = ap;
    return sig;
  };
}

// Basically `(S&H) * (noise)`.
export class SampleAndHoldNoise {
  #phase;
  #gain;
  #decay;
  #density;
  #poissonDenom;

  // `density` is inverse of average samples between impulses.
  constructor(density, decayTimeInSample) {
    this.#density = density;
    this.reset();
    this.setDecay(decayTimeInSample);
  }

  reset() {
    this.#phase = 0;
    this.#gain = 1;
    this.#poissonDenom = 1;
  }

  setDecay(timeInSample) {
    this.#decay = timeInSample < 1 ? 0 : Math.pow(Number.EPSILON, 1.0 / timeInSample);
  }

  process(rng, envelope) {
    this.#phase
      += 2 ** envelope * this.#density / this.#poissonDenom / (envelope + Number.EPSILON);

    if (this.#phase >= 1) {
      this.#phase -= Math.floor(this.#phase);
      this.#poissonDenom = -Math.log(1 - rng.number());
      this.#gain
        = util.normalDistributionMap(rng.number(), rng.number(), 0, envelope * 1 / 3);
    } else {
      this.#gain *= this.#decay;
    }
    return this.#gain;
  }
}
