// Copyright 2022 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {oversampleLinearPhaseItems} from "../common/dsp/multirate.js";

export const oversampleItems = oversampleLinearPhaseItems;

export const delayType = [
  "Allpass",
  "Lattice",
];

export const timeDistribution = [
  "Overtone",
  "Uniform",
];
