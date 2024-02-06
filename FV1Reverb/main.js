// Copyright 2024 Takamitsu Endo
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
    fadeOut: () => {},
    overSample: () => {},
    sampleRateScaler: () => {},
    delayInterpolation: () => {},
    nSection: () => {},
    nAllpass: () => {},
    delayTime:
      (prm) => { prm.forEach(e => { e.dsp = 0.01 + 0.01 * Math.random() - 0.005; }); },
  },
};

function getSampleRateScaler() {
  return parseInt(menuitems.sampleRateScalerItems[param.sampleRateScaler.dsp]);
}

function createArrayParameters(defaultDspValue, scale, nElements) {
  let arr = new Array(nElements);
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

function onDelayNumberChanged() {
  const nDelay = param.nSection.dsp * param.nAllpass.dsp;
  ui.delayTime.setViewRange(0, nDelay);
  ui.feed.setViewRange(0, nDelay);
  ui.sumGain.setViewRange(0, param.nSection.dsp);
  render();
}

const scales = {
  renderDuration: new parameter.DecibelScale(-40, 40, false),
  fade: new parameter.DecibelScale(-60, 40, true),
  overSample: new parameter.MenuItemScale(menuitems.oversampleItems),
  sampleRateScaler: new parameter.MenuItemScale(menuitems.sampleRateScalerItems),

  delayInterpolation: new parameter.MenuItemScale(menuitems.delayInterpolationItems),
  nSection: new parameter.IntScale(1, 64),
  nAllpass: new parameter.IntScale(1, 16),
  timeMultiplier: new parameter.DecibelScale(-40, 20, false),
  feedback: new parameter.NegativeDecibelScale(-60, 0, 1, true),

  seed: new parameter.IntScale(0, 2 ** 53),
  randomizeAmount: new parameter.LinearScale(0, 1),

  delayTime: new parameter.DecibelScale(-60, 0, true),
  feed: new parameter.LinearScale(-1, 1),
};

const param = {
  renderDuration: new parameter.Parameter(1, scales.renderDuration, true),
  fadeOut: new parameter.Parameter(0.002, scales.fade, true),
  overSample: new parameter.Parameter(1, scales.overSample),
  sampleRateScaler: new parameter.Parameter(0, scales.sampleRateScaler),

  delayInterpolation: new parameter.Parameter(1, scales.delayInterpolation),
  nSection: new parameter.Parameter(4, scales.nSection),
  nAllpass: new parameter.Parameter(4, scales.nAllpass),
  timeMultiplier: new parameter.Parameter(1.0, scales.timeMultiplier, true),
  feedback: new parameter.Parameter(0.98, scales.feedback, true),

  seed: new parameter.Parameter(0, scales.seed),
  randomDelayTime: new parameter.Parameter(0.01, scales.randomizeAmount),
  randomFeed: new parameter.Parameter(0.01, scales.randomizeAmount),

  delayTime: createArrayParameters(
    0.01, scales.delayTime, scales.nSection.max * scales.nAllpass.max),
  feed: createArrayParameters(0, scales.feed, scales.nSection.max * scales.nAllpass.max),
  sumGain: createArrayParameters(1, scales.feed, scales.nSection.max),
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

const detailTips = widget.details(divLeft, "Tips");
const paragraphTips = widget.paragraph(detailTips, undefined, undefined);
paragraphTips.textContent
  = "When the sound decays too fast, or is too metallic, raise `Time Multiplier` and/or `Feedback` in `Reverb` section."

const detailRender = widget.details(divLeft, "Render");
const detailReverb = widget.details(divLeft, "Reverb");
const detailStereo = widget.details(divLeft, "Stereo");
const detailLoop = widget.details(divRight, "Delay & Filter");

const ui = {
  renderDuration:
    new widget.NumberInput(detailRender, "Duration [s]", param.renderDuration, render),
  fadeOut: new widget.NumberInput(detailRender, "Fade-out [s]", param.fadeOut, render),
  overSample:
    new widget.ComboBoxLine(detailRender, "Over-sample", param.overSample, render),
  sampleRateScaler: new widget.ComboBoxLine(
    detailRender, "Sample Rate Scale", param.sampleRateScaler, render),

  delayInterpolation: new widget.ComboBoxLine(
    detailReverb, "Delay Interpolation", param.delayInterpolation, render),
  nSection: new widget.NumberInput(
    detailReverb, "nSection", param.nSection, onDelayNumberChanged),
  nAllpass: new widget.NumberInput(
    detailReverb, "nAllpass/Section", param.nAllpass, onDelayNumberChanged),
  timeMultiplier:
    new widget.NumberInput(detailReverb, "Time Multiplier", param.timeMultiplier, render),
  feedback: new widget.NumberInput(detailReverb, "Feedback", param.feedback, render),

  seed: new widget.NumberInput(detailStereo, "Seed", param.seed, render),
  randomDelayTime: new widget.NumberInput(
    detailStereo, "Random Delay Time", param.randomDelayTime, render),
  randomFeed:
    new widget.NumberInput(detailStereo, "Random Feed", param.randomFeed, render),

  delayTime: new widget.BarBox(
    detailLoop, "Delay Time [s]", uiSize.barboxWidth, uiSize.barboxHeight,
    param.delayTime, render),
  feed: new widget.BarBox(
    detailLoop, "Feed", uiSize.barboxWidth, uiSize.barboxHeight, param.feed, render),
  sumGain: new widget.BarBox(
    detailLoop, "Summing Gain", uiSize.barboxWidth, uiSize.barboxHeight, param.sumGain,
    render),
};

ui.feed.sliderZero = 0.5;
ui.sumGain.sliderZero = 0.5;

onDelayNumberChanged();
window.addEventListener("load", (ev) => { widget.refresh(ui); });
