// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {clamp} from "../util.js"

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

// Constrained poles and zeros-based adaptive notch filters (CPZ-ANF) described in section
// II of following paper.
// - "DSP Implementation of Adaptive Notch Filters With Overflow Avoidance in Fixed-Point
//   Arithmetic" by Satoru Ishibashi, Shunsuke Koshita, Masahide Abe and Masayuki
//   Kawamata. (http://www.apsipa.org/proceedings/2018/pdfs/0001355.pdf)
export class AdaptiveNotchCPZ {
  constructor(sampleRate, initialGuessHz, narrownessOfNotch = 0.99, stepSizeScale = 1) {
    // `mu` means step size here. But there's no specification for this value. If `mu` is
    // too large, cutoff moves too fast and the filter blows up.
    this.mu = 1 / (stepSizeScale * sampleRate);

    this.rho = narrownessOfNotch;

    initialGuessHz = Math.min(Math.max(initialGuessHz, 0), sampleRate / 2);
    this.a = -2 * Math.cos(2 * Math.PI * initialGuessHz / sampleRate);

    this.x1 = 0;
    this.x2 = 0;
    this.y1 = 0;
    this.y2 = 0;

    this.aBound = 1.98;
  }

  process(x0) {
    const a1 = this.rho * this.a;
    const a2 = this.rho * this.rho;

    const y0 = x0 + this.a * this.x1 + this.x2 - a1 * this.y1 - a2 * this.y2;
    const s0 = this.x1 * (1 - this.rho * y0);
    this.a = clamp(this.a - 2 * y0 * s0 * this.mu, -this.aBound, this.aBound);

    this.x2 = this.x1;
    this.x1 = x0;
    this.y2 = this.y1;
    this.y1 = y0;

    return y0;
  }

  processNormalized(x0) {
    const a1 = this.rho * this.a;
    const a2 = this.rho * this.rho;
    const gain
      = this.a >= 0 ? (1 + a1 + a2) / (2 + this.a) : (1 - a1 + a2) / (2 - this.a);

    const denom = a1 * this.y1 + a2 * this.y2
    const y0 = x0 + this.a * this.x1 + this.x2 - denom;
    const s0 = (1 - this.rho) * x0 - this.rho * (1 - this.rho) * this.x2 - denom;
    this.a = clamp(this.a - 2 * y0 * s0 * this.mu, -this.aBound, this.aBound);

    this.x2 = this.x1;
    this.x1 = x0;
    this.y2 = this.y1;
    this.y1 = y0;

    return y0 * gain;
  }
}
