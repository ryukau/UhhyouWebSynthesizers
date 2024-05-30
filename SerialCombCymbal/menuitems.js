// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {oversampleLinearPhaseItems} from "../common/dsp/multirate.js";

export const oversampleItems = oversampleLinearPhaseItems;
export const sampleRateScalerItems = ["1", "2", "4", "8", "16"];

export const delayNetworkType = ["Allpass", "Lattice"];
export const timeDistribution = ["Overtone", "Uniform"];
export const cascadingOrderItems = ["Ascending", "Descending", "Random"];

export const delayInterpTypeItems = [
  "None - Noisy Modulation",
  "Linear",
  "Cubic - Slightly brighter",
];
