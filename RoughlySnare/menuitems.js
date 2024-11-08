// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {oversampleIirItems} from "../common/dsp/multirate.js";

export const oversampleItems = oversampleIirItems;
export const sampleRateScalerItems = ["1", "2", "4", "8", "16"];

export const limiterTypeItems = [
  "Bypass",
  "Limiter",
  "Tanh",
];

export const excitationTypeItems = [
  "Original",
  "Sine (1 Cycle)",
  "Exp. Decay",
];

export const delayInterpTypeItems = [
  "None",
  "Linear",
  "Cubic",
];
