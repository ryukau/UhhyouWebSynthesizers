// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {uiSize} from "../common/gui/palette.js";
import * as widget from "../common/gui/widget.js";
import * as parameter from "../common/parameter.js";
import * as util from "../common/util.js";
import * as wave from "../common/wave.js";

import * as menuitems from "./menuitems.js";

const version = 5;

const localRecipeBook = {
  "Default": {
    renderDuration: () => {},
    fadeIn: () => {},
    fadeOut: () => {},
    decayTo: () => {},
    stereoMerge: () => {},
    overSample: () => {},
    sampleRateScaler: () => {},

    limiterType: () => {},
    limiterThreshold: () => {},
    limiterSmoothingSeconds: () => {},
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

  renderDuration: new parameter.DecibelScale(-60, 40, false),
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

  velocity: new parameter.LinearScale(0, 2),
  seed: new parameter.IntScale(0, 2 ** 32),
  pitchType: new parameter.MenuItemScale(menuitems.pitchTypeItems),
  delayInterpType: new parameter.MenuItemScale(menuitems.delayInterpTypeItems),
  frequencyHz: new parameter.DecibelScale(util.ampToDB(10), util.ampToDB(1000), false),
  allpassGain: new parameter.LinearScale(-1, 1),
  allpassDelayRatio: new parameter.LinearScale(0.001, 0.999),
  feedback: new parameter.LinearScale(0, 1),
  damping: new parameter.LinearScale(0, 1),
  highpassHz: new parameter.DecibelScale(util.ampToDB(1), util.ampToDB(500), false),
  noiseLevel: new parameter.DecibelScale(-60, 20, false),
  envelopeDecaySecond: new parameter.DecibelScale(-40, 0, false),
  pitchMod: new parameter.DecibelScale(-20, 20, true),
  delayTimeMod: new parameter.DecibelScale(-20, 100, true),
  delayTimeEnv: new parameter.LinearScale(0, 1),

  reverbMix: new parameter.DecibelScale(-60, 0, true),
  reverbTimeMultiplier: new parameter.DecibelScale(-20, 20, false),
  reverbLowpassHz: new parameter.MidiPitchScale(
    util.freqToMidiPitch(100), util.freqToMidiPitch(48000), false),
  reverbFeedback: new parameter.NegativeDecibelScale(-40, 0, 1, true),
};

const param = {
  renderDuration: new parameter.Parameter(0.5, scales.renderDuration, true),
  fadeIn: new parameter.Parameter(0.0, scales.fade, true),
  fadeOut: new parameter.Parameter(0.002, scales.fade, true),
  decayTo: new parameter.Parameter(1, scales.decayTo, false),
  stereoMerge: new parameter.Parameter(0.75, scales.stereoMerge),
  overSample: new parameter.Parameter(0, scales.overSample),
  sampleRateScaler: new parameter.Parameter(0, scales.sampleRateScaler),

  limiterType: new parameter.Parameter(0, scales.limiterType, true),
  limiterThreshold: new parameter.Parameter(1, scales.limiterThreshold, false),
  limiterSmoothingSeconds:
    new parameter.Parameter(0.02, scales.limiterSmoothingSeconds, true),

  velocity: new parameter.Parameter(0.5, scales.velocity, true),
  seed: new parameter.Parameter(0, scales.seed, true),
  pitchType: new parameter.Parameter(0, scales.pitchType),
  delayInterpType: new parameter.Parameter(2, scales.delayInterpType),
  frequencyHz: new parameter.Parameter(170, scales.frequencyHz, true),
  allpassDelayRatio: new parameter.Parameter(5 / 9, scales.allpassDelayRatio, true),
  allpassGain: new parameter.Parameter(0.66, scales.allpassGain, true),
  feedback: new parameter.Parameter(0.77, scales.feedback, true),
  damping: new parameter.Parameter(0.4, scales.damping, true),
  highpassHz: new parameter.Parameter(20, scales.highpassHz, true),
  noiseLevel: new parameter.Parameter(1.3, scales.noiseLevel, true),
  envelopeDecaySecond: new parameter.Parameter(0.08, scales.envelopeDecaySecond, true),
  pitchMod: new parameter.Parameter(1, scales.pitchMod, true),
  delayTimeMod: new parameter.Parameter(1150, scales.delayTimeMod, true),
  delayTimeEnv: new parameter.Parameter(1, scales.delayTimeEnv, true),
  allpassTimeEnv: new parameter.Parameter(0.33, scales.delayTimeEnv, true),

  reverbMix: new parameter.Parameter(0.1, scales.reverbMix),
  reverbTimeMultiplier: new parameter.Parameter(0.17, scales.reverbTimeMultiplier, true),
  reverbLowpassHz:
    new parameter.Parameter(scales.reverbLowpassHz.maxDsp, scales.reverbLowpassHz, true),
  reverbFeedback: new parameter.Parameter(0.8, scales.reverbFeedback, true),
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
// const divRightB = widget.div(divMain, undefined, "controlBlock");

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
const detailSnare = widget.details(divRightA, "Snare");
const detailReverb = widget.details(divRightA, "Reverb");

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

  limiterType: new widget.ComboBoxLine(detailLimiter, "Type", param.limiterType, render),
  limiterThreshold: new widget.NumberInput(
    detailLimiter, "Threshold [dB]", param.limiterThreshold, render),
  limiterSmoothingSeconds: new widget.NumberInput(
    detailLimiter, "Smoothing [s]", param.limiterSmoothingSeconds, render),

  velocity: new widget.NumberInput(detailSnare, "Velocity", param.velocity, render),
  seed: new widget.NumberInput(detailSnare, "Seed", param.seed, render),
  pitchType: new widget.ComboBoxLine(detailSnare, "Pitch Type", param.pitchType, render),
  delayInterpType: new widget.ComboBoxLine(
    detailSnare, "Delay Interpolation", param.delayInterpType, render),
  frequencyHz:
    new widget.NumberInput(detailSnare, "Frequency [Hz]", param.frequencyHz, render),
  allpassDelayRatio: new widget.NumberInput(
    detailSnare, "Allpass:Delay Ratio", param.allpassDelayRatio, render),
  allpassGain:
    new widget.NumberInput(detailSnare, "Allpass Gain", param.allpassGain, render),
  feedback: new widget.NumberInput(detailSnare, "Feedback", param.feedback, render),
  damping: new widget.NumberInput(detailSnare, "Damping", param.damping, render),
  highpassHz:
    new widget.NumberInput(detailSnare, "Highpass [Hz]", param.highpassHz, render),
  noiseLevel:
    new widget.NumberInput(detailSnare, "Noise Level", param.noiseLevel, render),
  envelopeDecaySecond: new widget.NumberInput(
    detailSnare, "Env. Decay [s]", param.envelopeDecaySecond, render),
  pitchMod: new widget.NumberInput(detailSnare, "Env. -> Pitch", param.pitchMod, render),
  delayTimeMod: new widget.NumberInput(
    detailSnare, "Delay Mod. [sample]", param.delayTimeMod, render),
  delayTimeEnv:
    new widget.NumberInput(detailSnare, "Env. -> Delay Mod.", param.delayTimeEnv, render),
  allpassTimeEnv: new widget.NumberInput(
    detailSnare, "Env. -> Allpass Mod.", param.allpassTimeEnv, render),

  reverbMix: new widget.NumberInput(detailReverb, "Mix [dB]", param.reverbMix, render),
  reverbTimeMultiplier: new widget.NumberInput(
    detailReverb, "Time Multiplier", param.reverbTimeMultiplier, render),
  reverbLowpassHz: new widget.NumberInput(
    detailReverb, "Lowpass Cutoff [Hz]", param.reverbLowpassHz, render),
  reverbFeedback:
    new widget.NumberInput(detailReverb, "Feedback", param.reverbFeedback, render),
};

render();
window.addEventListener("load", (ev) => { widget.refresh(ui); });
