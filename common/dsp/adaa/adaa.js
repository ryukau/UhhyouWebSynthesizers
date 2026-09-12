// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

export * from "./atan.js";
export * from "./bypass.js";
export * from "./cubicclip2b.js";
export * from "./fullwave.js";
export * from "./halfwave.js";
export * from "./hardclip.js";
export * from "./log1p.js";
export * from "./sawtooth.js";
export * from "./sine.js";
export * from "./softsign.js";
export * from "./tanh.js";
export * from "./triangle.js";
export * from "./evenquadraticclip.js"

export const saturatorAdaa1Items = [
  "Bypass",
  "Average",
  "Hardclip",
  "Cubicclip",
  "Tanh",
  "Atan",
  "Softsign",
  "Log1p",
  "Halfwave",
  "Fullwave",
  "EvenQuadraticClip",
  "Sawtooth",
  "Sine",
  "Triangle",
];

export class BiasedSaturatorAdaa {
  /**
   * @param {Object} saturator - ADAA processor instance (e.g. TanhAdaa1, HardclipAdaa1_fast).
   * @param {number} gain      - Pre-saturation input gain.
   * @param {number} bias      - Static DC bias offset added before saturation.
   * @param {number} dryMix    - Dry signal mix ratio.
   * @param {number} scale     - Post-saturation scaling factor (e.g. 0.37).
   */
  constructor(saturator, gain, bias, dryMix, scale) {
    if (saturator === undefined) {
      console.warn("BiasedSaturatorAdaa: 'saturator' parameter is undefined.");
    } else if (!saturator || typeof saturator.process !== "function") {
      console.warn(
        "BiasedSaturatorAdaa: 'saturator' must be an ADAA processor with a .process() method.",
      );
    }

    if (gain === undefined) {
      console.warn("BiasedSaturatorAdaa: 'gain' parameter is undefined.");
    } else if (typeof gain !== "number" || Number.isNaN(gain)) {
      console.warn(`BiasedSaturatorAdaa: 'gain' must be a valid number, got: ${gain}`);
    }

    if (bias === undefined) {
      console.warn("BiasedSaturatorAdaa: 'bias' parameter is undefined.");
    } else if (typeof bias !== "number" || Number.isNaN(bias)) {
      console.warn(`BiasedSaturatorAdaa: 'bias' must be a valid number, got: ${bias}`);
    }

    if (dryMix === undefined) {
      console.warn("BiasedSaturatorAdaa: 'dryMix' parameter is undefined.");
    } else if (typeof dryMix !== "number" || Number.isNaN(dryMix)) {
      console.warn(`BiasedSaturatorAdaa: 'dryMix' must be a valid number, got: ${dryMix}`);
    }

    if (scale === undefined) {
      console.warn("BiasedSaturatorAdaa: 'scale' parameter is undefined.");
    } else if (typeof scale !== "number" || Number.isNaN(scale)) {
      console.warn(`BiasedSaturatorAdaa: 'scale' must be a valid number, got: ${scale}`);
    }

    this.saturator = saturator;
    this.gain = gain;
    this.bias = bias;
    this.dryMix = dryMix;
    this.scale = scale;

    this.order = this.#getAdaaOrder(saturator);
    this.reset();
    this.biasOffset = this.saturator.process(this.bias);
  }

  #getAdaaOrder(saturator) {
    const className = saturator?.constructor?.name ?? "";
    const match = className.match(/Adaa(\d+)(?:_.*)?$/i);
    if (!match) {
      console.warn(`BiasedSaturatorAdaa: Failed to extract ADAA order from: ${className}`);
    }
    return match ? parseInt(match[1], 10) : 1;
  }

  reset() {
    this.saturator.reset();
    for (let i = 0; i < this.order; ++i) { this.saturator.process(this.bias); }
  }

  process(input) {
    const u = this.gain * input + this.bias;
    const sat = this.saturator.process(u);
    const y = this.scale * (sat - this.biasOffset);
    return y + this.dryMix * (input - y);
  }
}
