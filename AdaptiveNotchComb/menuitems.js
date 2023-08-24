// Copyright 2023 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {oversampleIirItems} from "../common/dsp/multirate.js";

export const oversampleItems = oversampleIirItems;

export const noiseDistributionItems = [
  "Binary",
  "Triangle",
  "Normal",
  "Random Walk",
];

export const notchInvertItems = [
  "Invert Off",
  "Invert On",
];
