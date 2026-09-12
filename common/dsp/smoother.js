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

/**
Alternative cutoff that is the frequency of -45° phase shift.

Constraint:
0 < normalizedCutoff <= 0.125 (i.e., 0 < fc/fs <= 1/8).

@param {number} normalizedCutoff - Normalized cutoff frequency [fc / fs).
@returns {number} The EMA smoothing factor alpha in [0, 1 - 1/√2].
@throws {RangeError} If normalizedCutoff is outside [0, 0.125].
*/
export function cutoffPhaseToEmaAlpha(normalizedCutoff) {
  if (normalizedCutoff < 0 || normalizedCutoff > 0.125) {
    throw new RangeError(
      `normalizedCutoff must be in the range (0, 0.125], got ${normalizedCutoff}`);
  }
  const omega = 2 * Math.PI * normalizedCutoff;
  const sn = Math.sin(omega);
  const cs = Math.sqrt(1 - sn * sn); // Accurate for the input range of this function.
  const v = cs + sn;
  return (2 * sn * cs) / (v * (v + 1));
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

export class EmaPeakingFilter {
  /**
  @param {number} cutoff - Normalized center frequency f0 in [0, 0.5] (i.e. f / fs).
  @param {number} bandWidth - Bandwidth in octaves.
  @param {number} gain - Peaking gain (1.0 = flat bypass).
  */
  constructor(cutoff, bandWidth, gain) {
    this.s1 = 0.0;
    this.s2 = 0.0;

    this.b0 = 1.0;
    this.b1 = 0.0;
    this.b2 = 0.0;
    this.a1 = 0.0;
    this.a2 = 0.0;

    this.update(cutoff, bandWidth, gain);
  }

  update(cutoff, bandWidth, gain) {
    const ratio = 2.0 ** (bandWidth * 0.5);
    const fLow = Math.min(cutoff * ratio, 0.5);
    const fHigh = Math.max(cutoff / ratio, 0);

    const kpLow = cutoffToEmaAlpha(fLow);
    const kpHigh = cutoffToEmaAlpha(fHigh);

    const q = kpLow - 1.0;
    const r = kpHigh - 1.0;
    this.a1 = q + r;
    this.a2 = q * r;

    const sn0 = Math.sin(Math.PI * cutoff);
    const sn0Sq = sn0 * sn0;

    let b0Bp = 0.0;
    if (sn0 > 0.0) {
      const dL = Math.sqrt(kpLow * kpLow + 4.0 * (1.0 - kpLow) * sn0Sq);
      const dH = Math.sqrt(kpHigh * kpHigh + 4.0 * (1.0 - kpHigh) * sn0Sq);
      b0Bp = (dL * dH) / (2.0 * sn0);
    }

    const b1Bp = -b0Bp;
    const gDiff = gain - 1.0;

    this.b0 = 1.0 + gDiff * b0Bp;
    this.b1 = this.a1 + gDiff * b1Bp;
    this.b2 = this.a2;
  }

  reset() {
    this.s1 = 0.0;
    this.s2 = 0.0;
  }

  process(x) {
    const y = this.b0 * x + this.s1;
    this.s1 = this.b1 * x - this.a1 * y + this.s2;
    this.s2 = this.b2 * x - this.a2 * y;
    return y;
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
