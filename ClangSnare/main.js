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
    fadeIn: () => {},
    fadeOut: () => {},
    expDecayTo: () => {},
    overSample: () => {},
    sampleRateScaler: () => {},
    stereoMerge: () => {},
    clickEnvelopeSecond: () => {},
    clickAmp: () => {},
    overSample: () => {},
    oscAttack: () => {},
    combMix: () => {},
    fdnMix: () => {},
    fdnCross: () => {},
    matrixType: () => {},
    frequency: () => {},
  },
  "SnareDrum": {
    renderDuration: () => {},
    fadeIn: () => {},
    fadeOut: () => {},
    expDecayTo: () => {},
    stereoMerge: () => {},
    overSample: () => {},
    sampleRateScaler: () => {},
    clickEnvelopeSecond: () => {},
    clickAmp: () => {},
    overSample: () => {},
    oscAttack: () => {},
    oscDecay: (prm) => { prm.ui = util.uniformDistributionMap(Math.random(), -40, -6); },
    densityHz:
      (prm) => { prm.dsp = util.uniformDistributionMap(Math.random(), 500, 10000); },
    combMix: () => {},
    combSum: (prm) => {
      let index;
      do {
        index = Math.floor(menuitems.combSumItems.length * Math.random());
      } while (menuitems.combSumItems[index] === "Tail");
      prm.dsp = index;
    },
    combTimeBase:
      (prm) => { prm.dsp = util.uniformDistributionMap(Math.random(), 0, 0.01); },
    combTimeRandom:
      (prm) => { prm.dsp = util.uniformDistributionMap(Math.random(), 0, 0.01); },
    combHighpassHz:
      (prm) => { prm.dsp = util.uniformDistributionMap(Math.random(), 10, 100); },
    fdnMix:
      (prm) => { prm.dsp = util.uniformDistributionMap(Math.random(), 0.25, 0.85); },
    fdnCross: () => {},
    matrixType: () => {},
    identityAmount: (prm) => {
      prm.dsp = util.dbToAmp(util.uniformDistributionMap(Math.random(), -20, 40));
    },
    frequency:
      (prm) => { prm.dsp = util.uniformDistributionMap(Math.random(), 20, 400); },
    lowpassCutoffBatterHz:
      (prm) => { prm.dsp = util.uniformDistributionMap(Math.random(), 500, 4000); },
    lowpassCutoffSnareHz:
      (prm) => { prm.dsp = util.uniformDistributionMap(Math.random(), 500, 4000); },
    lowpassQ: () => {},
    highpassCutoffBatterHz:
      (prm) => { prm.dsp = util.uniformDistributionMap(Math.random(), 10, 100); },
    highpassCutoffSnareHz:
      (prm) => { prm.dsp = util.uniformDistributionMap(Math.random(), 10, 100); },
    highpassQ: (prm) => {
      const end = param.matrixSize.dsp;
      const start = Math.max(0, end - 4);
      prm[0].dsp = 0.1;
      for (let i = 1; i < start; ++i) prm[i].dsp = Math.SQRT1_2;
      for (let i = start; i < end; ++i) prm[i].normalized = Math.random();
    },
  },
};

function applyLocalRecipe(param, recipe) {
  for (const key in param) {
    if (recipe.hasOwnProperty(key)) {
      recipe[key](param[key]);
    } else if (Array.isArray(param[key])) {
      param[key].forEach(e => { e.normalized = Math.random(); });
    } else if (param[key].scale instanceof parameter.MenuItemScale) {
      // Do nothing.
    } else {
      param[key].normalized = Math.random();
    }
  };
}

function addLocalRecipes(source, target) {
  let tgt = new Map(target); // Don't mutate original.
  for (const [key, recipe] of Object.entries(source)) {
    tgt.set(` - ${key}`, {randomize: (param) => applyLocalRecipe(param, recipe)});
  }
  return new Map([...tgt.entries()].sort()); // Sort by key.
}

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
    }),
    "perChannel",
    playControl.togglebuttonQuickSave.state === 1,
  );
}

function onMatrixSizeChanged(value) {
  ui.lowpassCutoffOffsetOctave.setViewRange(0, value);
  ui.highpassCutoffOffsetOctave.setViewRange(0, value);
  ui.lowpassQ.setViewRange(0, value);
  ui.highpassQ.setViewRange(0, value);
  ui.lowpassGain.setViewRange(0, value);
  render();
}

const scales = {
  defaultScale: new parameter.LinearScale(0, 1),

  renderDuration: new parameter.DecibelScale(-40, 40, false),
  fade: new parameter.DecibelScale(-60, 40, true),
  expDecayTo: new parameter.DecibelScale(util.ampToDB(1 / 2 ** 24), 0, false),
  clickEnvelopeSecond: new parameter.DecibelScale(-60, util.ampToDB(0.2), false),
  clickAmp: new parameter.LinearScale(0, 4),
  overSample: new parameter.MenuItemScale(menuitems.oversampleItems),
  sampleRateScaler: new parameter.MenuItemScale(menuitems.sampleRateScalerItems),
  seed: new parameter.IntScale(0, 2 ** 53),

  densityHz: new parameter.DecibelScale(-20, 100, false),
  attackSecond: new parameter.DecibelScale(-60, 40, true),
  decaySecond: new parameter.DecibelScale(-60, 20, false),
  noiseDecay: new parameter.DecibelScale(-80, 0, false),

  combCount: new parameter.IntScale(3, 16),
  combSum: new parameter.MenuItemScale(menuitems.combSumItems),
  combOvertoneStart: new parameter.IntScale(1, 16),
  combFeedback: new parameter.LinearScale(-1, 1),
  combSeconds: new parameter.DecibelScale(-80, -20, true),
  combLowpassCutoffSlope: new parameter.LinearScale(0, 2),

  matrixSize: new parameter.IntScale(1, 32),
  matrixType: new parameter.MenuItemScale(menuitems.matrixTypeItems),
  delayInterp: new parameter.MenuItemScale(menuitems.delayInterpItems),
  identityAmount: new parameter.DecibelScale(-60, 60, false),
  frequency: new parameter.MidiPitchScale(0, 144, false),
  filterCutoffBaseOctave: new parameter.MidiPitchScale(
    util.freqToMidiPitch(10), util.freqToMidiPitch(48000), false),
  filterCutoffOffsetOctave: new parameter.LinearScale(-1, 1),
  filterQ: new parameter.LinearScale(0.01, Math.SQRT1_2),
  filterGain: new parameter.DecibelScale(-24, 0, false),
  fdnTimeModulation: new parameter.DecibelScale(-20, 20, true),
  fdnTimeRateLimit: new parameter.LinearScale(0, 1),
  fdnFeedback: new parameter.NegativeDecibelScale(-60, 0, 1, true),
};

const param = {
  renderDuration: new parameter.Parameter(1, scales.renderDuration, true),
  fadeIn: new parameter.Parameter(0.001, scales.fade, true),
  fadeOut: new parameter.Parameter(0.002, scales.fade, true),
  expDecayTo: new parameter.Parameter(1, scales.expDecayTo, false),
  clickEnvelopeSecond: new parameter.Parameter(0.005, scales.clickEnvelopeSecond, true),
  clickAmp: new parameter.Parameter(1, scales.clickAmp, true),
  stereoMerge: new parameter.Parameter(0.8, scales.defaultScale),
  overSample: new parameter.Parameter(0, scales.overSample),
  sampleRateScaler: new parameter.Parameter(0, scales.sampleRateScaler),
  seed: new parameter.Parameter(0, scales.seed),

  oscAttack: new parameter.Parameter(0, scales.attackSecond, true),
  oscDecay: new parameter.Parameter(0.15, scales.decaySecond, true),
  densityHz: new parameter.Parameter(7000, scales.densityHz, true),
  noiseDecay: new parameter.Parameter(0.01, scales.noiseDecay, true),

  combCount: new parameter.Parameter(4, scales.combCount, true),
  combSum: new parameter.Parameter(0, scales.combSum),
  combMix: new parameter.Parameter(1, scales.defaultScale, true),
  combFeedback: new parameter.Parameter(0.5, scales.combFeedback),
  combTimeBase: new parameter.Parameter(0.004, scales.combSeconds, true),
  combTimeRandom: new parameter.Parameter(0.004, scales.combSeconds, true),
  combOvertoneStart: new parameter.Parameter(1, scales.combOvertoneStart),
  combTimeUniformOvertoneRatio: new parameter.Parameter(1, scales.defaultScale),
  combHighpassHz: new parameter.Parameter(20, scales.frequency, true),
  combLowpassHz: new parameter.Parameter(20000, scales.frequency, true),
  combLowpassQ: new parameter.Parameter(0.7, scales.filterQ, true),
  combLowpassGain: new parameter.Parameter(util.dbToAmp(-3), scales.filterGain, false),
  combLowpassCutoffSlope: new parameter.Parameter(0, scales.combLowpassCutoffSlope),

  fdnMix: new parameter.Parameter(0.82, scales.defaultScale, true),
  fdnCross: new parameter.Parameter(0.05, scales.defaultScale, true),
  matrixSize: new parameter.Parameter(16, scales.matrixSize),
  matrixType: new parameter.Parameter(0, scales.matrixType),
  delayInterp: new parameter.Parameter(1, scales.delayInterp),
  identityAmount: new parameter.Parameter(0.5, scales.identityAmount, true),
  frequency: new parameter.Parameter(util.midiPitchToFreq(60), scales.frequency, true),
  overtoneRandomization: new parameter.Parameter(0.01, scales.defaultScale),
  fdnTimeModulation: new parameter.Parameter(0.1, scales.fdnTimeModulation, true),
  fdnTimeRateLimit: new parameter.Parameter(0.5, scales.fdnTimeRateLimit, true),
  fdnFeedback: new parameter.Parameter(0.98, scales.fdnFeedback, true),

  lowpassCutoffBatterHz:
    new parameter.Parameter(2000, scales.filterCutoffBaseOctave, true),
  lowpassCutoffSnareHz:
    new parameter.Parameter(1700, scales.filterCutoffBaseOctave, true),
  lowpassCutoffOffsetOctave: createArrayParameters(0, scales.filterCutoffOffsetOctave),
  lowpassQ: createArrayParameters(scales.filterQ.maxDsp, scales.filterQ),
  lowpassGain: createArrayParameters(0.5, scales.filterGain),

  highpassCutoffBatterHz:
    new parameter.Parameter(60, scales.filterCutoffBaseOctave, true),
  highpassCutoffSnareHz:
    new parameter.Parameter(140, scales.filterCutoffBaseOctave, true),
  highpassCutoffOffsetOctave: createArrayParameters(0, scales.filterCutoffOffsetOctave),
  highpassQ: createArrayParameters(scales.filterQ.maxDsp, scales.filterQ),
};

const recipeBook = addLocalRecipes(localRecipeBook, await parameter.loadJson(param, [
  // "recipe/full.json",
  // "recipe/init.json",
]));

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

const createDetailInBlock = (name) => {
  const div = widget.div(divMain, undefined, "controlBlock");
  return widget.details(div, name);
};

const detailTips = widget.details(divLeft, "Tips");
const paragraphFDNNote1 = widget.paragraph(detailTips, undefined, undefined);
paragraphFDNNote1.textContent
  = "Reduce `FDN Matrix & Delay` -> `Cross` in case of blow up (peak appears at the end). Reducing `Render` -> `Decay To` is also effective.";

const detailRender = widget.details(divLeft, "Render");
const detailOsc = widget.details(divLeft, "Oscillator");
const detailComb = createDetailInBlock("Serial Comb");
// const detailFDN = widget.details(divLeft, "FDN Matrix & Delay");
const detailFDN = createDetailInBlock("FDN Matrix & Delay");
const detailHP = createDetailInBlock("FDN Highpass");
const detailLP = createDetailInBlock("FDN Highshelf");

const ui = {
  renderDuration:
    new widget.NumberInput(detailRender, "Duration [s]", param.renderDuration, render),
  fadeIn: new widget.NumberInput(detailRender, "Fade-in [s]", param.fadeIn, render),
  fadeOut: new widget.NumberInput(detailRender, "Fade-out [s]", param.fadeOut, render),
  expDecayTo:
    new widget.NumberInput(detailRender, "Decay To [dB]", param.expDecayTo, render),
  clickEnvelopeSecond:
    new widget.NumberInput(detailRender, "Click [s]", param.clickEnvelopeSecond, render),
  clickAmp:
    new widget.NumberInput(detailRender, "Click Amplitude", param.clickAmp, render),
  stereoMerge:
    new widget.NumberInput(detailRender, "Stereo Merge", param.stereoMerge, render),
  overSample:
    new widget.ComboBoxLine(detailRender, "Over-sample", param.overSample, render),
  sampleRateScaler: new widget.ComboBoxLine(
    detailRender, "Sample Rate Scale", param.sampleRateScaler, render),
  seed: new widget.NumberInput(detailRender, "Seed", param.seed, render),

  oscAttack: new widget.NumberInput(detailOsc, "Attack [s]", param.oscAttack, render),
  oscDecay: new widget.NumberInput(detailOsc, "Decay [s]", param.oscDecay, render),
  densityHz: new widget.NumberInput(detailOsc, "Density", param.densityHz, render),
  noiseDecay: new widget.NumberInput(detailOsc, "NoiseDecay", param.noiseDecay, render),

  combCount: new widget.NumberInput(detailComb, "nComb", param.combCount, render),
  combSum: new widget.ComboBoxLine(detailComb, "Sum Point", param.combSum, render),
  combMix: new widget.NumberInput(detailComb, "Mix", param.combMix, render),
  combFeedback:
    new widget.NumberInput(detailComb, "Feedback", param.combFeedback, render),
  combTimeBase:
    new widget.NumberInput(detailComb, "Time Base [s]", param.combTimeBase, render),
  combTimeRandom:
    new widget.NumberInput(detailComb, "Time Random [s]", param.combTimeRandom, render),
  combOvertoneStart:
    new widget.NumberInput(detailComb, "Overtone Start", param.combOvertoneStart, render),
  combTimeUniformOvertoneRatio: new widget.NumberInput(
    detailComb, "Uniform or Overtone", param.combTimeUniformOvertoneRatio, render),
  combHighpassHz:
    new widget.NumberInput(detailComb, "Highpass [Hz]", param.combHighpassHz, render),
  combLowpassHz:
    new widget.NumberInput(detailComb, "Lowpass [Hz]", param.combLowpassHz, render),
  combLowpassQ:
    new widget.NumberInput(detailComb, "Lowpass Q", param.combLowpassQ, render),
  combLowpassGain: new widget.NumberInput(
    detailComb, "Lowpass Gain [dB]", param.combLowpassGain, render),
  combLowpassCutoffSlope: new widget.NumberInput(
    detailComb, "Lowpass Cut Slope", param.combLowpassCutoffSlope, render),

  fdnMix: new widget.NumberInput(detailFDN, "FDN Mix", param.fdnMix, render),
  fdnCross: new widget.NumberInput(detailFDN, "Cross", param.fdnCross, render),
  matrixSize: new widget.NumberInput(
    detailFDN, "Matrix Size", param.matrixSize, onMatrixSizeChanged),
  matrixType: new widget.ComboBoxLine(detailFDN, "Matrix Type", param.matrixType, render),
  delayInterp:
    new widget.ComboBoxLine(detailFDN, "Delay Interpolation", param.delayInterp, render),
  identityAmount:
    new widget.NumberInput(detailFDN, "Identity Amount", param.identityAmount, render),
  frequency: new widget.NumberInput(detailFDN, "Frequency [Hz]", param.frequency, render),
  overtoneRandomization: new widget.NumberInput(
    detailFDN, "Overtone Random", param.overtoneRandomization, render),
  fdnTimeModulation:
    new widget.NumberInput(detailFDN, "Time Modulation", param.fdnTimeModulation, render),
  fdnTimeRateLimit:
    new widget.NumberInput(detailFDN, "Time Rate Limit", param.fdnTimeRateLimit, render),
  fdnFeedback: new widget.NumberInput(detailFDN, "Feedback", param.fdnFeedback, render),

  lowpassCutoffBatterHz: new widget.NumberInput(
    detailLP, "Cutoff Batter [Hz]", param.lowpassCutoffBatterHz, render),
  lowpassCutoffSnareHz: new widget.NumberInput(
    detailLP, "Cutoff Snare [Hz]", param.lowpassCutoffSnareHz, render),
  lowpassCutoffOffsetOctave: new widget.BarBox(
    detailLP, "Cutoff Offset [octave]", uiSize.barboxWidth, uiSize.barboxHeight,
    param.lowpassCutoffOffsetOctave, render),
  lowpassQ: new widget.BarBox(
    detailLP, "Q Factor", uiSize.barboxWidth, uiSize.barboxHeight, param.lowpassQ,
    render),
  lowpassGain: new widget.BarBox(
    detailLP, "Gain", uiSize.barboxWidth, uiSize.barboxHeight, param.lowpassGain, render),

  highpassCutoffBatterHz: new widget.NumberInput(
    detailHP, "Cutoff Batter [Hz]", param.highpassCutoffBatterHz, render),
  highpassCutoffSnareHz: new widget.NumberInput(
    detailHP, "Cutoff Snare [Hz]", param.highpassCutoffSnareHz, render),
  highpassCutoffOffsetOctave: new widget.BarBox(
    detailHP, "Cutoff Offset [octave]", uiSize.barboxWidth, uiSize.barboxHeight,
    param.highpassCutoffOffsetOctave, render),
  highpassQ: new widget.BarBox(
    detailHP, "Q Factor", uiSize.barboxWidth, uiSize.barboxHeight, param.highpassQ,
    render),
};

param.highpassQ[0].dsp = 0.1;

onMatrixSizeChanged(param.matrixSize.defaultDsp);
window.addEventListener("load", (ev) => { widget.refresh(ui); });
