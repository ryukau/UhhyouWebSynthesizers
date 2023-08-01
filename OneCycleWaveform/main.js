// Copyright 2022 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {uiSize} from "../common/gui/palette.js";
import * as widget from "../common/gui/widget.js";
import * as parameter from "../common/parameter.js";
import * as util from "../common/util.js";
import * as wave from "../common/wave.js";

function randomize() {
  // selectRandom.value  === "Default"
  for (const key in param) {
    if (key === "renderSamples") continue;
    if (key === "highpass") continue;
    if (key === "lowpass") continue;
    if (Array.isArray(param[key])) {
      param[key].forEach(e => { e.normalized = Math.random(); });
    } else if (param[key].scale instanceof parameter.MenuItemScale) {
      param[key].normalized = Math.random();
    } else {
      param[key].normalized = Math.random();
    }
  }

  widget.refresh(ui);
  render();
}

function render() {
  audio.render(
    parameter.toMessage(param, {
      sampleRate: audio.audioContext.sampleRate,
    }),
    "perChannel",
    togglebuttonQuickSave.state === 1,
  );
}

const scales = {
  boolScale: new parameter.IntScale(0, 1),
  defaultScale: new parameter.LinearScale(0, 1),
  bipolarScale: new parameter.LinearScale(-1, 1),

  renderSamples: new parameter.IntScale(1, 2 ** 16),

  waveform: new parameter.LinearScale(0, 3),
  powerOf: new parameter.DecibelScale(-40, 40, false),
  skew: new parameter.DecibelScale(-40, 40, false),
  sineRatio: new parameter.IntScale(1, 1024),
  hardSync: new parameter.DecibelScale(-20, 20, false),
  spectralSpread: new parameter.DecibelScale(-40, 40, true),
  phaseSlope: new parameter.DecibelScale(-60, 60, true),

  cutoff: new parameter.DecibelScale(-60, 0, true),
  gain: new parameter.DecibelScale(-40, 40, true),
};

const param = {
  renderSamples: new parameter.Parameter(2048, scales.renderSamples),

  waveform: new parameter.Parameter(0, scales.waveform, true),
  powerOf: new parameter.Parameter(1, scales.powerOf, true),
  skew: new parameter.Parameter(1, scales.skew, true),
  sineShaper: new parameter.Parameter(0, scales.defaultScale, true),
  sineRatio: new parameter.Parameter(1, scales.sineRatio, true),
  hardSync: new parameter.Parameter(1, scales.hardSync, true),
  mirrorRange: new parameter.Parameter(1, scales.defaultScale, true),
  mirrorRepeat: new parameter.Parameter(0, scales.defaultScale, true),
  flip: new parameter.Parameter(-1, scales.bipolarScale, true),
  spectralSpread: new parameter.Parameter(1, scales.spectralSpread, true),
  phaseSlope: new parameter.Parameter(0, scales.phaseSlope, true),

  highpass: new parameter.Parameter(0, scales.cutoff, true),
  lowpass: new parameter.Parameter(1, scales.cutoff, true),
  notchStart: new parameter.Parameter(1, scales.cutoff, true),
  notchRange: new parameter.Parameter(0.01, scales.cutoff, true),

  lowshelfEnd: new parameter.Parameter(0, scales.cutoff, true),
  lowshelfGain: new parameter.Parameter(1, scales.gain, true),
};

// Add controls.
const pageTitle = widget.pageTitle(document.body);
const divMain = widget.div(document.body, "main", undefined);

const divLeft = widget.div(divMain, undefined, "controlBlock");
const divRight = widget.div(divMain, undefined, "controlBlock");

const headingWaveform = widget.heading(divLeft, 6, "Waveform");
const waveView = [
  new widget.WaveView(
    divLeft, uiSize.controlWidth, 2 * uiSize.waveViewHeight, undefined, false),
];

const audio = new wave.Audio(
  1,
  "./renderer.js",
  undefined,
  (wave) => {
    for (let i = 0; i < waveView.length; ++i) waveView[i].set(wave.data[i]);
  },
);

const pRenderStatus = widget.paragraph(divLeft, "renderStatus", undefined);
audio.renderStatusElement = pRenderStatus;

const divPlayControl = widget.div(divLeft, "playControl", undefined);
const selectRandom = widget.select(
  divPlayControl, "Randomize Recipe", "randomRecipe", undefined, ["Default"], "Default",
  (ev) => { randomize(); });
const buttonRandom = widget.Button(divPlayControl, "Random", (ev) => { randomize(); });
buttonRandom.id = "randomRecipe";
const spanPlayControlFiller = widget.span(divPlayControl, "playControlFiller", undefined);
const buttonPlay = widget.Button(divPlayControl, "Play", (ev) => { audio.play(); });
const buttonStop = widget.Button(divPlayControl, "Stop", (ev) => { audio.stop(); });
const buttonSave = widget.Button(divPlayControl, "Save", (ev) => { audio.save(true); });
const togglebuttonQuickSave = new widget.ToggleButton(
  divPlayControl, "QuickSave", undefined, undefined, 0, (ev) => {});

const createDetailInBlock = (name) => {
  const div = widget.div(divMain, undefined, "controlBlock");
  return widget.details(div, name);
};

const detailRender = widget.details(divLeft, "Render");
const detailShape = widget.details(divRight, "Shape");
const detailSpectral = widget.details(divRight, "Spectral");
const detailFilter = widget.details(divRight, "Filter");

const ui = {
  renderSamples: new widget.NumberInput(
    detailRender, "Duration [sample]", param.renderSamples, render),

  waveform: new widget.NumberInput(detailShape, "Sine-Saw-Pulse", param.waveform, render),
  powerOf: new widget.NumberInput(detailShape, "Power", param.powerOf, render),
  skew: new widget.NumberInput(detailShape, "Skew", param.skew, render),
  sineShaper:
    new widget.NumberInput(detailShape, "Sine Shaper", param.sineShaper, render),
  sineRatio: new widget.NumberInput(detailShape, "Sine Ratio", param.sineRatio, render),
  hardSync: new widget.NumberInput(detailShape, "Hard Sync.", param.hardSync, render),
  mirrorRange:
    new widget.NumberInput(detailShape, "Mirror Range", param.mirrorRange, render),
  mirrorRepeat:
    new widget.NumberInput(detailShape, "Mirror/Repeat", param.mirrorRepeat, render),
  flip: new widget.NumberInput(detailShape, "Flip", param.flip, render),

  spectralSpread: new widget.NumberInput(
    detailSpectral, "Spectral Spread", param.spectralSpread, render),
  phaseSlope:
    new widget.NumberInput(detailSpectral, "Phase Slope", param.phaseSlope, render),

  highpass: new widget.NumberInput(detailFilter, "Highpass", param.highpass, render),
  lowpass: new widget.NumberInput(detailFilter, "Lowpass", param.lowpass, render),
  notchStart:
    new widget.NumberInput(detailFilter, "Notch Start", param.notchStart, render),
  notchRange:
    new widget.NumberInput(detailFilter, "Notch Range", param.notchRange, render),
  lowshelfEnd:
    new widget.NumberInput(detailFilter, "Lowshelf End", param.lowshelfEnd, render),
  lowshelfGain:
    new widget.NumberInput(detailFilter, "Lowshelf Gain", param.lowshelfGain, render),
};

render();
window.addEventListener("load", (ev) => { widget.refresh(ui); });
