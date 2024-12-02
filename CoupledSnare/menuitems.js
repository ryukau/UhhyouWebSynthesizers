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
  "Sine (1 Cycle)",
  "Exp. Decay",
  "Sine + LP Noise",
];

export const delayInterpTypeItems = [
  "None",
  "Linear",
  "Cubic",
];

export const membranePitchTypeItems = [
  "jn_zeros",
  "jn_zeros_tr",
  "jnp_zeros",
  "jnp_zeros_tr",
  "yn_zeros",
  "yn_zeros_tr",
  "ynp_zeros",
  "ynp_zeros_tr",
];
