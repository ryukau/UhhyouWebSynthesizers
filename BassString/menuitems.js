// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {oversampleIirItems} from "../common/dsp/multirate.js";

export const oversampleItems = oversampleIirItems;
export const sampleRateScalerItems = ["1", "2", "4", "8", "16"];
export const excitationItems =
  ["Tri-saw Pulse", "Surge Envelope", "Audio File", "Thumb Slap", "Finger Pop"];
export const noiseFilterItems = ["Lowpass", "Highpass", "Bandpass", "Notch"];
