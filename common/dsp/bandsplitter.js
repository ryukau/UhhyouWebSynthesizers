// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {cutoffToEmaAlpha} from "./smoother.js";

function cutoffToCoefficientA(fc) {
  const k = Math.tan(Math.PI * Math.max(0.00001, Math.min(0.49998, fc)));
  return (k - 1) / (k + 1);
}

class StageBLT {
  constructor(fc, k) {
    this.x = new Float64Array(k + 4);
    this.y = new Float64Array(k + 4);
    this.setA(cutoffToCoefficientA(fc));
  }

  reset() {
    this.x.fill(0);
    this.y.fill(0);
  }

  setA(a) {
    this.a = a;
    this.bn = 0.5 * (1 + a);
    this.b0 = 0.5 * (1 - a);
  }

  step(x, i, b0, b1) {
    const y = b0 * x + b1 * this.x[i] - this.a * this.y[i];
    this.x[i] = x;
    this.y[i] = y;
    return y;
  }

  processLP(x) { return this.step(this.step(x, 0, this.bn, this.bn), 1, this.bn, this.bn); }
  processHP(x) { return this.step(this.step(x, 2, this.b0, -this.b0), 3, this.b0, -this.b0); }
  processAP(i, x) { return this.step(x, 4 + i, this.a, 1); }
}

class StageEMA {
  constructor(fc, k) {
    this.x = new Float64Array(k + 4);
    this.y = new Float64Array(k + 4);
    this.setAlpha(cutoffToEmaAlpha(fc));
  }

  reset() {
    this.x.fill(0);
    this.y.fill(0);
  }

  setAlpha(alpha) {
    this.alpha = alpha;
    this.b = 1 - alpha;
    this.a = -this.b;
  }

  step(x, i, b0, b1) {
    const y = b0 * x + b1 * this.x[i] - this.a * this.y[i];
    this.x[i] = x;
    this.y[i] = y;
    return y;
  }

  processLP(x) { return this.step(this.step(x, 0, this.alpha, 0), 1, this.alpha, 0); }
  processHP(x) { return this.step(this.step(x, 2, this.b, -this.b), 3, this.b, -this.b); }
  processAP(i, x) { return this.step(x, 4 + i, -this.b, 1); }
}

// 2nd-order band splitter based on IIR Linkwitz-Riley or EMA crossovers.
//
// `crossover` is a float (2 band) or an Array (more than 3 band) of normalized crossover
// frequencies in [0, 0.5).
//
// `type` specifies the filter type: "blt" (Bilinear Transform) or "ema" (Exponential Moving
// Average). Only use "ema" for musical tuning purpose because the amplitude response of summed
// output it not flat.
export class BandSplitter2 {
  constructor(crossover, phaseCorrection = true, type = "blt") {
    this.stages = [];
    this.phaseCorrection = phaseCorrection;
    this.type = type;
    this.setCrossover(crossover);
  }

  reset() {
    for (const stage of this.stages) { stage.reset(); }
  }

  setCrossover(crossover, sampleRate = 44100) {
    if (crossover == null || (Array.isArray(crossover) && !crossover.length)) {
      this.stages = [];
      return;
    }

    const crs = Array.isArray(crossover) ? [...crossover].sort((a, b) => a - b) : [crossover];

    if (this.stages.length === crs.length) {
      if (this.type === "ema") {
        crs.forEach((fc, k) => this.stages[k].setAlpha(cutoffToEmaAlpha(fc)));
      } else {
        crs.forEach((fc, k) => this.stages[k].setA(cutoffToCoefficientA(fc)));
      }
    } else {
      if (this.type === "ema") {
        this.stages = crs.map((fc, k) => new StageEMA(fc, k));
      } else {
        this.stages = crs.map((fc, k) => new StageBLT(fc, k));
      }
    }
  }

  process(input) {
    const len = this.stages.length;
    if (!len) return [input];

    const bands = new Array(len + 1);
    bands[0] = input;

    for (let k = 0; k < len; k++) {
      const stage = this.stages[k];
      const val = bands[k];

      if (this.phaseCorrection) {
        for (let i = 0; i < k; i++) { bands[i] = stage.processAP(i, bands[i]); }
      }
      bands[k + 1] = -stage.processHP(val);
      bands[k] = stage.processLP(val);
    }

    return bands;
  }
}

// `BandMixer2` is a phase correction filter bank for `BandSplitter2`.
export class BandMixer2 {
  constructor(crossover, type = "blt") {
    this.stages = [];
    this.type = type;
    this.setCrossover(crossover);
  }

  reset() {
    for (const stage of this.stages) { stage.reset(); }
  }

  setCrossover(crossover, sampleRate = 44100) {
    if (crossover == null || (Array.isArray(crossover) && !crossover.length)) {
      this.stages = [];
      return;
    }

    const crs = Array.isArray(crossover) ? [...crossover].sort((a, b) => a - b) : [crossover];

    if (this.stages.length === crs.length) {
      if (this.type === "ema") {
        crs.forEach((fc, k) => this.stages[k].setAlpha(cutoffToEmaAlpha(fc)));
      } else {
        crs.forEach((fc, k) => this.stages[k].setA(cutoffToCoefficientA(fc)));
      }
    } else {
      if (this.type === "ema") {
        this.stages = crs.map((fc) => new StageEMA(fc, 1));
      } else {
        this.stages = crs.map((fc) => new StageBLT(fc, 1));
      }
    }
  }

  /**
   * Processes a single multi-band sample frame, applies deferred phase correction, and returns the
   * sum.
   * @param {Array<number>|Float64Array|Float32Array} bands - The input bands from a
   *   non-phase-corrected BandSplitter2.
   * @returns {number} The phase-aligned mixed sum.
   */
  process(bands) {
    const len = this.stages.length;
    if (!len) return bands[0];

    let acc = bands[0];
    for (let k = 1; k < len; k++) { acc = this.stages[k].processAP(0, acc) + bands[k]; }
    return acc + bands[len];
  }
}
