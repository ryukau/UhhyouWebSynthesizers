// Copyright 2023 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {normalDistributionMap} from "../util.js";

import {HP1} from "./onepole.js";

export class BrownNoise {
  constructor(sampleRate, highpassCutoffHz, maxStep = 1e-3) {
    this.value = 0;
    this.highpass = new HP1();
    this.highpass.setCutoff(highpassCutoffHz / sampleRate);
    this.maxStep = maxStep;
  }

  process(rng) {
    const noise = normalDistributionMap(rng.number(), rng.number(), 0, this.maxStep / 3);
    return this.value = this.highpass.process(this.value + noise);
  }
}
