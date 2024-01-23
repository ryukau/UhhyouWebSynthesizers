// Copyright 2023 Takamitsu Endo
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
    fadeIn: () => {},
    fadeOut: () => {},
    decayTo: () => {},
    stereoMerge: () => {},
    overSample: () => {},
    sampleRateScaler: () => {},
    dcHighpassHz: () => {},
    toneSlope: () => {},
    combCascadeGain: () => {},
    notchInvert: (prm) => { prm.normalized = Math.random(); },
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
  boolean: new parameter.IntScale(0, 1),

  renderDuration: new parameter.DecibelScale(-40, 40, false),
  fade: new parameter.DecibelScale(-60, 40, true),
  decayTo: new parameter.DecibelScale(util.ampToDB(1 / 2 ** 24), 0, false),
  stereoMerge: new parameter.LinearScale(0, 1),
  overSample: new parameter.MenuItemScale(menuitems.oversampleItems),
  sampleRateScaler: new parameter.MenuItemScale(menuitems.sampleRateScalerItems),
  toneSlope: new parameter.DecibelScale(-12, 0, false),

  seed: new parameter.IntScale(0, 2 ** 32),
  noiseDistribution: new parameter.MenuItemScale(menuitems.noiseDistributionItems),
  cutoffHz: new parameter.DecibelScale(util.ampToDB(20), util.ampToDB(20000), false),

  combHz: new parameter.DecibelScale(util.ampToDB(20), util.ampToDB(4000), false),
  combRandomOctave: new parameter.LinearScale(0, 2),
  combFrequencySpread: new parameter.LinearScale(0, 1),
  combNotchMix: new parameter.DecibelScale(-20, 0, false),
  combCascadeGain: new parameter.DecibelScale(util.ampToDB(0.5), 0, false),

  notchCount: new parameter.IntScale(1, 32),
  notchNarrowness: new parameter.NegativeDecibelScale(-60, 0, 1, true),
  notchStepSizeScale: new parameter.DecibelScale(-20, 20, false),
  notchInvert: new parameter.MenuItemScale(menuitems.notchInvertItems),
};

const param = {
  renderDuration: new parameter.Parameter(0.5, scales.renderDuration, true),
  fadeIn: new parameter.Parameter(0.0, scales.fade, true),
  fadeOut: new parameter.Parameter(0.002, scales.fade, true),
  decayTo: new parameter.Parameter(1, scales.decayTo, false),
  stereoMerge: new parameter.Parameter(0, scales.stereoMerge),
  overSample: new parameter.Parameter(1, scales.overSample),
  sampleRateScaler: new parameter.Parameter(0, scales.sampleRateScaler),
  toneSlope: new parameter.Parameter(1, scales.toneSlope, false),

  seed: new parameter.Parameter(0, scales.seed, true),
  noiseDistribution: new parameter.Parameter(0, scales.noiseDistribution),
  bandpassCutoffHz: new parameter.Parameter(1000, scales.cutoffHz, true),

  combCount: new parameter.Parameter(8, scales.notchCount, true),
  highpassCutoffHz: new parameter.Parameter(100, scales.cutoffHz, true),
  combBaseHz: new parameter.Parameter(100, scales.combHz, true),
  combRandomOctave: new parameter.Parameter(1, scales.combRandomOctave, true),
  combFrequencySpread: new parameter.Parameter(1, scales.combFrequencySpread, true),
  combNotchMix: new parameter.Parameter(0.5, scales.combNotchMix, true),
  combCascadeGain: new parameter.Parameter(0.95, scales.combCascadeGain, true),

  notchCount: new parameter.Parameter(32, scales.notchCount, true),
  notchNarrowness: new parameter.Parameter(0.99, scales.notchNarrowness, true),
  notchStepSizeScale: new parameter.Parameter(1, scales.notchStepSizeScale, true),
  notchInvert: new parameter.Parameter(0, scales.notchInvert, true),
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
const paragraphNote1 = widget.paragraph(detailTips, undefined, undefined);
paragraphNote1.textContent
  = "When the sound becomes inaudible, change `Oscillator -> BP Cut`, `Notch -> Narrowness`, or `Notch -> Step Size Scale`.";
const paragraphNote2 = widget.paragraph(detailTips, undefined, undefined);
paragraphNote2.textContent
  = "To reduce clicks or spikes, lower `Comb -> Base Frequency`.";

const detailRender = widget.details(divLeft, "Render");
const detailOsc = widget.details(divRightA, "Oscillator");
const detailComb = widget.details(divRightA, "Comb");
const detailNotch = widget.details(divRightA, "Notch");

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

  seed: new widget.NumberInput(detailOsc, "Seed", param.seed, render),
  noiseDistribution: new widget.ComboBoxLine(
    detailOsc, "Noise Distribution", param.noiseDistribution, render),
  bandpassCutoffHz:
    new widget.NumberInput(detailOsc, "BP Cut [Hz]", param.bandpassCutoffHz, render),

  combCount: new widget.NumberInput(detailComb, "Count", param.combCount, render),
  highpassCutoffHz:
    new widget.NumberInput(detailComb, "HP Cut [Hz]", param.highpassCutoffHz, render),
  combBaseHz:
    new widget.NumberInput(detailComb, "Base Frequency [Hz]", param.combBaseHz, render),
  combRandomOctave: new widget.NumberInput(
    detailComb, "Random Frequency [oct]", param.combRandomOctave, render),
  combFrequencySpread: new widget.NumberInput(
    detailComb, "Frequency Spread", param.combFrequencySpread, render),
  combNotchMix:
    new widget.NumberInput(detailComb, "Feedback Notch Mix", param.combNotchMix, render),
  combCascadeGain:
    new widget.NumberInput(detailComb, "Cascade Gain", param.combCascadeGain, render),

  notchCount: new widget.NumberInput(detailNotch, "Count", param.notchCount, render),
  notchNarrowness:
    new widget.NumberInput(detailNotch, "Narrowness", param.notchNarrowness, render),
  notchStepSizeScale: new widget.NumberInput(
    detailNotch, "Step Size Scale", param.notchStepSizeScale, render),
  notchInvert: new widget.ToggleButtonLine(
    detailNotch, menuitems.notchInvertItems, param.notchInvert, render),
};

render();
window.addEventListener("load", (ev) => { widget.refresh(ui); });
