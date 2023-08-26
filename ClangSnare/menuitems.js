// Copyright 2022 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {oversampleIirItems} from "../common/dsp/multirate.js";

export const oversampleItems = oversampleIirItems;
export const sampleRateScalerItems = ["1", "2", "4", "8", "16"];

export const combSumItems = [
  "Odd",
  "Even",
  "Tail",
  "Full",
];

export const delayInterpItems = [
  "None",
  "Linear",
];

export const matrixTypeItems = [
  "Orthogonal",
  "SpecialOrthogonal",
  "CirculantOrthogonal",
  "Circulant4",
  "Circulant8",
  "Circulant16",
  "Circulant32",
  "UpperTriangularPositive",
  "UpperTriangularNegative",
  "LowerTriangularPositive",
  "LowerTriangularNegative",
  "SchroederPositive",
  "SchroederNegative",
  "AbsorbentPositive",
  "AbsorbentNegative",
  "Hadamard",
  "Conference",
];
