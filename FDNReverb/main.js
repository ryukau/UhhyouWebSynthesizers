// Copyright 2022 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {uiSize} from "../common/gui/palette.js";
import * as widget from "../common/gui/widget.js";
import * as parameter from "../common/parameter.js";
import * as wave from "../common/wave.js";

import * as menuitems from "./menuitems.js";

function randomize() {
  for (const key in param) {
    if (key === "renderDuration") continue;
    if (key === "matrixSize") continue;
    if (key === "fadeOut") continue;
    if (key === "lowpassCutoffHz") continue;
    if (key === "highpassCutoffHz") continue;
    if (key === "delayTime") {
      param[key].forEach(e => { e.dsp = 0.01 + 0.01 * Math.random() - 0.005; });
      continue;
    }
    if (Array.isArray(param[key])) {
      param[key].forEach(e => { e.normalized = Math.random(); });
    } else if (param[key].scale instanceof parameter.MenuItemScale) {
      // Do nothing for now.
    } else {
      param[key].normalized = Math.random();
    }
  }

  render();
  widget.refresh(ui);
}

function createArrayParameters(defaultDspValue, scale) {
  let arr = new Array(scales.matrixSize.max);
  for (let i = 0; i < arr.length; ++i) {
    arr[i] = new parameter.Parameter(defaultDspValue, scale, true);
  }
  return arr;
}

function render() {
  audio.render(
    parameter.toMessage(param, {
      sampleRate: audio.audioContext.sampleRate,
      maxDelayTime: scales.delayTime.maxDsp,
    }),
    "link",
    togglebuttonQuickSave.state === 1,
  );
}

function onMatrixSizeChanged(value) {
  ui.delayTime.setViewRange(0, value);
  ui.lowpassCutoffHz.setViewRange(0, value);
  ui.highpassCutoffHz.setViewRange(0, value);
  render();
}

const scales = {
  renderDuration: new parameter.DecibelScale(-40, 40, false),
  fade: new parameter.DecibelScale(-60, 40, true),
  overSample: new parameter.MenuItemScale(menuitems.oversampleItems),

  matrixSize: new parameter.IntScale(1, 256),
  timeMultiplier: new parameter.LinearScale(0, 1),
  feedback: new parameter.NegativeDecibelScale(-60, 0, 1, true),
  matrixType: new parameter.MenuItemScale(menuitems.matrixTypeItems),
  seed: new parameter.IntScale(0, 2 ** 32),

  delayTime: new parameter.DecibelScale(-60, 0, true),
  lowpassCutoffHz: new parameter.MidiPitchScale(33.0, 136.0, false),
  highpassCutoffHz: new parameter.MidiPitchScale(-37.0, 81.0, true),
};

const param = {
  renderDuration: new parameter.Parameter(1, scales.renderDuration, true),
  fadeOut: new parameter.Parameter(0.002, scales.fade, true),
  overSample: new parameter.Parameter(1, scales.overSample),

  matrixSize: new parameter.Parameter(64, scales.matrixSize),
  timeMultiplier: new parameter.Parameter(1.0, scales.timeMultiplier),
  timeRandomAmount: new parameter.Parameter(0.01, scales.delayTime, true),
  feedback: new parameter.Parameter(0.98, scales.feedback, true),
  matrixType: new parameter.Parameter(0, scales.matrixType),
  seed: new parameter.Parameter(0, scales.seed),

  delayTime: createArrayParameters(0.01, scales.delayTime),
  lowpassCutoffHz:
    createArrayParameters(scales.lowpassCutoffHz.maxDsp, scales.lowpassCutoffHz),
  highpassCutoffHz: createArrayParameters(5, scales.highpassCutoffHz),
};

// Add controls.
const audio = new wave.Audio(
  2,
  "./renderer.js",
  undefined,
  (wave) => {
    for (let i = 0; i < waveView.length; ++i) waveView[i].set(wave.data[i]);
  },
);

const pageTitle = widget.pageTitle(document.body);
const divMain = widget.div(document.body, "main", undefined);

const divLeft = widget.div(divMain, undefined, "controlBlock");
const divRight = widget.div(divMain, undefined, "controlBlock");

const headingWaveform = widget.heading(divLeft, 6, "Waveform");
const waveView = [
  new widget.WaveView(
    divLeft, uiSize.waveViewWidth, uiSize.waveViewHeight, audio.wave.data[0], false),
  new widget.WaveView(
    divLeft, uiSize.waveViewWidth, uiSize.waveViewHeight, audio.wave.data[1], false),
];

const pRenderStatus = widget.paragraph(divLeft, "renderStatus", undefined);
audio.renderStatusElement = pRenderStatus;

const divPlayControl = widget.div(divLeft, "playControl", undefined);
const selectRandom = widget.select(
  divPlayControl, "Randomize Recipe", "randomRecipe", undefined, ["Default"], "Default",
  (ev) => { randomize(); });
const buttonRandom = widget.Button(divPlayControl, "Random", (ev) => { randomize(); });
buttonRandom.id = "randomRecipe";
const spanPlayControlFiller = widget.span(divPlayControl, "playControlFiller", undefined);
// spanPlayControlFiller.textContent = " ";
const buttonPlay = widget.Button(divPlayControl, "Play", (ev) => { audio.play(); });
const buttonStop = widget.Button(divPlayControl, "Stop", (ev) => { audio.stop(); });
const buttonSave = widget.Button(divPlayControl, "Save", (ev) => { audio.save(); });
const togglebuttonQuickSave = new widget.ToggleButton(
  divPlayControl, "QuickSave", undefined, undefined, 0, (ev) => {});

const detailRender = widget.details(divLeft, "Render");
const detailFdn = widget.details(divLeft, "FDN");
const detailDelay = widget.details(divRight, "Delay & Filter");

const ui = {
  renderDuration:
    new widget.NumberInput(detailRender, "Duration [s]", param.renderDuration, render),
  fadeOut: new widget.NumberInput(detailRender, "Fade-out [s]", param.fadeOut, render),
  overSample:
    new widget.ComboBoxLine(detailRender, "Over-sample", param.overSample, render),

  matrixSize: new widget.NumberInput(
    detailFdn, "Matrix Size", param.matrixSize, onMatrixSizeChanged),
  timeMultiplier:
    new widget.NumberInput(detailFdn, "Time Multiplier", param.timeMultiplier, render),
  timeRandomAmount:
    new widget.NumberInput(detailFdn, "Time Random", param.timeRandomAmount, render),
  feedback: new widget.NumberInput(detailFdn, "Feedback", param.feedback, render),
  matrixType: new widget.ComboBoxLine(detailFdn, "Matrix Type", param.matrixType, render),
  seed: new widget.NumberInput(detailFdn, "Seed", param.seed, render),

  delayTime: new widget.BarBox(
    detailDelay, "Delay Time [s]", uiSize.barboxWidth, uiSize.barboxHeight,
    param.delayTime, render),
  lowpassCutoffHz: new widget.BarBox(
    detailDelay, "Lowpass Cutoff [Hz]", uiSize.barboxWidth, uiSize.barboxHeight,
    param.lowpassCutoffHz, render),
  highpassCutoffHz: new widget.BarBox(
    detailDelay, "Highpass Cutoff [Hz]", uiSize.barboxWidth, uiSize.barboxHeight,
    param.highpassCutoffHz, render),
};

onMatrixSizeChanged(param.matrixSize.defaultDsp);
