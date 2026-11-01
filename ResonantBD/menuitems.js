// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {oversampleIirItems} from "../common/dsp/multirate.js";

export const oversampleItems = oversampleIirItems;
export const sampleRateScalerItems = ["1", "2", "4", "8", "16"];
export {saturatorAdaa1Items} from "../common/dsp/adaa/adaa.js";

export const eqTypeItems = [
  "Bell",
  "High-Shelf",
];

export const noiseStereoItems = [
  "Mono",
  "Stereo",
];
