// Copyright 2023 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {clamp} from "../util.js";

// Reference:
// https://ryukau.github.io/filter_notes/resonant_one_pole_filter/resonant_one_pole_filter.html
export class ResonantOnePole {
  constructor() {
    this.v1 = 0;
    this.u1 = 0;
    this.u2 = 0;
  }

  // `resonance` in [0, 1].
  process(input, cutoffNormalized, resonance) {
    const freq = clamp(cutoffNormalized, 0, 0.4999);

    const s = 1 - Math.cos(2 * Math.PI * freq);
    const c1 = Math.sqrt(s * s + 2 * s) - s;

    const t = Math.tan(Math.PI * freq);
    const c2 = (t - 1) / (t + 1);

    const q = resonance * (c2 - c1 * c2 + 1);

    this.v1 = c2 * (this.u1 - this.v1) + this.u2;
    this.u2 = this.u1;
    return this.u1 += c1 * (input - this.u1) - q * this.v1;
  }
}
