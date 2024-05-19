// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {uiSize} from "../common/gui/palette.js";
import * as widget from "../common/gui/widget.js";
import * as parameter from "../common/parameter.js";
import * as util from "../common/util.js";
import * as wave from "../common/wave.js";

import * as menuitems from "./menuitems.js";

const version = 1;

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

    limiterType: () => {},
    useCompressor: () => {},
    limiterThreshold: () => {},
    limiterSmoothingSeconds: () => {},

    // noiseToneMix: () => {},
    toneSineCount: () => {},
    toneAttackScaler: (prm) => { prm.normalized = 0.5 * Math.random(); },
    toneSorting: (prm) => { prm.dsp = util.uniformIntMap(Math.random(), 0, 1); },

    nComb: (prm) => {prm.dsp = util.uniformIntMap(Math.random(), 2, 16)},
    // pitchType: (prm) => { prm.normalized = Math.random(); },
    delayTimeHz: (prm) => { prm.dsp = util.exponentialMap(Math.random(), 20, 2000); },
    delayTimeModAmount:
      (prm) => { prm.dsp = util.exponentialMap(Math.random(), 0.1, 10000); },
    bandpassCutRatio: (prm) => {prm.dsp = util.uniformFloatMap(Math.random(), -3, 6)},
    // bandpassQ: (prm) => { prm.normalized = 0.75 * Math.random(); },
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

  compressorInputGain: new parameter.DecibelScale(-20, 60, false),
  limiterType: new parameter.MenuItemScale(menuitems.limiterTypeItems),
  limiterThreshold: new parameter.DecibelScale(-60, 40, false),
  limiterSmoothingSeconds: new parameter.DecibelScale(-80, -20, false),

  seed: new parameter.IntScale(0, 2 ** 32),
  oscGain: new parameter.DecibelScale(-20, 20, false),
  oscDecaySeconds: new parameter.DecibelScale(-40, util.ampToDB(4), false),
  noiseToneMix: new parameter.LinearScale(0, 1),
  toneSineCount: new parameter.IntScale(1, 1024),
  toneRangeOct: new parameter.LinearScale(0, 16),
  tonePhaseSpread: new parameter.LinearScale(0, 1),
  toneAttackScaler: new parameter.DecibelScale(-60, 60, true),
  toneSorting: new parameter.MenuItemScale(menuitems.toneSortingItems),

  pitchSpread: new parameter.LinearScale(0, 1),
  pitchRandomCent: new parameter.LinearScale(0, 1200),

  nComb: new parameter.IntScale(1, 16),
  pitchType: new parameter.MenuItemScale(menuitems.pitchTypeItems),
  delayTimeHz: new parameter.DecibelScale(util.ampToDB(2), util.ampToDB(10000), false),
  delayTimeModAmount: new parameter.DecibelScale(-20, 100, true),
  bandpassCutRatio: new parameter.LinearScale(-8, 8),
  bandpassQ: new parameter.DecibelScale(-40, 40, false),
  feedbackGain: new parameter.DecibelScale(-6, 0, false),
  collisionDistance: new parameter.DecibelScale(-80, 0, true),
};

const param = {
  renderDuration: new parameter.Parameter(0.5, scales.renderDuration, true),
  fadeIn: new parameter.Parameter(0.0, scales.fade, true),
  fadeOut: new parameter.Parameter(0.002, scales.fade, true),
  decayTo: new parameter.Parameter(1, scales.decayTo, false),
  stereoMerge: new parameter.Parameter(0.75, scales.stereoMerge),
  overSample: new parameter.Parameter(1, scales.overSample),
  sampleRateScaler: new parameter.Parameter(0, scales.sampleRateScaler),
  dcHighpassHz: new parameter.Parameter(0, scales.dcHighpassHz, true),
  toneSlope: new parameter.Parameter(1, scales.toneSlope, false),

  useCompressor: new parameter.Parameter(1, scales.boolean, true),
  compressorInputGain: new parameter.Parameter(1, scales.compressorInputGain, false),
  limiterType: new parameter.Parameter(0, scales.limiterType, true),
  limiterThreshold: new parameter.Parameter(1, scales.limiterThreshold, false),
  limiterSmoothingSeconds:
    new parameter.Parameter(0.02, scales.limiterSmoothingSeconds, true),

  seed: new parameter.Parameter(0, scales.seed, true),
  oscGain: new parameter.Parameter(1, scales.oscGain, false),
  oscDecaySeconds: new parameter.Parameter(0.5, scales.oscDecaySeconds, true),
  noiseToneMix: new parameter.Parameter(1 / 3, scales.noiseToneMix, true),
  toneSineCount: new parameter.Parameter(64, scales.toneSineCount, true),
  toneFreqHz: new parameter.Parameter(1000, scales.delayTimeHz, true),
  toneRangeOct: new parameter.Parameter(16, scales.toneRangeOct, true),
  tonePhaseSpread: new parameter.Parameter(1, scales.tonePhaseSpread, true),
  toneAttackScaler: new parameter.Parameter(1, scales.toneAttackScaler, true),
  toneSorting: new parameter.Parameter(0, scales.toneSorting),

  delayTimeSpread: new parameter.Parameter(1, scales.pitchSpread, true),
  delayTimeRandomCent:
    new parameter.Parameter(util.syntonicCommaCents, scales.pitchRandomCent, true),

  nComb: new parameter.Parameter(4, scales.nComb, true),
  pitchType: new parameter.Parameter(0, scales.pitchType, true),
  delayTimeHz: new parameter.Parameter(100, scales.delayTimeHz, true),
  delayTimeModAmount: new parameter.Parameter(0.0, scales.delayTimeModAmount, true),
  bandpassCutRatio: new parameter.Parameter(0, scales.bandpassCutRatio, true),
  bandpassQ: new parameter.Parameter(Math.SQRT1_2, scales.bandpassQ, true),
  feedbackGain: new parameter.Parameter(1, scales.feedbackGain, false),
  collisionDistance: new parameter.Parameter(0.1, scales.collisionDistance, true),
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
const detailOsc = widget.details(divRightA, "Oscillator");
const detailPitch = widget.details(divRightA, "Pitch");
const detailComb = widget.details(divRightA, "Comb");
const detailCompressor = widget.details(divRightB, "Compressor");
const detailLimiter = widget.details(divRightB, "Limiter");

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

  useCompressor: new widget.ToggleButtonLine(
    detailCompressor, ["Compressor - Off", "Compressor - On"], param.useCompressor,
    render),
  compressorInputGain: new widget.NumberInput(
    detailCompressor, "Input Gain [dB]", param.compressorInputGain, render),

  limiterType: new widget.ComboBoxLine(detailLimiter, "Type", param.limiterType, render),
  limiterThreshold: new widget.NumberInput(
    detailLimiter, "Threshold [dB]", param.limiterThreshold, render),
  limiterSmoothingSeconds: new widget.NumberInput(
    detailLimiter, "Smoothing [s]", param.limiterSmoothingSeconds, render),

  seed: new widget.NumberInput(detailOsc, "Seed", param.seed, render),
  oscGain: new widget.NumberInput(detailOsc, "Gain [dB]", param.oscGain, render),
  oscDecaySeconds:
    new widget.NumberInput(detailOsc, "Decay [s]", param.oscDecaySeconds, render),
  noiseToneMix:
    new widget.NumberInput(detailOsc, "Noise/Tone Mix", param.noiseToneMix, render),
  toneSineCount:
    new widget.NumberInput(detailOsc, "Tone - nSine", param.toneSineCount, render),
  toneFreqHz:
    new widget.NumberInput(detailOsc, "Tone - Frequency [Hz]", param.toneFreqHz, render),
  toneRangeOct: new widget.NumberInput(
    detailOsc, "Tone - Random Range [oct]", param.toneRangeOct, render),
  tonePhaseSpread: new widget.NumberInput(
    detailOsc, "Tone - Phase Spread", param.tonePhaseSpread, render),
  toneAttackScaler: new widget.NumberInput(
    detailOsc, "Tone - Attack Scaler", param.toneAttackScaler, render),
  toneSorting:
    new widget.ComboBoxLine(detailOsc, "Tone - Sorting", param.toneSorting, render),

  delayTimeSpread: new widget.NumberInput(
    detailPitch, "Delay Time Spread", param.delayTimeSpread, render),
  delayTimeRandomCent: new widget.NumberInput(
    detailPitch, "Delay Time Random [cent]", param.delayTimeRandomCent, render),

  nComb: new widget.NumberInput(detailComb, "nComb", param.nComb, render),
  pitchType: new widget.ComboBoxLine(detailComb, "Pitch Type", param.pitchType, render),
  delayTimeHz:
    new widget.NumberInput(detailComb, "Delay [Hz]", param.delayTimeHz, render),
  delayTimeModAmount: new widget.NumberInput(
    detailComb, "Delay Moddulation [sample]", param.delayTimeModAmount, render),
  bandpassCutRatio:
    new widget.NumberInput(detailComb, "BP Cut [oct]", param.bandpassCutRatio, render),
  bandpassQ: new widget.NumberInput(detailComb, "BP Q", param.bandpassQ, render),
  feedbackGain:
    new widget.NumberInput(detailComb, "Feedback [dB]", param.feedbackGain, render),
  collisionDistance: new widget.NumberInput(
    detailComb, "Collision Distance", param.collisionDistance, render),
};

render();
window.addEventListener("load", (ev) => { widget.refresh(ui); });
