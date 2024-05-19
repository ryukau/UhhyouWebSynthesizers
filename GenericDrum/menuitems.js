// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {oversampleIirItems} from "../common/dsp/multirate.js";

export const oversampleItems = oversampleIirItems;
export const sampleRateScalerItems = ["1", "2", "4", "8", "16"];

export const compressorTypeItems = [
  "Bypass",
  "Low",
  "Flat",
  "High",
];

export const limiterTypeItems = [
  "Bypass",
  "Limiter",
  "Tanh",
];

export const pitchTypeItems = [
  "Harmonic",
  "Harmonic+12",
  "Harmonic*5",
  "Harmonic Cycle(1, 5)",
  "Harmonic Odd",
  "Semitone (1, 2, 7, 9)",
  "Circular Membrane Mode",
  "Prime Number",
  "Octave",
];
