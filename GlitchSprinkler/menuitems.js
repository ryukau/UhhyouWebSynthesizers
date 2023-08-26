// Copyright 2023 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {oversampleLinearPhaseItems} from "../common/dsp/multirate.js";

export const oversampleItems = oversampleLinearPhaseItems;
export const sampleRateScalerItems = ["1", "2", "4", "8", "16"];

export const pitchScaleItems = [
  "Chromatic",
  "Octave",
  "ET 5 Chromatic",
  "ET 12 Chromatic",
  "ET 12 Major",
  "ET 12 Minor",
  "ET 12 [0, 2, 7, 9]",
  "ET 12 [0, 3, 4, 5, 7]",
];
