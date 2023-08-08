// Copyright 2022 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

export function normalizedCutoffToOnePoleKp(cutoff) {
  const y = 1 - Math.cos(2 * Math.PI * cutoff);
  return Math.sqrt((y + 2) * y) - y;
}

export function cutoffToOnePoleKp(sampleRate, cutoffHz) {
  return normalizedCutoffToOnePoleKp(cutoffHz / sampleRate);
}

export function timeToOnePoleKp(samples) {
  if (samples < Number.EPSILON) return 1;
  return normalizedCutoffToOnePoleKp(1 / samples);
}

export class EMAFilter {
  constructor() {
    this.kp = 1;
    this.reset();
  }

  reset(value = 0) { this.value = value; }

  // `cutoff` is normalized frequency in [0.0, 0.5].
  setCutoff(cutoff) { this.kp = normalizedCutoffToOnePoleKp(cutoff); }
  setCutoffFromTime(samples) { this.kp = timeToOnePoleKp(samples); }
  process(input) { return this.value += this.kp * (input - this.value); }
}

export class DoubleEMAFilter {
  constructor() {
    this.kp = 1;
    this.reset();
  }

  reset(value = 0) {
    this.v1 = value;
    this.v2 = value;
  }

  // `cutoff` is normalized frequency in [0.0, 0.5].
  setCutoff(cutoff) { this.kp = normalizedCutoffToOnePoleKp(cutoff); }
  setCutoffFromTime(samples) { this.kp = timeToOnePoleKp(samples); }

  process(input) {
    this.v1 += this.kp * (input - this.v1);
    this.v2 += this.kp * (this.v1 - this.v2);
    return this.v2;
  }
}

export class EMAHighpass {
  constructor() {
    this.kp = 1;
    this.reset();
  }

  reset(value = 0) { this.v1 = value; }

  // `cutoff` is normalized frequency in [0.0, 0.5].
  setCutoff(cutoff) { this.kp = normalizedCutoffToOnePoleKp(cutoff); }

  process(input) {
    this.v1 += this.kp * (input - this.v1);
    return input - this.v1;
  }
}

export class RateLimiter {
  constructor(rate, initialValue = 0) {
    this.rate = rate;
    this.reset(initialValue);
  }

  reset(value = 0) { this.value = value; }
  add(rhs) { this.value += rhs; }

  process(target) {
    const diff = target - this.value;
    if (diff > this.rate) {
      this.value += this.rate;
    } else if (diff < -this.rate) {
      this.value -= this.rate;
    } else {
      this.value = target;
    }
    return this.value;
  }
}
