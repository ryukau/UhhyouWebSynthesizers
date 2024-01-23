// Copyright 2022 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {palette, uiSize} from "../common/gui/palette.js";
import * as widget from "../common/gui/widget.js";
import * as parameter from "../common/parameter.js";
import * as util from "../common/util.js";
import * as wave from "../common/wave.js";

import * as menuitems from "./menuitems.js";

const version = 0;

const localRecipeBook = {
  "Default": {
    renderDuration: () => {},
    fadeIn: () => {},
    fadeOut: () => {},
    decayTo: () => {},
    overSample: () => {},
    sampleRateScaler: () => {},
    noiseStereo: () => {},
    nNode: () => {},
    nSystem: () => {},
  },
  "All": {
    renderDuration: () => {},
    fadeIn: () => {},
    fadeOut: () => {},
    overSample: () => {},
    sampleRateScaler: () => {},
    noiseStereo: () => {},
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

  renderDuration: new parameter.DecibelScale(-40, 40, false),
  fade: new parameter.DecibelScale(-60, 40, true),
  decayTo: new parameter.DecibelScale(util.ampToDB(1 / 2 ** 24), 0, false),
  overSample: new parameter.MenuItemScale(menuitems.oversampleItems),
  sampleRateScaler: new parameter.MenuItemScale(menuitems.sampleRateScalerItems),
  seed: new parameter.IntScale(0, 2 ** 53),

  limiterActive: new parameter.MenuItemScale(menuitems.limiterOnOffItems),
  limiterThreshold: new parameter.DecibelScale(-60, 60, false),

  waveSpeed: new parameter.DecibelScale(0, 80, false),
  damping: new parameter.DecibelScale(-40, 60, true),
  restitution: new parameter.LinearScale(0, 1),

  nSystem: new parameter.IntScale(1, 16),
  nNode: new parameter.DecibelScale(util.ampToDB(4), 80, false),
  lengthMeter: new parameter.LinearScale(0.1, 1),
  wireMix: new parameter.LinearScale(-1, 1),

  wireDistance: new parameter.DecibelScale(-80, -40, true),
  pullUpDistance: new parameter.LinearScale(-0.01, 0.01),
};

const param = {
  renderDuration: new parameter.Parameter(Math.E / 10, scales.renderDuration, true),
  fadeIn: new parameter.Parameter(0.0, scales.fade, true),
  fadeOut: new parameter.Parameter(0.002, scales.fade, true),
  decayTo: new parameter.Parameter(1, scales.decayTo, false),
  overSample: new parameter.Parameter(4, scales.overSample),
  sampleRateScaler: new parameter.Parameter(0, scales.sampleRateScaler),
  seed: new parameter.Parameter(0, scales.seed),

  limiterActive: new parameter.Parameter(0, scales.limiterActive, true),
  limiterThreshold: new parameter.Parameter(1, scales.limiterThreshold, false),

  waveSpeed0: new parameter.Parameter(100, scales.waveSpeed, true),
  damping0: new parameter.Parameter(50, scales.damping, true),
  restitution0: new parameter.Parameter(0.99, scales.restitution),

  waveSpeed1: new parameter.Parameter(150, scales.waveSpeed, true),
  damping1: new parameter.Parameter(50, scales.damping, true),
  restitution1: new parameter.Parameter(0.99, scales.restitution),

  nSystem: new parameter.Parameter(1, scales.nSystem),
  nNode: new parameter.Parameter(384, scales.nNode, true),
  lengthMeter: new parameter.Parameter(0.5, scales.lengthMeter),
  wireDistance: new parameter.Parameter(0.0001, scales.wireDistance, true),
  wireMix: new parameter.Parameter(0.5, scales.wireMix),

  pickUpPoint: new parameter.Parameter(0.5, scales.defaultScale),
  pullUpPoint: new parameter.Parameter(0.5, scales.defaultScale),
  pullUpDistance: new parameter.Parameter(0.001, scales.pullUpDistance, true),
  pullUpWidth: new parameter.Parameter(1, scales.defaultScale),
  pickUpRandomRange: new parameter.Parameter(0.5, scales.defaultScale),
  pullUpRandomRange: new parameter.Parameter(0.5, scales.defaultScale),
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
const detailLimiter = widget.details(divLeft, "Limiter");
const detailWave0 = widget.details(divRight, "Wave0");
const detailWave1 = widget.details(divRight, "Wave1");
const detailShared = widget.details(divRight, "Shared");
const detailInteraction = widget.details(divRight, "Interaction");

const ui = {
  renderDuration:
    new widget.NumberInput(detailRender, "Duration [s]", param.renderDuration, render),
  fadeIn: new widget.NumberInput(detailRender, "Fade-in [s]", param.fadeIn, render),
  fadeOut: new widget.NumberInput(detailRender, "Fade-out [s]", param.fadeOut, render),
  decayTo: new widget.NumberInput(detailRender, "Decay To [dB]", param.decayTo, render),
  overSample:
    new widget.ComboBoxLine(detailRender, "Over-sample", param.overSample, render),
  sampleRateScaler: new widget.ComboBoxLine(
    detailRender, "Sample Rate Scale", param.sampleRateScaler, render),
  seed: new widget.NumberInput(detailRender, "Seed", param.seed, render),

  limiterActive: new widget.ToggleButtonLine(
    detailLimiter, menuitems.limiterOnOffItems, param.limiterActive, render),
  limiterThreshold: new widget.NumberInput(
    detailLimiter, "Threshold [dB]", param.limiterThreshold, render),

  waveSpeed0:
    new widget.NumberInput(detailWave0, "Wave Speed [m/s]", param.waveSpeed0, render),
  damping0: new widget.NumberInput(detailWave0, "Damping", param.damping0, render),
  restitution0:
    new widget.NumberInput(detailWave0, "Restitution", param.restitution0, render),

  waveSpeed1:
    new widget.NumberInput(detailWave1, "Wave Speed [m/s]", param.waveSpeed1, render),
  damping1: new widget.NumberInput(detailWave1, "Damping", param.damping1, render),
  restitution1:
    new widget.NumberInput(detailWave1, "Restitution", param.restitution1, render),

  nSystem: new widget.NumberInput(detailShared, "nSystem", param.nSystem, render),
  nNode: new widget.NumberInput(detailShared, "nNode", param.nNode, render),
  lengthMeter:
    new widget.NumberInput(detailShared, "Wire Length [m]", param.lengthMeter, render),
  wireDistance:
    new widget.NumberInput(detailShared, "Distance [m]", param.wireDistance, render),
  wireMix: new widget.NumberInput(detailShared, "Mix", param.wireMix, render),

  pickUpPoint:
    new widget.NumberInput(detailInteraction, "Pick-up Point", param.pickUpPoint, render),
  pullUpPoint:
    new widget.NumberInput(detailInteraction, "Pull-up Point", param.pullUpPoint, render),
  pullUpDistance: new widget.NumberInput(
    detailInteraction, "Pull-up Distance [m]", param.pullUpDistance, render),
  pullUpWidth:
    new widget.NumberInput(detailInteraction, "Pull-up Width", param.pullUpWidth, render),
  pickUpRandomRange: new widget.NumberInput(
    detailInteraction, "Pick-up Random", param.pickUpRandomRange, render),
  pullUpRandomRange: new widget.NumberInput(
    detailInteraction, "Pull-up Random", param.pullUpRandomRange, render),
};

render();
window.addEventListener("load", (ev) => { widget.refresh(ui); });
