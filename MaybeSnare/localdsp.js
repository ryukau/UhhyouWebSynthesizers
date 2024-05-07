// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {FeedbackDelayNetwork} from "../common/dsp/fdn.js";
import {RateLimiter} from "../common/dsp/smoother.js";
import * as util from "../common/util.js";

export class RandomPulse {
  constructor(threshold = 0.05, loss = 0.5, decayTimeInSamples = 1000) {
    this.reset();
    this.threshold = threshold;
    this.loss = loss;
    this.decayTimeInSamples = decayTimeInSamples;

    this.setDecay(decayTimeInSamples);
  }

  reset() { this.gain = 0; }

  setDecay(timeInSample) {
    this.decay = timeInSample < 1 ? 0 : Math.pow(Number.EPSILON, 1.0 / timeInSample);
  }

  process(rng, signal) {
    const diff = this.gain - signal;
    if (diff >= this.threshold) {
      this.setDecay(
        this.decayTimeInSamples * util.uniformFloatMap(rng.number(), 0.8, 1.25));
      this.gain = this.loss * diff;
      this.loss *= 0.99;
    } else {
      this.gain *= this.decay;
    }
    return this.gain;
  }
}

export class SnaredFDN extends FeedbackDelayNetwork {
  constructor(
    size,
    maxDelayTimeInSamples,
    lowpassType,
    highpassType,
    delayType,
    timeModulation,
    rateLimit,
    pulseThreshold,
    pulseLoss,
    pulseDecayInSamples,
  ) {
    super(size, maxDelayTimeInSamples, lowpassType, highpassType, delayType);

    this.delayTime = new Array(size);
    this.pulsar = new Array(size);
    for (let i = 0; i < size; ++i) {
      this.delayTime[i] = new RateLimiter(rateLimit);
      this.pulsar[i] = new RandomPulse(pulseThreshold, pulseLoss, pulseDecayInSamples);
    }

    this.neutralTime = new Array(size).fill(0);
    this.timeModulation = timeModulation;
  }

  setTimeAt(index, timeInSamples) {
    this.neutralTime[index] = timeInSamples;
    this.delayTime[index].reset(timeInSamples);
  }

  process(input, feedback, rng) {
    this.bufIndex ^= 1;
    let front = this.buf[this.bufIndex];
    let back = this.buf[this.bufIndex ^ 1];
    front.fill(0);
    for (let i = 0; i < front.length; ++i) {
      for (let j = 0; j < front.length; ++j) front[i] += this.matrix[i][j] * back[j];
    }

    for (let i = 0; i < front.length; ++i) {
      const fb = feedback * front[i];
      front[i] = input + fb + this.pulsar[i].process(rng, fb);

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

export class TimeModulatedFDN extends FeedbackDelayNetwork {
  constructor(
    size,
    maxDelayTimeInSamples,
    lowpassType,
    highpassType,
    delayType,
    timeModulation,
    rateLimit,
    impactPosition,
  ) {
    super(size, maxDelayTimeInSamples, lowpassType, highpassType, delayType);

    this.delayTime = new Array(size);
    for (let i = 0; i < size; ++i) this.delayTime[i] = new RateLimiter(rateLimit);

    this.neutralTime = new Array(size).fill(0);
    this.timeModulation = timeModulation;

    this.inputGain = new Array(size);
    const start = 1 + impactPosition;
    const slope = -2 * impactPosition / (size - 1);
    for (let i = 0; i < size; ++i) this.inputGain[i] = start + i * slope;
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
      front[i] = this.inputGain[i] * input + feedback * front[i];

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
