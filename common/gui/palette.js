// Copyright 2022 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {clamp} from "../util.js";

function rgbaInt(r, g, b, a) {
  const u8 = (value) => Math.floor(clamp(value, 0, 255));
  return `rgba(${u8(r)}, ${u8(g)}, ${u8(b)}, ${u8(a) / 255})`;
}

// `colorCode` is "#rrggbb".
function rgbStr(colorCode) {
  colorCode = colorCode.replace(/\s+/g, "");
  const hex = (a, b) => parseInt(colorCode.slice(a, b), 16);
  return `rgb(${hex(1, 3)}, ${hex(3, 5)}, ${hex(5, 7)})`;
}

// `colorCode` is "#rrggbbaa".
function rgbaStr(colorCode) {
  colorCode = colorCode.replace(/\s+/g, "");
  const hex = (a, b) => parseInt(colorCode.slice(a, b), 16);
  return `rgba(${hex(1, 3)}, ${hex(3, 5)}, ${hex(5, 7)}, ${hex(7, 9) / 255})`;
}

function loadCSSVariable(variableName) {
  return getComputedStyle(document.body).getPropertyValue(variableName);
}

export const palette = {
  fontFamily: loadCSSVariable("--font-family"),
  fontMonospace: loadCSSVariable("--monospace"),
  fontSize: parseFloat(loadCSSVariable("font-size")),
  fontWeightBase: parseFloat(loadCSSVariable("--font-weight-base")),
  fontWeightStrong: parseFloat(loadCSSVariable("--font-weight-strong")),

  foreground: rgbaStr("#000000ff"),
  background: rgbaStr("#ffffffff"),
  boxBackground: rgbaStr("#ffffffff"),
  unfocused: rgbaStr("#ddddddff"),
  highlightMain: rgbStr(loadCSSVariable("--fill-color")),
  highlightAccent: rgbaStr("#13c136ff"),
  highlightButton: rgbaStr("#fcc04fff"),
  highlightWarning: rgbaStr("#fc8080ff"),
  overlay: rgbaStr("#00000088"),
  overlayHighlight: rgbaStr("#00ff0033"),
  overlayFaint: rgbaStr("#0000000b"),
  waveform: rgbaStr("#303030ff"),
  inactive: rgbaStr("#b0b0b0ff"),
};

const controlWidth = parseFloat(loadCSSVariable("--control-width")) * palette.fontSize;
export const uiSize = {
  controlWidth: controlWidth,
  waveViewWidth: controlWidth * 15 / 32,
  waveViewHeight: controlWidth * 8 / 32,
  barboxWidth: controlWidth,
  barboxHeight: controlWidth * 12 / 32,
};
