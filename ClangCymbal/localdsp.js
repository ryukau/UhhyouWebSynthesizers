import * as util from "../common/util.js"

// Basically `(S&H) * (noise)`.
export class SampleAndHoldNoise {
  #phase;
  #gain;
  #decay;
  #density;
  #noisePulseRatio;
  #poissonDenom;

  // `density` is inverse of average samples between impulses.
  constructor(density, noisePulseRatio, decayTimeInSample) {
    this.#density = density;
    this.#noisePulseRatio = noisePulseRatio;
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

  process(rng) {
    const noise = this.processPoissonProcess(this.#density, rng);
    const pulse = this.processBlit(this.#density);
    return noise + this.#noisePulseRatio * (pulse - noise);
  }

  processPoissonProcess(density, rng) {
    // Standard deviation (sigma) is set to 1/3 to normalize amplitude to almost [-1, 1].
    // 99.7% of the value falls between -3 sigma and +3 sigma (68–95–99.7 rule).
    const normal
      = (rng) => util.normalDistributionMap(rng.number(), rng.number(), 0, 1 / 3);

    this.#phase += density / this.#poissonDenom;

    if (this.#phase >= 1) {
      this.#phase -= Math.floor(this.#phase);
      this.#poissonDenom = -Math.log(1 - rng.number());
      this.#gain = normal(rng);
    } else {
      this.#gain *= this.#decay;
    }
    return this.#gain * normal(rng);
  }

  // Band limited impulse trains. Must be called after `processNoise()` to increment
  // phase.
  processBlit(density) {
    if (density < Number.EPSILON) return 0;
    const M = 2 * Math.floor(1 / (2 * density)) + 1;
    const x = M * this.#phase;
    const denom = Math.sin(Math.PI * x / M);
    if (Math.abs(denom) < Number.EPSILON) return 1;
    return density * Math.sin(Math.PI * x) / denom;
  }
}
