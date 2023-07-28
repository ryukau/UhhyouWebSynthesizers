// Copyright 2023 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

// Least mean square adaptive filter.
// - https://en.wikipedia.org/wiki/Least_mean_squares_filter
export class AdaptiveFilterLMS {
  constructor(firLength, lerningRate = 0.5) {
    this.fir = new Array(firLength).fill(0);
    this.src = new Array(firLength).fill(0);
    this.denom = 0;
    this.lerningRate = lerningRate;
  }

  // It works as a kind of noise reduction when `input` and `observed` are same signal.
  process(input, observed) {
    // This `denom` computation accumulates some round-off error. It works okay for audio
    // application, but it's a bad idea for non-audio application.
    this.denom -= this.src.at(-1) * this.src.at(-1);
    this.denom += input * input;

    for (let i = this.src.length - 2; i >= 0; --i) this.src[i + 1] = this.src[i];
    this.src[0] = input;

    let estimated = 0; // Adaptive filter output.
    for (let i = 0; i < this.src.length; ++i) estimated += this.fir[i] * this.src[i];

    const error = observed - estimated;

    let k = this.lerningRate * error;
    if (this.denom > Number.EPSILON) k /= this.denom;

    for (let i = 0; i < this.src.length; ++i) this.fir[i] += k * this.src[i];

    return error;
  }
}
