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
    decayTo: () => {},
    overSample: () => {},
    sampleRateScaler: () => {},
    toneSlope: () => {},
    slopeStartHz: () => {},
    nLayer: () => {},
    timeMultiplier: () => {},
    highpassCutoffMultiplier: () => {},
    lowpassCutoffMultiplier: () => {},
    noiseMix: () => {},
    lowpassHz: () => {},
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

function render() {
  audio.render(
    parameter.toMessage(param, {
      sampleRate: audio.audioContext.sampleRate * getSampleRateScaler(),
      maxDelayTime: scales.delayTime.maxDsp,
      maxHighpassHz: scales.highpassHz.maxDsp,
      minLowpassHz: scales.lowpassHz.minDsp,
    }),
    "perChannel",
    playControl.togglebuttonQuickSave.state === 1,
  );
}

const scales = {
  renderDuration: new parameter.DecibelScale(-40, 40, false),
  fade: new parameter.DecibelScale(-60, 40, true),
  decayTo: new parameter.DecibelScale(util.ampToDB(1 / 2 ** 24), 0, false),
  overSample: new parameter.MenuItemScale(menuitems.oversampleItems),
  sampleRateScaler: new parameter.MenuItemScale(menuitems.sampleRateScalerItems),
  toneSlope: new parameter.DecibelScale(-20, 20, true),

  nLayer: new parameter.IntScale(1, 8),
  layerMultiplier: new parameter.LinearScale(0.5, 2),

  noiseDecay: new parameter.DecibelScale(-80, 40, true),
  noiseMix: new parameter.DecibelScale(-60, 0, true),

  nDelay: new parameter.IntScale(1, 256),
  seed: new parameter.IntScale(0, 2 ** 32),
  delayType: new parameter.MenuItemScale(menuitems.delayType),
  timeDistribution: new parameter.MenuItemScale(menuitems.timeDistribution),
  delayTime: new parameter.DecibelScale(-80, -20, true),
  feedback: new parameter.LinearScale(-1, 1),

  cutoffSlope: new parameter.LinearScale(0, 1),
  highpassHz: new parameter.MidiPitchScale(
    util.freqToMidiPitch(1), util.freqToMidiPitch(48000), true),
  lowpassHz: new parameter.MidiPitchScale(
    util.freqToMidiPitch(10), util.freqToMidiPitch(1000000), false),
  filterQ: new parameter.LinearScale(0.01, Math.SQRT1_2),
};

const param = {
  renderDuration: new parameter.Parameter(1, scales.renderDuration, true),
  fadeIn: new parameter.Parameter(0.001, scales.fade, true),
  fadeOut: new parameter.Parameter(0.002, scales.fade, true),
  decayTo: new parameter.Parameter(1, scales.decayTo, false),
  overSample: new parameter.Parameter(1, scales.overSample),
  sampleRateScaler: new parameter.Parameter(0, scales.sampleRateScaler),
  toneSlope: new parameter.Parameter(1, scales.toneSlope),
  slopeStartHz: new parameter.Parameter(1000, scales.lowpassHz, true),

  nLayer: new parameter.Parameter(1, scales.nLayer, true),
  timeMultiplier: new parameter.Parameter(1, scales.layerMultiplier, true),
  highpassCutoffMultiplier: new parameter.Parameter(1, scales.layerMultiplier, true),
  lowpassCutoffMultiplier: new parameter.Parameter(1, scales.layerMultiplier, true),

  noiseDecay: new parameter.Parameter(1, scales.noiseDecay, true),
  noiseMix: new parameter.Parameter(0, scales.noiseMix),

  nDelay: new parameter.Parameter(8, scales.nDelay),
  seed: new parameter.Parameter(0, scales.seed),
  delayType:
    new parameter.Parameter(menuitems.delayType.indexOf("Allpass"), scales.delayType),
  timeDistribution: new parameter.Parameter(
    menuitems.timeDistribution.indexOf("Overtone"), scales.timeDistribution),
  delayTime: new parameter.Parameter(0.01, scales.delayTime, true),
  timeRandomness: new parameter.Parameter(0.001, scales.delayTime, true),
  feedback: new parameter.Parameter(-0.98, scales.feedback, true),

  highpassCutoffSlope: new parameter.Parameter(0, scales.cutoffSlope),
  highpassHz: new parameter.Parameter(20, scales.highpassHz, true),
  highpassQ: new parameter.Parameter(Math.SQRT1_2, scales.filterQ),
  lowpassCutoffSlope: new parameter.Parameter(0, scales.cutoffSlope),
  lowpassHz: new parameter.Parameter(scales.lowpassHz.maxDsp, scales.lowpassHz, true),
  lowpassQ: new parameter.Parameter(Math.SQRT1_2, scales.filterQ),
};

const recipeBook = addLocalRecipes(localRecipeBook, await parameter.loadJson(param, [
  // "recipe/full.json",
  // "recipe/init.json",
]));

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
    divLeft, uiSize.waveViewWidth, uiSize.waveViewHeight, undefined, false),
  new widget.WaveView(
    divLeft, uiSize.waveViewWidth, uiSize.waveViewHeight, undefined, false),
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
const detailLayer = widget.details(divLeft, "Layer");
const detailExciter = widget.details(divRight, "Exciter");
const detailDelay = widget.details(divRight, "Delay");
const detailFilter = widget.details(divRight, "Filter");

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
  toneSlope:
    new widget.NumberInput(detailRender, "Tone Slope [dB/oct]", param.toneSlope, render),
  slopeStartHz:
    new widget.NumberInput(detailRender, "Slope Start [Hz]", param.slopeStartHz, render),

  nLayer: new widget.NumberInput(detailLayer, "nLayer", param.nLayer, render),
  timeMultiplier:
    new widget.NumberInput(detailLayer, "Time", param.timeMultiplier, render),
  highpassCutoffMultiplier: new widget.NumberInput(
    detailLayer, "Highpass Cutoff", param.highpassCutoffMultiplier, render),
  lowpassCutoffMultiplier: new widget.NumberInput(
    detailLayer, "Lowpass Cutoff", param.lowpassCutoffMultiplier, render),

  noiseDecay:
    new widget.NumberInput(detailExciter, "Noise Decay [s]", param.noiseDecay, render),
  noiseMix:
    new widget.NumberInput(detailExciter, "Noise Mix [dB]", param.noiseMix, render),

  nDelay: new widget.NumberInput(detailDelay, "nDelay", param.nDelay, render),
  seed: new widget.NumberInput(detailDelay, "Seed", param.seed, render),
  delayType: new widget.ComboBoxLine(detailDelay, "Delay Type", param.delayType, render),
  timeDistribution: new widget.ComboBoxLine(
    detailDelay, "Time Distribution", param.timeDistribution, render),
  delayTime:
    new widget.NumberInput(detailDelay, "Delay Time [s]", param.delayTime, render),
  timeRandomness:
    new widget.NumberInput(detailDelay, "Time Randomness", param.timeRandomness, render),
  feedback: new widget.NumberInput(detailDelay, "Feedback", param.feedback, render),

  highpassCutoffSlope: new widget.NumberInput(
    detailFilter, "Highpass Slope", param.highpassCutoffSlope, render),
  highpassHz: new widget.NumberInput(
    detailFilter, "Highpass Cutoff [Hz]", param.highpassHz, render),
  highpassQ: new widget.NumberInput(detailFilter, "Highpass Q", param.highpassQ, render),
  lowpassCutoffSlope: new widget.NumberInput(
    detailFilter, "Lowpass Slope", param.lowpassCutoffSlope, render),
  lowpassHz:
    new widget.NumberInput(detailFilter, "Lowpass Cutoff [Hz]", param.lowpassHz, render),
  lowpassQ: new widget.NumberInput(detailFilter, "Lowpass Q", param.lowpassQ, render),
};

render();
window.addEventListener("load", (ev) => { widget.refresh(ui); });
