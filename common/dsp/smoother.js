export function normalizedCutoffToOnePoleKp(cutoff) {
  const y = 1 - Math.cos(2 * Math.PI * cutoff);
  return Math.sqrt((y + 2) * y) - y;
}

export function cutoffToOnePoleKp(sampleRate, cutoffHz) {
  return normalizedCutoffToOnePoleKp(cutoffHz / sampleRate);
}

export function timeToOnePoleKp(samples) {
  return normalizedCutoffToOnePoleKp(1 / samples);
}

export class DoubleEMAFilterKp {
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
  constructor() { this.reset(); }

  reset(value = 0) {
    this.value = value;
    this.target = value;
  }

  push(target) { this.target = target; }

  process(rate) {
    const diff = this.target - this.value;
    if (diff > rate) {
      this.value += rate;
    } else if (diff < -rate) {
      this.value -= rate;
    } else {
      this.value = this.target;
    }
    return this.value;
  }
}
