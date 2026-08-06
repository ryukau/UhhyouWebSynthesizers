// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {oversampleIirItems} from "../common/dsp/multirate.js";

export const oversampleItems = oversampleIirItems;
export const sampleRateScalerItems = ["1", "2", "4", "8", "16"];
export const oscillatorTypeItems =
  ["Sine", "Sine AA (Gentle FM)", "Magic Oscillator (More Glitch)", "Triangle AA", "Sawtooth AA"];
export const envelopeTypeItems = ["Decay", "Surge (Gentle Attack)"];
