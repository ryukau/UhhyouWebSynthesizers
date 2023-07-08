// Copyright 2023 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

/**
1-pole matched high-shelving filter.

Reference:
- https://vicanek.de/articles/ShelvingFits.pdf
  - Martin Vicanek, "Matched One-Pole Digital Shelving Filters", revised 2019-09-24.
*/
class MatchedHighShelf1 {
  constructor() {
    this.x1 = 0;
    this.y1 = 0;

    this.c0 = 0;
    this.c1 = 0;
    this.c2 = 0;
  }

  nyquistGain() { return (this.c0 - this.c1) / (1 + this.c2); }

  setCutoff(cutoffNormalized, gainAmp) {
    const minCut = 10.0 / 48000.0;
    const maxCut = 20000.0 / 44100.0;
    if (cutoffNormalized < minCut) {
      cutoffNormalized = minCut;
      gainAmp = 1;
    } else if (cutoffNormalized > maxCut) {
      cutoffNormalized = maxCut;
      gainAmp = 1;
    }

    const φ_m = 1 - Math.cos(Math.PI * 0.9);
    const p = 2 / (Math.PI * Math.PI);
    const ξ = p / (φ_m * φ_m) - 1 / φ_m;

    const fc2 = cutoffNormalized * cutoffNormalized / 4;
    const α = ξ + p / (gainAmp * fc2);
    const β = ξ + p * gainAmp / fc2;

    const neg_a1 = α / (1 + α + Math.sqrt(1 + 2 * α));
    const b = -β / (1 + β + Math.sqrt(1 + 2 * β));
    this.c0 = (1 - neg_a1) / (1 + b); // b0
    this.c1 = b * this.c0;            // b1
    this.c2 = neg_a1;                 // -a1
  }

  process(x0) {
    const y0 = this.c0 * x0 + this.c1 * this.x1 + this.c2 * this.y1;
    this.x1 = x0;
    this.y1 = y0;
    return y0;
  }
}

export class SlopeFilter {
  constructor(nCascade) {
    nCascade = nCascade < 0 ? 1 : nCascade;

    this.filters = new Array(nCascade);
    for (let i = 0; i < this.filters.length; ++i) {
      this.filters[i] = new MatchedHighShelf1();
    }

    this.gain = 1;
  }

  lowshelfGain() {
    let gain = 1;
    for (let flt of this.filters) gain *= flt.nyquistGain();
    return 1 / Math.max(gain, Number.EPSILON);
  }

  setCutoff(sampleRate, startHz, slopeAmp, isHighshelf = true) {
    if (isHighshelf) {
      let cutoff = startHz / sampleRate;
      for (let flt of this.filters) {
        flt.setCutoff(cutoff, slopeAmp);
        cutoff *= 2;
      }
      this.gain = 1;
      return;
    }

    // Low shelf.
    let cutoff = startHz / sampleRate;
    for (let flt of this.filters) {
      flt.setCutoff(cutoff, slopeAmp);
      cutoff *= 0.5;
    }
    this.gain = lowshelfGain();
  }

  process(x0) {
    for (let flt of this.filters) x0 = flt.process(x0);
    return this.gain * x0;
  }
}
