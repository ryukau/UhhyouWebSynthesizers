// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

// `cutoffNormalized` in [0, 0.5].
export function cutoffToEmaAlpha(cutoffNormalized) {
  const sn = Math.sin(Math.PI * cutoffNormalized);
  return 2 * sn / (Math.sqrt(sn * sn + 1) + sn);
}

export function cutoffToOnePoleKp(sampleRate, cutoffHz) {
  return cutoffToEmaAlpha(cutoffHz / sampleRate);
}

export function timeToOnePoleKp(samples) {
  if (samples < Number.EPSILON) return 1;
  return cutoffToEmaAlpha(1 / samples);
}

export class EMAFilter {
  constructor() {
    this.alpha = 1;
    this.reset();
  }

  reset(value = 0) { this.value = value; }

  // `cutoff` is normalized frequency in [0, 0.5].
  setCutoff(cutoff) { this.alpha = cutoffToEmaAlpha(cutoff); }
  setCutoffFromTime(samples) { this.alpha = timeToOnePoleKp(samples); }
  process(input) { return this.value += this.alpha * (input - this.value); }
}

export class DoubleEMAFilter {
  constructor() {
    this.alpha = 1;
    this.reset();
  }

  reset(value = 0) {
    this.v1 = value;
    this.v2 = value;
  }

  // `cutoff` is normalized frequency in [0, 0.5].
  setCutoff(cutoff) { this.alpha = cutoffToEmaAlpha(cutoff); }
  setCutoffFromTime(samples) { this.alpha = timeToOnePoleKp(samples); }

  process(input) {
    this.v1 += this.alpha * (input - this.v1);
    this.v2 += this.alpha * (this.v1 - this.v2);
    return this.v2;
  }
}

export class EMAHighpass {
  constructor() {
    this.alpha = 1;
    this.reset();
  }

  reset(value = 0) { this.v1 = value; }

  // `cutoff` is normalized frequency in [0, 0.5].
  setCutoff(cutoff) { this.alpha = cutoffToEmaAlpha(cutoff); }

  process(input) {
    this.v1 += this.alpha * (input - this.v1);
    return input - this.v1;
  }
}

export class EMAHighShelving {
  constructor() {
    this.alpha = 1;
    this.gain = 1;
    this.reset();
  }

  reset(value = 0) { this.v1 = value; }

  // `cutoff` is normalized frequency in [0.0, 0.5].
  setCutoff(cutoff) { this.alpha = cutoffToEmaAlpha(cutoff); }
  setCutoffFromTime(samples) { this.alpha = timeToOnePoleKp(samples); }
  setGain(gain) { this.gain = gain; }

  process(input) {
    this.v1 += this.alpha * (input - this.v1);
    const hp = input - this.v1;
    return input + (this.gain - 1) * hp;
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
