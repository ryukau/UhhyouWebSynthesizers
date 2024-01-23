// Copyright 2022 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {uiSize} from "../common/gui/palette.js";
import * as widget from "../common/gui/widget.js";
import * as parameter from "../common/parameter.js";
import * as util from "../common/util.js";
import * as wave from "../common/wave.js";

import * as menuitems from "./menuitems.js";

const version = 0;

const localRecipeBook = {
  "Default": {
    renderDuration: () => {},
    overSample: () => {},
    fadeOut: () => {},
    overSample: () => {},
    sampleRateScaler: () => {},
  },
  "Seed": {
    renderDuration: () => {},
    overSample: () => {},
    sampleRateScaler: () => {},
    fadeOutRatio: () => {},
    seed: (prm) => { prm.normalized = Math.random(); },
    stack: () => {},
    maxFrequency: () => {},
    pickCombFB: () => {},
    pickCombTime: () => {},
    distance: () => {},
  },
};

function getSampleRateScaler() {
  return parseInt(menuitems.sampleRateScalerItems[param.sampleRateScaler.dsp]);
}

function render() {
  audio.render(
    parameter.toMessage(param, {
      sampleRate: audio.audioContext.sampleRate * getSampleRateScaler(),
    }),
    "perChannel",
    playControl.togglebuttonQuickSave.state === 1,
  );
}

const scales = {
  defaultScale: new parameter.LinearScale(0, 1),
  bipolarScale: new parameter.LinearScale(-1, 1),

  renderDuration: new parameter.DecibelScale(-40, 40, false),
  overSample: new parameter.MenuItemScale(menuitems.oversampleItems),
  sampleRateScaler: new parameter.MenuItemScale(menuitems.sampleRateScalerItems),
  seed: new parameter.IntScale(0, Number.MAX_SAFE_INTEGER),

  stack: new parameter.IntScale(2, 64),
  maxFrequency: new parameter.DecibelScale(20, 60, false),
  pickCombFB: new parameter.NegativeDecibelScale(-60, 0, 1, true),
  pickCombTime:
    new parameter.DecibelScale(util.ampToDB(2 ** -2), util.ampToDB(2 ** 6), false),
  distance: new parameter.DecibelScale(util.ampToDB(0.004), util.ampToDB(0.2), true),
};

const param = {
  renderDuration: new parameter.Parameter(1, scales.renderDuration, true),
  overSample: new parameter.Parameter(0, scales.overSample),
  sampleRateScaler: new parameter.Parameter(0, scales.sampleRateScaler),
  fadeOutRatio: new parameter.Parameter(0.6, scales.defaultScale, true),
  seed: new parameter.Parameter(0, scales.seed),

  stack: new parameter.Parameter(24, scales.stack),
  maxFrequency: new parameter.Parameter(200, scales.maxFrequency, true),
  pickCombFB: new parameter.Parameter(0.3, scales.pickCombFB, true),
  pickCombTime: new parameter.Parameter(1, scales.pickCombTime, true),
  distance: new parameter.Parameter(0.02, scales.distance, true),
};

const recipeBook
  = parameter.addLocalRecipes(localRecipeBook, await parameter.loadJson(param, []));

// Add controls.
const pageTitle = widget.pageTitle(document.body);
const divMain = widget.div(document.body, "main", undefined);

const divLeft = widget.div(divMain, undefined, "controlBlock");
// const divRight = widget.div(divMain, undefined, "controlBlock");

const headingWaveform = widget.heading(divLeft, 6, "Waveform");
const waveView = [
  new widget.WaveView(
    divLeft, uiSize.waveViewWidth, uiSize.waveViewHeight, undefined, false),
  new widget.WaveView(
    divLeft, uiSize.waveViewWidth, uiSize.waveViewHeight, undefined, false),
];

const audio = new wave.Audio(
  2,
  "./renderer.js",
  undefined,
  (wave) => {
    for (let i = 0; i < waveView.length; ++i) waveView[i].set(wave.data[i]);
  },
);
for (let i = 0; i < waveView.length; ++i) waveView[i].set(audio.wave.data[i]);

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
    render();
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

const ui = {
  renderDuration:
    new widget.NumberInput(detailRender, "Duration [s]", param.renderDuration, render),
  overSample:
    new widget.ComboBoxLine(detailRender, "Over-sample", param.overSample, render),
  sampleRateScaler: new widget.ComboBoxLine(
    detailRender, "Sample Rate Scale", param.sampleRateScaler, render),
  fadeOutRatio:
    new widget.NumberInput(detailRender, "Fade-out Ratio", param.fadeOutRatio, render),
  seed: new widget.NumberInput(detailRender, "Seed", param.seed, render),

  stack: new widget.NumberInput(detailRender, "Stack", param.stack, render),
  maxFrequency:
    new widget.NumberInput(detailRender, "Max Frequency", param.maxFrequency, render),
  pickCombFB:
    new widget.NumberInput(detailRender, "PickCombFB", param.pickCombFB, render),
  pickCombTime:
    new widget.NumberInput(detailRender, "PickCombTime", param.pickCombTime, render),
  distance: new widget.NumberInput(detailRender, "Distance", param.distance, render),
};

render();
window.addEventListener("load", (ev) => { widget.refresh(ui); });
