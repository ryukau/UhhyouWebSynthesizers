// Copyright 2023 Takamitsu Endo
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
// - http://www.apsipa.org/proceedings/2018/pdfs/0001355.pdf
//   - "DSP Implementation of Adaptive Notch Filters With Overflow Avoidance in
//   Fixed-Point Arithmetic" by Satoru Ishibashi, Shunsuke Koshita, Masahide Abe and
//   Masayuki Kawamata.
//
// The above paper refers to a 1985 paper linked below.
// - https://www.ese.wustl.edu/~nehorai/paper/ieeeac85-2.pdf
//   - A. Nehorai, "A minimal parameter adaptive notch filter with constrained poles and
//   zeros," IEEE Trans. Acoust., Speech, Signal Process., vol. 33, no. 4, pp. 983–996,
//   Aug. 1985.
//
// Gain response of this notch filter looks not good for audio but maybe there's some
// application. Gain normalization is added for this implementation.
class AdaptiveNotchCPZ {
  constructor(sampleRate, initialGuessHz, narrownessOfNotch = 0.99) {
    this.mu = 1 / sampleRate; // Step size, but there's no specification for this value.
    this.rho = narrownessOfNotch;
    this.a = -2 * Math.cos(2 * Math.pi * initialGuessFrequencyNormalized);

    this.x1 = 0;
    this.x2 = 0;
    this.y1 = 0;
    this.y2 = 0;
  }

  process(x0) {
    const a1 = this.rho * this.a;
    const a2 = this.rho * this.rho;

    const y0 = x0 + this.a * this.x1 + this.x2 - a1 * this.y1 - a2 * this.y2;
    const s0 = this.x1 * (1 - this.rho * this.y0);
    this.a = clamp(this.a - 2 * y0 * s0 * this.mu, -2, 2);

    this.x2 = this.x1;
    this.x1 = x0;
    this.y2 = this.y1;
    this.y1 = y0;

    // Normalize max output gain to 0 dB.
    const zeroGain = 1 + a1 + a2;
    const nyquistGain = 1 - a1 + a2;
    const candidate = zeroGain >= nyquistGain ? zeroGain : nyquistGain;
    const denom = Math.abs(candidate) <= Number.EPSILON
      ? Math.sign(candidate) * Number.EPSILON
      : candidate;
    return y0 * (2 + this.a) / denom;
  }
}
