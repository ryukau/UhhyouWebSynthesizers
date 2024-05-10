// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {oversampleIirItems} from "../common/dsp/multirate.js";

export {filterTypeItems} from "../common/dsp/resonantfilter.js";

export const oversampleItems = oversampleIirItems;
export const sampleRateScalerItems = ["1", "2", "4", "8", "16"];
export const basePeriodItems = ["2", "3", "5", "7", "11", "13", "17", "19", "23"];
export const unisonDetuneTypeItems = ["Upper Bound", "Pile Up"];
export const arpeggioDirectionItems = ["Up", "Down", "Random"];
