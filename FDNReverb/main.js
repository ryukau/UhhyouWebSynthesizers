// Copyright 2022 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {uiSize} from "../common/gui/palette.js";
import * as widget from "../common/gui/widget.js";
import * as parameter from "../common/parameter.js";
import * as util from "../common/util.js"
import * as wave from "../common/wave.js";

import * as menuitems from "./menuitems.js";

const version = 0;

const localRecipeBook = {
  "Default": {
    renderDuration: () => {},
    matrixSize: () => {},
    fadeOut: () => {},
    overSample: () => {},
    sampleRateScaler: () => {},
    lowpassCutoffHz: () => {},
    highpassCutoffHz: () => {},
    delayTime:
      (prm) => { prm.forEach(e => { e.dsp = 0.01 + 0.01 * Math.random() - 0.005; }); },
  },
};

function getSampleRateScaler() {
  return parseInt(menuitems.sampleRateScalerItems[param.sampleRateScaler.dsp]);
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
      sampleRate: audio.audioContext.sampleRate * getSampleRateScaler(),
      maxDelayTime: scales.delayTime.maxDsp,
    }),
    "link",
    playControl.togglebuttonQuickSave.state === 1,
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
  sampleRateScaler: new parameter.MenuItemScale(menuitems.sampleRateScalerItems),

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
  sampleRateScaler: new parameter.Parameter(0, scales.sampleRateScaler),

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

const recipeBook
  = parameter.addLocalRecipes(localRecipeBook, await parameter.loadJson(param, []));

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

const recipeExportDialog = new widget.RecipeExportDialog(document.body, (ev) => {
  parameter.downloadJson(
    param, version, recipeExportDialog.author, recipeExportDialog.recipeName);
});
const recipeImportDialog = new widget.RecipeImportDialog(document.body, (ev, data) => {
  widget.option(playControl.selectRandom, parameter.addRecipe(param, recipeBook, data));
});

const playControl = widget.playControl(
  divLeft,
  (ev) => { audio.play(getSampleRateScaler()); },
  (ev) => { audio.stop(); },
  (ev) => { audio.save(false, [], getSampleRateScaler()); },
  (ev) => {},
  (ev) => {
    recipeBook.get(playControl.selectRandom.value).randomize(param);
    onMatrixSizeChanged(param.matrixSize.defaultDsp);
    widget.refresh(ui);
  },
  [...recipeBook.keys()],
  (ev) => {
    const recipeOptions = {author: "temp", recipeName: util.getTimeStamp()};
    const currentRecipe = parameter.dumpJsonObject(param, version, recipeOptions);
    const optionName = parameter.addRecipe(param, recipeBook, currentRecipe);
    widget.option(playControl.selectRandom, optionName);
  },
  (ev) => { recipeExportDialog.open(); },
  (ev) => { recipeImportDialog.open(); },
);

const detailRender = widget.details(divLeft, "Render");
const detailFdn = widget.details(divLeft, "FDN");
const detailDelay = widget.details(divRight, "Delay & Filter");

const ui = {
  renderDuration:
    new widget.NumberInput(detailRender, "Duration [s]", param.renderDuration, render),
  fadeOut: new widget.NumberInput(detailRender, "Fade-out [s]", param.fadeOut, render),
  overSample:
    new widget.ComboBoxLine(detailRender, "Over-sample", param.overSample, render),
  sampleRateScaler: new widget.ComboBoxLine(
    detailRender, "Sample Rate Scale", param.sampleRateScaler, render),

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
window.addEventListener("load", (ev) => { widget.refresh(ui); });
