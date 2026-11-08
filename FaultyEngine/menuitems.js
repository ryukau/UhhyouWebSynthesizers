// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {oversampleIirItems} from "../common/dsp/multirate.js";

export const oversampleItems = oversampleIirItems;
export const sampleRateScalerItems = ["1", "2", "4", "8", "16"];
export const noiseFilterItems = ["Lowpass", "Highpass", "Bandpass", "Notch"];
export const buzzerFeedbackSignItems = ["+ +", "+ -", "- +", "- -"];

export const segmentIntervalItems = [
  "12-EDO (Chromatic)",
  "Uniform / Linear",
  "Harmonic Nodes",
  "Engine Cylinder Firing Orders",
  "Slider-Crank / Piston Kinematics",
  "Two-Stroke Expansion Chamber",
  "Venturi Nozzle / Constriction",
  "Faulty Mechanical Tolerances",
];
