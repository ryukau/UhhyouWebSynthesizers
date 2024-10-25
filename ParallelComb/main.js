// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {uiSize} from "../common/gui/palette.js";
import * as widget from "../common/gui/widget.js";
import * as parameter from "../common/parameter.js";
import * as util from "../common/util.js";
import * as wave from "../common/wave.js";

import * as menuitems from "./menuitems.js";

const version = 4;

const localRecipeBook = {
  "Default": {
    renderDuration: () => {},
    fadeIn: () => {},
    fadeOut: () => {},
    decayTo: () => {},
    stereoMerge: () => {},
    overSample: () => {},
    sampleRateScaler: () => {},
    toneSlope: () => {},

    nComb: () => {},
    // delayTimeBaseSecond: () => {},
    feedbackBase: () => {},
    cascadeGain: (prm) => { prm.dsp = util.uniformFloatMap(Math.random(), -0.2, 0.2); },
    crossRatio: () => {},
    delayTimeModAmount: () => {},

    feedbackRatio: () => {},
    bandpassQ: () => {},
  },
};

function getSampleRateScaler() {
  return parseInt(menuitems.sampleRateScalerItems[param.sampleRateScaler.dsp]);
}

function createArrayParameters(defaultDspValues, scale, size, displayDsp = false) {
  let arr = new Array(size);
  for (let i = 0; i < arr.length; ++i) {
    arr[i] = new parameter.Parameter(defaultDspValues[i], scale, displayDsp);
  }
  return arr;
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

function onCombCountChanged(value) {
  ui.combGain.setViewRange(0, value);
  ui.feedbackRatio.setViewRange(0, value);
  ui.bandpassQ.setViewRange(0, value);
  ui.combPitch.setViewRange(0, value);
  ui.bandpassPitch.setViewRange(0, value);
  render();
}

const scales = {
  boolean: new parameter.IntScale(0, 1),

  renderDuration: new parameter.DecibelScale(-60, 40, false),
  fade: new parameter.DecibelScale(-60, 40, true),
  decayTo: new parameter.DecibelScale(util.ampToDB(1 / 2 ** 24), 0, false),
  stereoMerge: new parameter.LinearScale(0, 1),
  overSample: new parameter.MenuItemScale(menuitems.oversampleItems),
  sampleRateScaler: new parameter.MenuItemScale(menuitems.sampleRateScalerItems),
  toneSlope: new parameter.DecibelScale(-12, 0, false),

  seed: new parameter.IntScale(0, 2 ** 32),
  stereoPitchCent: new parameter.LinearScale(0, 1200),

  nComb: new parameter.IntScale(1, 512),
  pitchType: new parameter.MenuItemScale(menuitems.pitchTypeItems),
  filterType: new parameter.MenuItemScale(menuitems.filterTypeItems),
  delayInterpType: new parameter.MenuItemScale(menuitems.delayInterpTypeItems),
  feedbackBase: new parameter.LinearScale(-0.999, 0.999),
  delayTimeBaseSecond: new parameter.DecibelScale(-100, -40, false),
  delayTimeModAmount: new parameter.LinearScale(-2, 2),
  crossRatio: new parameter.LinearScale(-1, 1),

  combGain: new parameter.DecibelScale(-30, 0, true),
  feedbackRatio: new parameter.NegativeDecibelScale(-60, 0, 1, true),
  bandpassQ: new parameter.LinearScale(0, 1),
  combPitch: new parameter.LinearScale(-24, 24),
};

const param = {
  renderDuration: new parameter.Parameter(2, scales.renderDuration, true),
  fadeIn: new parameter.Parameter(0.0, scales.fade, true),
  fadeOut: new parameter.Parameter(0.002, scales.fade, true),
  decayTo: new parameter.Parameter(1, scales.decayTo, false),
  stereoMerge: new parameter.Parameter(0.75, scales.stereoMerge),
  overSample: new parameter.Parameter(0, scales.overSample),
  sampleRateScaler: new parameter.Parameter(0, scales.sampleRateScaler),
  toneSlope: new parameter.Parameter(1, scales.toneSlope, false),

  seed: new parameter.Parameter(0, scales.seed, true),
  stereoPitchCent: new parameter.Parameter(0, scales.stereoPitchCent, true),

  nComb: new parameter.Parameter(16, scales.nComb, true),
  pitchType: new parameter.Parameter(1, scales.pitchType),
  filterType: new parameter.Parameter(0, scales.filterType),
  delayInterpType: new parameter.Parameter(0, scales.delayInterpType),
  delayTimeBaseSecond:
    new parameter.Parameter(30 / 44100, scales.delayTimeBaseSecond, true),
  delayTimeModAmount: new parameter.Parameter(0, scales.delayTimeModAmount, true),
  feedbackBase: new parameter.Parameter(0.999, scales.feedbackBase, true),
  cascadeGain: new parameter.Parameter(0, scales.crossRatio, true),
  crossRatio: new parameter.Parameter(0, scales.crossRatio, true),

  combGain: createArrayParameters(
    new Array(scales.nComb.max).fill(1), scales.combGain, scales.nComb.max),
  feedbackRatio: createArrayParameters(
    new Array(scales.nComb.max).fill(1.0), scales.feedbackRatio, scales.nComb.max, true),
  bandpassQ: createArrayParameters(
    new Array(scales.nComb.max).fill(0.5), scales.bandpassQ, scales.nComb.max, true),
  combPitch: createArrayParameters(
    new Array(scales.nComb.max).fill(0), scales.combPitch, scales.nComb.max),
  bandpassPitch: createArrayParameters(
    new Array(scales.nComb.max).fill(0), scales.combPitch, scales.nComb.max),
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
const divRightA = widget.div(divMain, undefined, "controlBlock");
const divRightB = widget.div(divMain, undefined, "controlBlock");

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
    onCombCountChanged(param.nComb.defaultDsp);
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
const paragraphTip1 = widget.paragraph(detailTips, undefined, undefined);
paragraphTip1.textContent = "Higher components on left."
const paragraphTip2 = widget.paragraph(detailTips, undefined, undefined);
paragraphTip2.textContent = "Set `Cascade Gain` around 0.1 to add metallic texture.";
const paragraphTip3 = widget.paragraph(detailTips, undefined, undefined);
paragraphTip3.textContent = "If `Cross Ratio` is not 0, it may blows up the system.";

const detailRender = widget.details(divLeft, "Render");
const detailStereo = widget.details(divLeft, "Stereo");
const detailCombA = widget.details(divRightA, "Comb");
const detailCombB = widget.details(divRightB, "Comb");

const ui = {
  renderDuration:
    new widget.NumberInput(detailRender, "Duration [s]", param.renderDuration, render),
  fadeIn: new widget.NumberInput(detailRender, "Fade-in [s]", param.fadeIn, render),
  fadeOut: new widget.NumberInput(detailRender, "Fade-out [s]", param.fadeOut, render),
  decayTo: new widget.NumberInput(detailRender, "Decay To [dB]", param.decayTo, render),
  stereoMerge:
    new widget.NumberInput(detailRender, "Stereo Merge", param.stereoMerge, render),
  overSample:
    new widget.ComboBoxLine(detailRender, "Over-sample", param.overSample, render),
  sampleRateScaler: new widget.ComboBoxLine(
    detailRender, "Sample Rate Scale", param.sampleRateScaler, render),
  toneSlope:
    new widget.NumberInput(detailRender, "Tone Slope [dB/oct]", param.toneSlope, render),

  seed: new widget.NumberInput(detailStereo, "Seed", param.seed, render),
  stereoPitchCent: new widget.NumberInput(
    detailStereo, "Pitch Randomize [Cent]", param.stereoPitchCent, render),

  nComb: new widget.NumberInput(detailCombA, "nComb", param.nComb, onCombCountChanged),
  pitchType: new widget.ComboBoxLine(detailCombA, "Pitch Type", param.pitchType, render),
  filterType:
    new widget.ComboBoxLine(detailCombA, "Filter Type", param.filterType, render),
  delayInterpType: new widget.ComboBoxLine(
    detailCombA, "Delay Interpolation", param.delayInterpType, render),
  delayTimeBaseSecond: new widget.NumberInput(
    detailCombA, "Delay Base [sample]", param.delayTimeBaseSecond, render),
  delayTimeModAmount: new widget.NumberInput(
    detailCombA, "Delay Modulation [sample]", param.delayTimeModAmount, render),
  feedbackBase:
    new widget.NumberInput(detailCombA, "Feedback", param.feedbackBase, render),
  cascadeGain:
    new widget.NumberInput(detailCombA, "Cascade Gain", param.cascadeGain, render),
  crossRatio:
    new widget.NumberInput(detailCombA, "Cross Ratio", param.crossRatio, render),

  combGain: new widget.BarBox(
    detailCombA, "Gain [dB]", uiSize.barboxWidth, uiSize.barboxHeight, param.combGain,
    render),
  feedbackRatio: new widget.BarBox(
    detailCombA, "Feedback Ratio", uiSize.barboxWidth, uiSize.barboxHeight,
    param.feedbackRatio, render),
  bandpassQ: new widget.BarBox(
    detailCombB, "Bandpass Q", uiSize.barboxWidth, uiSize.barboxHeight, param.bandpassQ,
    render),
  combPitch: new widget.BarBox(
    detailCombB, "Comb Pitch [st.]", uiSize.barboxWidth, uiSize.barboxHeight,
    param.combPitch, render),
  bandpassPitch: new widget.BarBox(
    detailCombB, "Bandpass Pitch [st.]", uiSize.barboxWidth, uiSize.barboxHeight,
    param.bandpassPitch, render),
};

onCombCountChanged(param.nComb.defaultDsp);
window.addEventListener("load", (ev) => { widget.refresh(ui); });
