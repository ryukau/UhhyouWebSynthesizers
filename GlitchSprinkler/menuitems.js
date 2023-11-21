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
  "ET 12 Crowded",
  "ET 12 Blues",
  "ET 12 Prometheus",
  "ET 12 Major Persian",
  "ET 12 Iwato",
  "ET 12 Whole Tone 2",
  "ET 12 Whole Tone 3",
  "ET 12 Whole Tone 4",
  "ET 12 Suspended 4",
  "ET 12 [0, 1, 2, 5, 7]",
  "ET 12 [0, 1, 2, 3, 6, 8, 10]",
  "ET 12 [0, 2, 5, 7]",
  "ET 12 [0, 2, 7, 9]",
  "ET 12 [0, 3, 4, 5, 7]",
  "ET 12 [0, 3, 6, 7, 10]",
  "ET 12 [0, 5, 7, 10, 11]",
  "ET 12 [0, 4, 7, 11, 14, 18, 21]",
  "Wild 3",
];
