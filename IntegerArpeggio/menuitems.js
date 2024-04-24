// Copyright Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {oversampleLinearPhaseItems} from "../common/dsp/multirate.js";

export {filterTypeItems} from "../common/dsp/resonantfilter.js";

export const oversampleItems = oversampleLinearPhaseItems;
export const sampleRateScalerItems = ["1", "2", "4", "8", "16"];
export const basePeriodItems = ["2", "3", "5", "7", "11", "13", "17", "19", "23"];

export const pitchScaleItems = [
  "\"Notes in Scale\" List",
  "Just Intonation [0, 2, 7, 9]",
  "Just Intonation [0, 3, 7, 10]",
  "Just Intonation [0, 4, 7, 11]",
  "ET5",
  "Harmonic Series <= 16",
  "Harmonic Series Odd <= 15",
  "Pythagorean [0, 2, 4, 7, 9]",
  "Pythagorean [0, 3, 5, 8, 10]",
  "Detuned Major",
];

export const arpeggioScaleItems = [
  "\"Notes in Scale\" List",
  "Harmonic Series",
];
