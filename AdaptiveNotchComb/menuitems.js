// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {oversampleIirItems} from "../common/dsp/multirate.js";

export const oversampleItems = oversampleIirItems;
export const sampleRateScalerItems = ["1", "2", "4", "8", "16"];

export const noiseDistributionItems = [
  "Binary",
  "Triangle",
  "Normal",
  "Random Walk",
];

export const adaptiveNotchTypeItems = ["AM", "CPZ"];
