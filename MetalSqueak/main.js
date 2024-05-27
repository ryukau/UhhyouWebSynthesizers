// Copyright Takamitsu Endo (ryukau@gmail.com)
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
    dcHighpassHz: () => {},
    toneSlope: () => {},
    overSample: () => {},
    sampleRateScaler: () => {},
    lowpassHz: () => {},
    allpassMod: (prm) => { prm.dsp = util.uniformFloatMap(Math.random(), -4, 4); },
    modReductionThreshold: () => {},
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
  dcHighpassHz: new parameter.DecibelScale(-20, 40, true),
  toneSlope: new parameter.DecibelScale(-12, 0, false),

  seed: new parameter.IntScale(0, 2 ** 32),

  impulseGain: new parameter.DecibelScale(-40, 40, true),
  noiseDuration: new parameter.DecibelScale(-80, 40, true),
  noiseDecaySeconds: new parameter.DecibelScale(-100, -20, false),
  noiseBandpassHz: new parameter.DecibelScale(40, 100, false),
  cutoffHz: new parameter.DecibelScale(0, 120, false),

  delayCount: new parameter.IntScale(1, 8),
  delayHz: new parameter.DecibelScale(util.ampToDB(1), util.ampToDB(22000), false),
  delayMod: new parameter.LinearScale(-4, 4),
  allpassCutRatio: new parameter.LinearScale(-8, 8),
  allpassMod: new parameter.LinearScale(-6, 6),
  modDecaySeconds: new parameter.DecibelScale(-40, 0, true),
  modReductionThreshold: new parameter.DecibelScale(-40, 20, true),
  modResumeRate: new parameter.DecibelScale(-140, -20, false),
  clipperScale: new parameter.DecibelScale(-20, 20, false),
};

const param = {
  renderDuration: new parameter.Parameter(2, scales.renderDuration, true),
  fadeIn: new parameter.Parameter(0, scales.fade, true),
  fadeOut: new parameter.Parameter(0.002, scales.fade, true),
  decayTo: new parameter.Parameter(1, scales.decayTo, false),
  stereoMerge: new parameter.Parameter(0.8, scales.stereoMerge),
  overSample: new parameter.Parameter(1, scales.overSample),
  sampleRateScaler: new parameter.Parameter(0, scales.sampleRateScaler),
  dcHighpassHz: new parameter.Parameter(4, scales.dcHighpassHz, true),
  toneSlope: new parameter.Parameter(1, scales.toneSlope, false),

  seed: new parameter.Parameter(0, scales.seed),

  impulseGain: new parameter.Parameter(util.dbToAmp(-10), scales.impulseGain, false),
  noiseGain: new parameter.Parameter(util.dbToAmp(-20), scales.impulseGain, false),
  noiseDuration: new parameter.Parameter(0.5, scales.noiseDuration, true),
  noiseDecaySeconds: new parameter.Parameter(0.001, scales.noiseDecaySeconds, true),
  noiseBand1Hz: new parameter.Parameter(500, scales.noiseBandpassHz, true),
  noiseBand2Hz: new parameter.Parameter(8000, scales.noiseBandpassHz, true),
  impulseLowpassHz: new parameter.Parameter(4000, scales.cutoffHz, true),
  impulseHighpassHz: new parameter.Parameter(20, scales.cutoffHz, true),

  fdnCount: new parameter.Parameter(4, scales.delayCount, true),
  minDelayHz: new parameter.Parameter(2000, scales.delayHz, true),
  maxDelayHz: new parameter.Parameter(8000, scales.delayHz, true),
  lowpassHz: new parameter.Parameter(700000, scales.cutoffHz, true),
  delayMod: new parameter.Parameter(0, scales.delayMod, true),
  allpass1Cut: new parameter.Parameter(0, scales.allpassCutRatio, true),
  allpass2Cut: new parameter.Parameter(0, scales.allpassCutRatio, true),
  allpassMod: new parameter.Parameter(0, scales.allpassMod, true),
  modDecaySeconds: new parameter.Parameter(1, scales.modDecaySeconds, true),
  feedbackDecaySeconds: new parameter.Parameter(0.1, scales.modDecaySeconds, true),
  modReductionThreshold: new parameter.Parameter(0.5, scales.modReductionThreshold, true),
  modResumeRate: new parameter.Parameter(0.01, scales.modResumeRate, true),
  enableClipper: new parameter.Parameter(1, scales.boolean, false),
  clipperScale: new parameter.Parameter(1, scales.clipperScale, false),
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
const detailRandom = widget.details(divRightA, "Random");
const detailSource = widget.details(divRightA, "Source");
const detailDelay = widget.details(divRightB, "Delay");

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
  dcHighpassHz:
    new widget.NumberInput(detailRender, "DC Highpass [Hz]", param.dcHighpassHz, render),
  toneSlope:
    new widget.NumberInput(detailRender, "Tone Slope [dB/oct]", param.toneSlope, render),

  seed: new widget.NumberInput(detailRandom, "Seed", param.seed, render),

  impulseGain:
    new widget.NumberInput(detailSource, "Impulse [dB]", param.impulseGain, render),
  noiseGain:
    new widget.NumberInput(detailSource, "Noise Gain [dB]", param.noiseGain, render),
  noiseDuration: new widget.NumberInput(
    detailSource, "Noise Duration [s]", param.noiseDuration, render),
  noiseDecaySeconds: new widget.NumberInput(
    detailSource, "Noise Decay [s]", param.noiseDecaySeconds, render),
  noiseBand1Hz:
    new widget.NumberInput(detailSource, "Noise Band 1 [Hz]", param.noiseBand1Hz, render),
  noiseBand2Hz:
    new widget.NumberInput(detailSource, "Noise Band 2 [Hz]", param.noiseBand2Hz, render),
  impulseLowpassHz:
    new widget.NumberInput(detailSource, "Lowpass [Hz]", param.impulseLowpassHz, render),
  impulseHighpassHz: new widget.NumberInput(
    detailSource, "Highpass [Hz]", param.impulseHighpassHz, render),

  fdnCount: new widget.NumberInput(detailDelay, "Quantity", param.fdnCount, render),
  minDelayHz:
    new widget.NumberInput(detailDelay, "Min. Delay [Hz]", param.minDelayHz, render),
  maxDelayHz:
    new widget.NumberInput(detailDelay, "Max. Delay [Hz]", param.maxDelayHz, render),
  lowpassHz: new widget.NumberInput(detailDelay, "Lowpass [Hz]", param.lowpassHz, render),
  delayMod: new widget.NumberInput(detailDelay, "Delay Mod.", param.delayMod, render),
  allpass1Cut:
    new widget.NumberInput(detailDelay, "Allpass 1 Cutoff", param.allpass1Cut, render),
  allpass2Cut:
    new widget.NumberInput(detailDelay, "Allpass 2 Cutoff", param.allpass2Cut, render),
  allpassMod:
    new widget.NumberInput(detailDelay, "Allpass Mod.", param.allpassMod, render),
  modDecaySeconds:
    new widget.NumberInput(detailDelay, "Mod. Decay", param.modDecaySeconds, render),
  feedbackDecaySeconds: new widget.NumberInput(
    detailDelay, "Feedback Decay", param.feedbackDecaySeconds, render),
  modReductionThreshold: new widget.NumberInput(
    detailDelay, "Mod. Threshold", param.modReductionThreshold, render),
  modResumeRate:
    new widget.NumberInput(detailDelay, "Mod. Resume Rate", param.modResumeRate, render),
  enableClipper: new widget.ToggleButtonLine(
    detailDelay, menuitems.enableClipperItems, param.enableClipper, render),
  clipperScale:
    new widget.NumberInput(detailDelay, "Clip Scale [dB]", param.clipperScale, render),
};

render();
window.addEventListener("load", (ev) => { widget.refresh(ui); });
