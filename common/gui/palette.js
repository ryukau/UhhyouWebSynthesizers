// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {clamp} from "../util.js";

function rgbaInt(r, g, b, a) {
  const u8 = (value) => Math.floor(clamp(value, 0, 255));
  return `rgba(${u8(r)}, ${u8(b)}, ${u8(a) / 255})`;
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
  if (typeof document === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
}

export const palette = {
  get fontFamily() { return loadCSSVariable("--font-family");},
  get fontMonospace() { return loadCSSVariable("--monospace");},
  get fontSize() {
    const size = parseFloat(loadCSSVariable("--font-size-body"));
    return Number.isFinite(size) ? size : 12;
  },
  get fontWeightBase() { return parseFloat(loadCSSVariable("--font-weight-base"));},
  get fontWeightStrong() { return parseFloat(loadCSSVariable("--font-weight-strong"));},

  // Base Theme Colors
  get foreground() { return loadCSSVariable("--color-text-main");},
  get background() { return loadCSSVariable("--color-background");},
  get textDim() { return loadCSSVariable("--color-text-dim");},
  get fill() { return loadCSSVariable("--color-fill");},
  get borderLight() { return loadCSSVariable("--color-border-light");},
  get borderMid() { return loadCSSVariable("--color-border-mid");},
  get borderDark() { return loadCSSVariable("--color-border-dark");},

  // Highlights, Overlays & Signals
  get highlight() { return loadCSSVariable("--color-highlight");},
  get highlightButton() { return loadCSSVariable("--color-highlight");},
  get highlightMain() { return loadCSSVariable("--color-fill");},
  get highlightWarning() { return loadCSSVariable("--color-warning");},
  get overlay() { return loadCSSVariable("--color-overlay");},
  get overlayHighlight() { return loadCSSVariable("--color-overlay-highlight");},
  get waveform() { return loadCSSVariable("--color-waveform");},
  get accent() { return loadCSSVariable("--color-accent");},
  get shaded() { return loadCSSVariable("--color-shaded");},
  get unfocused() { return loadCSSVariable("--color-border-light");},
  get inactive() { return loadCSSVariable("--color-border-mid");},
};

const controlWidth = parseFloat(loadCSSVariable("--control-width")) * palette.fontSize;
export const uiSize = {
  controlWidth: controlWidth,
  waveViewWidth: controlWidth * 15 / 32,
  waveViewHeight: controlWidth * 8 / 32,
  bezierEnvelopeWidth: controlWidth * 15 / 32,
  bezierEnvelopeHeight: controlWidth * 8 / 32,
  barboxWidth: controlWidth * 31 / 32,
  barboxHeight: controlWidth * 12 / 32,
};
