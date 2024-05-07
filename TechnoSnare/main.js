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
    overSample: () => {},
    sampleRateScaler: () => {},
    dcHighpassHz: () => {},
    toneSlope: () => {},
    adaptiveFilterMix: () => {},
    limiterEnable: () => {},
    limiterThreshold: () => {},
    bodyHighpassHz: () => {},
    noiseCombRandom: () => {},
  },
  "Snare1": {
    renderDuration: () => {},
    fadeIn: () => {},
    fadeOut: () => {},
    decayTo: () => {},
    stereoMerge: () => {},
    overSample: () => {},
    sampleRateScaler: () => {},
    dcHighpassHz: () => {},
    toneSlope: () => {},
    bodyNoiseMix: (prm) => {
      const curve = 2;
      const inv = 1 / curve;
      prm.dsp
        = util.uniformDistributionMap(Math.random(), 1e-2 ** inv, 0.5 ** inv) ** curve;
    },
    adaptiveFilterMix: () => {},
    limiterEnable: () => {},
    limiterThreshold: () => {},
    bodyAttackSeconds:
      (prm) => { prm.dsp = util.exponentialMap(Math.random(), 1e-5, 1e-3); },
    bodyEnvelopeCurve: (prm) => { prm.dsp = util.exponentialMap(Math.random(), 8, 50); },
    bodyNoise: (prm) => { prm.dsp = util.exponentialMap(Math.random(), 1e-2, 3); },
    bodyPitchBaseHz: (prm) => { prm.dsp = util.exponentialMap(Math.random(), 10, 40); },
    bodyPitchModHz:
      (prm) => { prm.dsp = 100 * util.uniformDistributionMap(Math.random(), 0, 1) ** 2; },
    bodyLowpassHz: (prm) => {
      prm.dsp = util.exponentialMap(Math.random(), 200, scales.fullFreqHz.maxDsp);
    },
    bodyHighpassHz: (prm) => { prm.dsp = util.exponentialMap(Math.random(), 60, 120); },
    bodyModOctave: (prm) => {
      prm.dsp = util.uniformDistributionMap(Math.random(), scales.octave.minDsp, 3);
    },
    noiseAttackSeconds: () => {},
    noiseEnvelopeCurve:
      (prm) => { prm.dsp = util.uniformDistributionMap(Math.random(), 1, 20); },
    noiseBandpassHz:
      (prm) => { prm.dsp = util.uniformDistributionMap(Math.random(), 1000, 16000); },
    hightoneGain: (prm) => { prm.dsp = util.dbToAmp(-40); },
  },
  "Snare2": {
    renderDuration: () => {},
    fadeIn: () => {},
    fadeOut: () => {},
    decayTo: () => {},
    stereoMerge: () => {},
    overSample: () => {},
    sampleRateScaler: () => {},
    dcHighpassHz: () => {},
    toneSlope: () => {},
    bodyNoiseMix:
      (prm) => { prm.dsp = util.uniformDistributionMap(Math.random(), 0.1, 0.6); },
    adaptiveFilterMix: () => {},
    limiterEnable: () => {},
    limiterThreshold: () => {},
    bodyAttackSeconds: (prm) => {
      const value = util.exponentialMap(Math.random(), 1e-5, 1e-3);
      prm.dsp = value;
      param["noiseAttackSeconds"].dsp = value;
    },
    bodyEnvelopeCurve: (prm) => {
      const value = util.exponentialMap(Math.random(), 8, 50);
      prm.dsp = value;
      param["noiseEnvelopeCurve"].dsp = value;
    },
    bodyNoise: (prm) => { prm.dsp = util.uniformDistributionMap(Math.random(), 3, 6.2); },
    bodyPitchBaseHz: (prm) => { prm.dsp = util.exponentialMap(Math.random(), 10, 40); },
    bodyPitchModHz:
      (prm) => { prm.dsp = util.uniformDistributionMap(Math.random(), 0, 10); },
    bodyLowpassHz: (prm) => {
      prm.dsp = util.exponentialMap(Math.random(), 200, scales.fullFreqHz.maxDsp);
    },
    bodyHighpassHz: (prm) => { prm.dsp = util.exponentialMap(Math.random(), 60, 120); },
    bodyModOctave: (prm) => {
      prm.dsp = util.uniformDistributionMap(Math.random(), scales.octave.minDsp, 3);
    },
    noiseAttackSeconds: () => {},
    noiseEnvelopeCurve: () => {},
    noiseBandpassHz:
      (prm) => { prm.dsp = util.uniformDistributionMap(Math.random(), 1000, 16000); },
    hightoneGain: (prm) => { prm.dsp = util.dbToAmp(-40); },
  },
  "Full": {
    renderDuration: () => {},
    fadeIn: () => {},
    fadeOut: () => {},
    decayTo: () => {},
    stereoMerge: () => {},
    overSample: () => {},
    sampleRateScaler: () => {},
    dcHighpassHz: () => {},
  },
  "Body": {
    renderDuration: () => {},
    fadeIn: () => {},
    fadeOut: () => {},
    decayTo: () => {},
    stereoMerge: () => {},
    overSample: () => {},
    sampleRateScaler: () => {},
    dcHighpassHz: () => {},
    toneSlope: () => {},
    seed: () => {},
    bodyNoiseMix: () => {},
    adaptiveFilterMix: () => {},
    limiterEnable: () => {},
    limiterThreshold: () => {},
    limiterAttackSeconds: () => {},
    noiseAttackSeconds: () => {},
    noiseEnvelopeCurve: () => {},
    noiseBandpassHz: () => {},
    noiseCombMix: () => {},
    noiseCombFeedback: () => {},
    noiseCombHz: () => {},
    noiseCombRandom: () => {},
    noiseCombLowpassHz: () => {},
    noiseCombHighpassHz: () => {},
    hightoneGain: () => {},
    hightoneStartHz: () => {},
    hightoneEndHz: () => {},
    hightoneOvertoneRatio: () => {},
  },
  "Noise": {
    renderDuration: () => {},
    fadeIn: () => {},
    fadeOut: () => {},
    decayTo: () => {},
    stereoMerge: () => {},
    overSample: () => {},
    sampleRateScaler: () => {},
    dcHighpassHz: () => {},
    toneSlope: () => {},
    bodyNoiseMix: () => {},
    seed: () => {},
    adaptiveFilterMix: () => {},
    limiterEnable: () => {},
    limiterThreshold: () => {},
    limiterAttackSeconds: () => {},
    bodyAttackSeconds: () => {},
    bodyEnvelopeCurve: () => {},
    bodyPitchDecaySeconds: () => {},
    bodyAM: () => {},
    bodyOvertoneGain: () => {},
    bodyNoise: () => {},
    bodyPitchBaseHz: () => {},
    bodyPitchModHz: () => {},
    bodyLowpassHz: () => {},
    bodyHighpassHz: () => {},
    bodyModOctave: () => {},
    bodyModSaturationGain: () => {},
    hightoneGain: () => {},
    hightoneStartHz: () => {},
    hightoneEndHz: () => {},
    hightoneOvertoneRatio: () => {},
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
  stereoSeed: new parameter.MenuItemScale(menuitems.stereoSeedItems),

  seed: new parameter.IntScale(0, 2 ** 32),
  mix: new parameter.LinearScale(0, 1),

  limiterThreshold: new parameter.DecibelScale(-60, 20, false),
  limiterAttackSeconds: new parameter.DecibelScale(-100, -40, false),

  attackSeconds: new parameter.DecibelScale(-80, -20, true),
  envelopeCurve: new parameter.DecibelScale(-20, 60, true),
  pitchDecaySeconds: new parameter.DecibelScale(-40, 40, true),
  amAmount: new parameter.DecibelScale(-30, 0, true),
  bodyOvertoneGain: new parameter.DecibelScale(-40, 0, true),
  noiseAmount: new parameter.DecibelScale(-20, 20, true),
  lowFreqHz: new parameter.DecibelScale(0, 60, true),
  feedback: new parameter.NegativeDecibelScale(-60, 0, 1, true),
  fullFreqHz: new parameter.DecibelScale(0, 100, true),
  bandpassHz: new parameter.DecibelScale(20, 100, false),
  octave: new parameter.LinearScale(-8, 8),
  saturationGain: new parameter.DecibelScale(-40, 40, false),
  overtoneRatio: new parameter.DecibelScale(-40, -20, true),
  hightoneGain: new parameter.DecibelScale(-60, 0, true),
  hightoneFreqHz: new parameter.DecibelScale(40, 100, false),
};

const param = {
  renderDuration: new parameter.Parameter(0.5, scales.renderDuration, true),
  fadeIn: new parameter.Parameter(0, scales.fade, true),
  fadeOut: new parameter.Parameter(0.002, scales.fade, true),
  decayTo: new parameter.Parameter(1, scales.decayTo, false),
  overSample: new parameter.Parameter(1, scales.overSample),
  sampleRateScaler: new parameter.Parameter(0, scales.sampleRateScaler),
  dcHighpassHz: new parameter.Parameter(0, scales.dcHighpassHz, true),
  toneSlope: new parameter.Parameter(1, scales.toneSlope, false),
  adaptiveFilterMix: new parameter.Parameter(0.5, scales.mix),
  stereoSeed: new parameter.Parameter(0, scales.stereoSeed, false),

  seed: new parameter.Parameter(0, scales.seed),
  bodyNoiseMix: new parameter.Parameter(0.5, scales.mix),

  limiterEnable: new parameter.Parameter(0, scales.boolean),
  limiterThreshold: new parameter.Parameter(1, scales.limiterThreshold, false),
  limiterAttackSeconds: new parameter.Parameter(0.001, scales.limiterAttackSeconds, true),

  bodyAttackSeconds: new parameter.Parameter(600 / 48000, scales.attackSeconds, true),
  bodyEnvelopeCurve: new parameter.Parameter(100, scales.envelopeCurve, true),
  bodyPitchDecaySeconds:
    new parameter.Parameter(3500 / 48000, scales.pitchDecaySeconds, true),
  bodyAM: new parameter.Parameter(0.1, scales.amAmount, true),
  bodyOvertoneGain: new parameter.Parameter(0.25, scales.bodyOvertoneGain, true),
  bodyNoise: new parameter.Parameter(0.5, scales.noiseAmount, true),
  bodyPitchBaseHz: new parameter.Parameter(190, scales.lowFreqHz, true),
  bodyPitchModHz: new parameter.Parameter(55, scales.lowFreqHz, true),
  bodyLowpassHz: new parameter.Parameter(800, scales.fullFreqHz, true),
  bodyHighpassHz: new parameter.Parameter(17, scales.lowFreqHz, true),
  bodyModOctave: new parameter.Parameter(0, scales.octave, false),
  bodyModSaturationGain: new parameter.Parameter(0.1, scales.saturationGain, false),

  noiseAttackSeconds: new parameter.Parameter(0.0008, scales.attackSeconds, true),
  noiseEnvelopeCurve: new parameter.Parameter(100, scales.envelopeCurve, true),
  noiseBandpassHz: new parameter.Parameter(1000, scales.bandpassHz, true),
  noiseCombMix: new parameter.Parameter(0.5, scales.mix, true),
  noiseCombFeedback: new parameter.Parameter(0.5, scales.feedback, true),
  noiseCombHz: new parameter.Parameter(40, scales.bandpassHz, true),
  noiseCombRandom: new parameter.Parameter(0.3, scales.mix, true),
  noiseCombLowpassHz: new parameter.Parameter(2000, scales.fullFreqHz, true),
  noiseCombHighpassHz: new parameter.Parameter(200, scales.fullFreqHz, true),

  hightoneGain: new parameter.Parameter(0.5, scales.hightoneGain, false),
  hightoneStartHz: new parameter.Parameter(5344, scales.hightoneFreqHz, true),
  hightoneEndHz: new parameter.Parameter(600, scales.hightoneFreqHz, true),
  hightoneOvertoneRatio: new parameter.Parameter(270 / 5344, scales.overtoneRatio, true),
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
const detailMisc = widget.details(divLeft, "Misc.");
const detailLimiter = widget.details(divRightA, "Limiter");
const detailBody = widget.details(divRightA, "Body");
const detailNoise = widget.details(divRightB, "Noise");
const detailHightone = widget.details(divRightB, "Hightone");

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
  dcHighpassHz:
    new widget.NumberInput(detailRender, "DC Highpass [Hz]", param.dcHighpassHz, render),
  toneSlope:
    new widget.NumberInput(detailRender, "Tone Slope [dB/oct]", param.toneSlope, render),
  stereoSeed: new widget.ToggleButtonLine(
    detailRender, menuitems.stereoSeedItems, param.stereoSeed, render),

  seed: new widget.NumberInput(detailMisc, "Seed", param.seed, render),
  bodyNoiseMix:
    new widget.NumberInput(detailMisc, "Body/Noise Mix", param.bodyNoiseMix, render),
  adaptiveFilterMix: new widget.NumberInput(
    detailMisc, "Adaptive Filter Mix", param.adaptiveFilterMix, render),

  limiterEnable: new widget.ToggleButtonLine(
    detailLimiter, ["Off", "On"], param.limiterEnable, render),
  limiterThreshold: new widget.NumberInput(
    detailLimiter, "Threshold [dB]", param.limiterThreshold, render),
  limiterAttackSeconds: new widget.NumberInput(
    detailLimiter, "Attack [s]", param.limiterAttackSeconds, render),

  bodyAttackSeconds:
    new widget.NumberInput(detailBody, "Attack [s]", param.bodyAttackSeconds, render),
  bodyEnvelopeCurve:
    new widget.NumberInput(detailBody, "Curve", param.bodyEnvelopeCurve, render),
  bodyPitchDecaySeconds: new widget.NumberInput(
    detailBody, "Pitch Decay [s]", param.bodyPitchDecaySeconds, render),
  bodyAM: new widget.NumberInput(detailBody, "AM", param.bodyAM, render),
  bodyOvertoneGain:
    new widget.NumberInput(detailBody, "Overtone Gain", param.bodyOvertoneGain, render),
  bodyNoise: new widget.NumberInput(detailBody, "Noise", param.bodyNoise, render),
  bodyPitchBaseHz:
    new widget.NumberInput(detailBody, "Pitch Base [Hz]", param.bodyPitchBaseHz, render),
  bodyPitchModHz:
    new widget.NumberInput(detailBody, "Pitch Mod. [Hz]", param.bodyPitchModHz, render),
  bodyLowpassHz:
    new widget.NumberInput(detailBody, "Lowpass [Hz]", param.bodyLowpassHz, render),
  bodyHighpassHz:
    new widget.NumberInput(detailBody, "Highpass [Hz]", param.bodyHighpassHz, render),
  bodyModOctave:
    new widget.NumberInput(detailBody, "Mod. Pitch [oct.]", param.bodyModOctave, render),
  bodyModSaturationGain: new widget.NumberInput(
    detailBody, "Mod. Sat Gain [dB]", param.bodyModSaturationGain, render),

  noiseAttackSeconds:
    new widget.NumberInput(detailNoise, "Attack [s]", param.noiseAttackSeconds, render),
  noiseEnvelopeCurve:
    new widget.NumberInput(detailNoise, "Curve", param.noiseEnvelopeCurve, render),
  noiseBandpassHz:
    new widget.NumberInput(detailNoise, "Bandpass [Hz]", param.noiseBandpassHz, render),
  noiseCombMix:
    new widget.NumberInput(detailNoise, "Comb Mix", param.noiseCombMix, render),
  noiseCombFeedback:
    new widget.NumberInput(detailNoise, "Comb Feedback", param.noiseCombFeedback, render),
  noiseCombHz:
    new widget.NumberInput(detailNoise, "Comb Freq. [Hz]", param.noiseCombHz, render),
  noiseCombRandom: new widget.NumberInput(
    detailNoise, "Comb Freq. Random", param.noiseCombRandom, render),
  noiseCombLowpassHz:
    new widget.NumberInput(detailNoise, "Comb LP [Hz]", param.noiseCombLowpassHz, render),
  noiseCombHighpassHz: new widget.NumberInput(
    detailNoise, "Comb HP [Hz]", param.noiseCombHighpassHz, render),

  hightoneGain:
    new widget.NumberInput(detailHightone, "Gain [dB]", param.hightoneGain, render),
  hightoneStartHz: new widget.NumberInput(
    detailHightone, "Start Freq. [Hz]", param.hightoneStartHz, render),
  hightoneEndHz:
    new widget.NumberInput(detailHightone, "End Freq. [Hz]", param.hightoneEndHz, render),
  hightoneOvertoneRatio: new widget.NumberInput(
    detailHightone, "Overtone Ratio", param.hightoneOvertoneRatio, render),
};

render();
window.addEventListener("load", (ev) => { widget.refresh(ui); });
