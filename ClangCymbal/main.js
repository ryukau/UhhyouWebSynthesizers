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
    overSample: () => {},
    sampleRateScaler: () => {},
    matrixSize: () => {},
    matrixType: () => {},
    frequency: () => {},
    lowpassCutoffBaseHz: () => {},
    highpassCutoffBaseHz: () => {},
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
    }),
    "perChannel",
    playControl.togglebuttonQuickSave.state === 1,
  );
}

function onMatrixSizeChanged(value) {
  ui.lowpassCutoffOffsetOctave.setViewRange(0, value);
  ui.lowpassQ.setViewRange(0, value);
  ui.highpassCutoffOffsetOctave.setViewRange(0, value);
  ui.highpassQ.setViewRange(0, value);
  render();
}

const scales = {
  defaultScale: new parameter.LinearScale(0, 1),

  renderDuration: new parameter.DecibelScale(-40, 40, false),
  fade: new parameter.DecibelScale(-60, 40, true),
  expDecayTo: new parameter.DecibelScale(util.ampToDB(1 / 2 ** 24), 0, false),
  overSample: new parameter.MenuItemScale(menuitems.oversampleItems),
  sampleRateScaler: new parameter.MenuItemScale(menuitems.sampleRateScalerItems),
  seed: new parameter.IntScale(0, 2 ** 53),

  densityHz: new parameter.DecibelScale(-20, 100, false),
  attackSecond: new parameter.DecibelScale(-60, 40, true),
  decaySecond: new parameter.DecibelScale(-60, 40, false),

  matrixSize: new parameter.IntScale(1, 256),
  matrixType: new parameter.MenuItemScale(menuitems.matrixTypeItems),
  delayInterp: new parameter.MenuItemScale(menuitems.delayInterpItems),
  identityAmount: new parameter.DecibelScale(-60, 60, false),
  frequency: new parameter.MidiPitchScale(0, 144, false),
  filterCutoffBaseOctave: new parameter.MidiPitchScale(
    util.freqToMidiPitch(10), util.freqToMidiPitch(48000), false),
  filterCutoffOffsetOctave: new parameter.LinearScale(-10.0, 10.0),
  filterQ: new parameter.LinearScale(0.01, Math.SQRT1_2),
};

const param = {
  renderDuration: new parameter.Parameter(1, scales.renderDuration, true),
  fadeIn: new parameter.Parameter(0.001, scales.fade, true),
  fadeOut: new parameter.Parameter(0.002, scales.fade, true),
  expDecayTo: new parameter.Parameter(0.01, scales.expDecayTo, false),
  overSample: new parameter.Parameter(1, scales.overSample),
  sampleRateScaler: new parameter.Parameter(0, scales.sampleRateScaler),
  seed: new parameter.Parameter(0, scales.seed),

  oscAttack: new parameter.Parameter(0, scales.attackSecond, true),
  oscDecay: new parameter.Parameter(0.5, scales.decaySecond, true),
  densityHz: new parameter.Parameter(7000, scales.densityHz, true),
  noisePulseRatio: new parameter.Parameter(0, scales.defaultScale, false),
  noiseDecay: new parameter.Parameter(0.01, scales.decaySecond, true),

  matrixSize: new parameter.Parameter(8, scales.matrixSize),
  matrixType: new parameter.Parameter(0, scales.matrixType),
  delayInterp: new parameter.Parameter(1, scales.delayInterp),
  identityAmount: new parameter.Parameter(0.5, scales.identityAmount, true),
  frequency: new parameter.Parameter(util.midiPitchToFreq(60), scales.frequency, true),
  overtoneRandomization: new parameter.Parameter(0.01, scales.defaultScale),
  lowpassCutoffBaseHz: new parameter.Parameter(
    scales.filterCutoffBaseOctave.maxDsp, scales.filterCutoffBaseOctave, true),
  highpassCutoffBaseHz: new parameter.Parameter(100, scales.filterCutoffBaseOctave, true),

  lowpassCutoffOffsetOctave: createArrayParameters(0, scales.filterCutoffOffsetOctave),
  highpassCutoffOffsetOctave: createArrayParameters(0, scales.filterCutoffOffsetOctave),
  lowpassQ: createArrayParameters(scales.filterQ.maxDsp, scales.filterQ),
  highpassQ: createArrayParameters(scales.filterQ.maxDsp, scales.filterQ),
};

const recipeBook
  = parameter.addLocalRecipes(localRecipeBook, await parameter.loadJson(param, []));

// Add controls.
const pageTitle = widget.pageTitle(document.body);
const divMain = widget.div(document.body, "main", undefined);

const divLeft = widget.div(divMain, undefined, "controlBlock");
const divRight = widget.div(divMain, undefined, "controlBlock");

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

const detailRender = widget.details(divLeft, "Render");
const detailOsc = widget.details(divRight, "Oscillator");
const detailFDN = widget.details(divRight, "FDN Matrix & Delay");
const detailLP = createDetailInBlock("FDN Lowpass");
const detailHP = createDetailInBlock("FDN Highpass");

const ui = {
  renderDuration:
    new widget.NumberInput(detailRender, "Duration [s]", param.renderDuration, render),
  fadeIn: new widget.NumberInput(detailRender, "Fade-in [s]", param.fadeIn, render),
  fadeOut: new widget.NumberInput(detailRender, "Fade-out [s]", param.fadeOut, render),
  expDecayTo:
    new widget.NumberInput(detailRender, "Decay To [dB]", param.expDecayTo, render),
  overSample:
    new widget.ComboBoxLine(detailRender, "Over-sample", param.overSample, render),
  sampleRateScaler: new widget.ComboBoxLine(
    detailRender, "Sample Rate Scale", param.sampleRateScaler, render),
  seed: new widget.NumberInput(detailRender, "Seed", param.seed, render),

  oscAttack: new widget.NumberInput(detailOsc, "Attack [s]", param.oscAttack, render),
  oscDecay: new widget.NumberInput(detailOsc, "Decay [s]", param.oscDecay, render),
  densityHz: new widget.NumberInput(detailOsc, "Density", param.densityHz, render),
  noisePulseRatio:
    new widget.NumberInput(detailOsc, "Noise/Pulse", param.noisePulseRatio, render),
  noiseDecay: new widget.NumberInput(detailOsc, "NoiseDecay", param.noiseDecay, render),

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

  lowpassCutoffBaseHz: new widget.NumberInput(
    detailLP, "Cutoff Base [Hz]", param.lowpassCutoffBaseHz, render),
  lowpassCutoffOffsetOctave: new widget.BarBox(
    detailLP, "Cutoff Offset [octave]", uiSize.barboxWidth, uiSize.barboxHeight,
    param.lowpassCutoffOffsetOctave, render),
  lowpassQ: new widget.BarBox(
    detailLP, "Q Factor", uiSize.barboxWidth, uiSize.barboxHeight, param.lowpassQ,
    render),

  highpassCutoffBaseHz: new widget.NumberInput(
    detailHP, "Cutoff Base [Hz]", param.highpassCutoffBaseHz, render),
  highpassCutoffOffsetOctave: new widget.BarBox(
    detailHP, "Cutoff Offset [octave]", uiSize.barboxWidth, uiSize.barboxHeight,
    param.highpassCutoffOffsetOctave, render),
  highpassQ: new widget.BarBox(
    detailHP, "Q Factor", uiSize.barboxWidth, uiSize.barboxHeight, param.highpassQ,
    render),
};

onMatrixSizeChanged(param.matrixSize.defaultDsp);
window.addEventListener("load", (ev) => { widget.refresh(ui); });
