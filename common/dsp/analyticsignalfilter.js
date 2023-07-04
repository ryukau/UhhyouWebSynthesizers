// Copyright 2023 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

export class AnalyticSignalFilter {
  #coRe =
    [0.16175849836770106, 0.7330289323414905, 0.9453497003291133, 0.9905991566845292];
  #coIm = [0.47940086558884, 0.8762184935393101, 0.9765975895081993, 0.9974992559355491];

  #x1Re = new Array(this.#coRe.length).fill(0);
  #x2Re = new Array(this.#coRe.length).fill(0);
  #y1Re = new Array(this.#coRe.length).fill(0);
  #y2Re = new Array(this.#coRe.length).fill(0);

  #x1Im = new Array(this.#coIm.length).fill(0);
  #x2Im = new Array(this.#coIm.length).fill(0);
  #y1Im = new Array(this.#coIm.length).fill(0);
  #y2Im = new Array(this.#coIm.length).fill(0);

  #delayedIm = 0;

  reset() {
    this.#x1Re.fill(0);
    this.#x2Re.fill(0);
    this.#y1Re.fill(0);
    this.#y2Re.fill(0);

    this.#x1Im.fill(0);
    this.#x2Im.fill(0);
    this.#y1Im.fill(0);
    this.#y2Im.fill(0);

    this.#delayedIm = 0;
  }

  process(input) {
    let sigRe = input;
    for (let i = 0; i < this.#coRe.length; ++i) {
      let y0 = this.#coRe[i] * (sigRe + this.#y2Re[i]) - this.#x2Re[i];
      this.#x2Re[i] = this.#x1Re[i];
      this.#x1Re[i] = sigRe;
      this.#y2Re[i] = this.#y1Re[i];
      this.#y1Re[i] = y0;
      sigRe = y0;
    }

    let sigIm = input;
    for (let i = 0; i < this.#coIm.length; ++i) {
      let y0 = this.#coIm[i] * (sigIm + this.#y2Im[i]) - this.#x2Im[i];
      this.#x2Im[i] = this.#x1Im[i];
      this.#x1Im[i] = sigIm;
      this.#y2Im[i] = this.#y1Im[i];
      this.#y1Im[i] = y0;
      sigIm = y0;
    }
    let outIm = this.#delayedIm;
    this.#delayedIm = sigIm; // 1 sample delay.

    return {re: sigRe, im: outIm};
  }
}

export class SingleSideBandAmplitudeModulator {
  constructor() {
    this.carFilter = new AnalyticSignalFilter();
    this.modFilter = new AnalyticSignalFilter();
  }

  // Upper side band.
  processUpper(carrior, modulator) {
    const c0 = this.carFilter.process(carrior);
    const m0 = this.modFilter.process(modulator);
    return c0.re * m0.re - c0.im * m0.im;
  }

  // Lower side band.
  processLower(carrior, modulator) {
    const c0 = this.carFilter.process(carrior);
    const m0 = this.modFilter.process(modulator);
    return c0.re * m0.re + c0.im * m0.im;
  }
}
