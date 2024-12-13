// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {uiSize} from "../common/gui/palette.js";
import * as widget from "../common/gui/widget.js";
import * as parameter from "../common/parameter.js";
import * as util from "../common/util.js";
import * as wave from "../common/wave.js";

import * as menuitems from "./menuitems.js";

const version = 7;

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

    fdnSize: () => {},
    frequencyHz: (prm) => {},
    allpassDelayRatio: () => {},
    allpassGain: () => {},
    feedback: () => {},

    membranePitchType: (prm) => { prm.normalized = Math.random(); },
    lowpassHz: () => {},
    highpassHz: () => {},
    noiseLevel: () => {},
    noiseReleaseHz: () => {},

    velocity: () => {},
    couplingGain: () => {},

    envelopeDecaySecond: () => {},
    pitchMod: () => {},
    delayTimeMod: () => {},
    delayTimeEnv: () => {},
    allpassTimeEnv: () => {},

    reverbLowpassHz: () => {},
    reverbTimeMultiplier: () => {},
    reverbTimeMod: () => {},
  },
  "All": {
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

    fdnSize: () => {},

    membranePitchType: (prm) => { prm.normalized = Math.random(); },

    reverbTimeMultiplier: () => {},
  },
};

function getSampleRateScaler() {
  return parseInt(menuitems.sampleRateScalerItems[param.sampleRateScaler.dsp]);
}

function createArrayParameters(defaultDspValues, scale, size) {
  let arr = new Array(size);
  for (let i = 0; i < arr.length; ++i) {
    arr[i] = new parameter.Parameter(defaultDspValues[i], scale, true);
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

function onFdnSizeChanged(value) {
  ui.inputGain.setViewRange(0, value);
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
  dcHighpassHz: new parameter.DecibelScale(-20, 40, true),
  toneSlope: new parameter.DecibelScale(-12, 0, false),

  compressorInputGain: new parameter.DecibelScale(-20, 60, false),
  limiterType: new parameter.MenuItemScale(menuitems.limiterTypeItems),
  limiterThreshold: new parameter.DecibelScale(-60, 40, false),
  limiterSmoothingSeconds: new parameter.DecibelScale(-80, -20, false),

  excitationType: new parameter.MenuItemScale(menuitems.excitationTypeItems),
  excitationLowpass: new parameter.LinearScale(0, 1),
  excitationSineModLevel: new parameter.DecibelScale(-40, 40, true),
  excitationSineModDecay: new parameter.DecibelScale(-40, 0, false),

  fdnSize: new parameter.IntScale(1, 16),
  delayInterpType: new parameter.MenuItemScale(menuitems.delayInterpTypeItems),
  frequencyHz: new parameter.DecibelScale(util.ampToDB(10), util.ampToDB(10000), false),
  allpassGain: new parameter.LinearScale(-1, 1),
  allpassDelayRatio: new parameter.LinearScale(0.001, 0.999),
  feedback: new parameter.LinearScale(-1, 1),
  matrixCharacter: new parameter.LinearScale(0, 1),
  inputGain: new parameter.LinearScale(0, 1),

  membranePitchType: new parameter.MenuItemScale(menuitems.membranePitchTypeItems),
  membranePitchIndex: new parameter.IntScale(0, 15),
  lowpassHz: new parameter.DecibelScale(20, 100, false),
  highpassHz: new parameter.DecibelScale(0, 80, false),
  noiseLevel: new parameter.DecibelScale(-60, 20, true),
  noiseReleaseHz: new parameter.DecibelScale(0, 40, false),

  velocity: new parameter.LinearScale(0, 2),
  seed: new parameter.IntScale(0, 2 ** 32),
  couplingGain: new parameter.DecibelScale(-60, 60, false),

  envelopeDecaySecond: new parameter.DecibelScale(-40, 40, false),
  pitchMod: new parameter.DecibelScale(-20, 20, true),
  delayTimeMod: new parameter.DecibelScale(-20, 100, true),
  delayTimeEnv: new parameter.LinearScale(0, 1),

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

  excitationType: new parameter.Parameter(0, scales.excitationType, true),
  excitationLowpass: new parameter.Parameter(0.5, scales.excitationLowpass, true),
  excitationSineModLevel: new parameter.Parameter(0, scales.excitationSineModLevel, true),
  excitationSineModDecay:
    new parameter.Parameter(0.5, scales.excitationSineModDecay, true),

  fdnSize: new parameter.Parameter(16, scales.fdnSize, true),
  delayInterpType: new parameter.Parameter(2, scales.delayInterpType),
  frequencyHz: new parameter.Parameter(500, scales.frequencyHz, true),
  allpassDelayRatio: new parameter.Parameter(0.1, scales.allpassDelayRatio, true),
  allpassGain: new parameter.Parameter(-0.3, scales.allpassGain, true),
  feedback: new parameter.Parameter(-0.9, scales.feedback, true),
  matrixCharacterA: new parameter.Parameter(0, scales.matrixCharacter, true),
  matrixCharacterB: new parameter.Parameter(0, scales.matrixCharacter, true),
  inputGain: createArrayParameters(
    new Array(scales.fdnSize.max).fill(1), scales.inputGain, scales.fdnSize.max),

  membranePitchType: new parameter.Parameter(1, scales.membranePitchType, true),
  membranePitchIndex: new parameter.Parameter(0, scales.membranePitchIndex, true),
  lowpassHz: new parameter.Parameter(2400, scales.lowpassHz, true),
  highpassHz: new parameter.Parameter(20, scales.highpassHz, true),
  noiseLevel: new parameter.Parameter(1.3, scales.noiseLevel, true),
  noiseReleaseHz: new parameter.Parameter(20, scales.noiseReleaseHz, true),

  velocity: new parameter.Parameter(0.5, scales.velocity, true),
  seed: new parameter.Parameter(0, scales.seed, true),
  couplingGain: new parameter.Parameter(20, scales.couplingGain, false),

  envelopeDecaySecond: new parameter.Parameter(0.16, scales.envelopeDecaySecond, true),
  pitchMod: new parameter.Parameter(0, scales.pitchMod, true),
  delayTimeMod: new parameter.Parameter(140, scales.delayTimeMod, true),
  delayTimeEnv: new parameter.Parameter(0.75, scales.delayTimeEnv, true),
  allpassTimeEnv: new parameter.Parameter(0.0, scales.delayTimeEnv, true),

  reverbTimeMultiplier: new parameter.Parameter(0.25, scales.reverbTimeMultiplier, true),
  reverbLowpassHz:
    new parameter.Parameter(scales.reverbLowpassHz.maxDsp, scales.reverbLowpassHz, true),
  reverbFeedback: new parameter.Parameter(0.8, scales.reverbFeedback, true),
  reverbTimeMod: new parameter.Parameter(0, scales.delayTimeMod, true),
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
    onFdnSizeChanged(param.fdnSize.dsp);
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
paragraphTip1.textContent
  = "Try setting `Limiter -> Type` to Tanh, then change `Misc. -> Velocity`."

const detailRender = widget.details(divLeft, "Render");
const detailLimiter = widget.details(divLeft, "Limiter");
const detailSnareExcitation = widget.details(divRightA, "Excitation");
const detailSnareDelay = widget.details(divRightA, "Delay");
const detailSnareTone = widget.details(divRightB, "Tone Shaping");
const detailSnareMisc = widget.details(divRightB, "Misc.");
const detailSnareModulation = widget.details(divRightB, "Modulation");
const detailBodyResonance = widget.details(divRightB, "Body Resonance");

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

  excitationType:
    new widget.ComboBoxLine(detailSnareExcitation, "Type", param.excitationType, render),
  excitationLowpass: new widget.NumberInput(
    detailSnareExcitation, "Lowpass", param.excitationLowpass, render),
  excitationSineModLevel: new widget.NumberInput(
    detailSnareExcitation, "Mod. Level", param.excitationSineModLevel, render),
  excitationSineModDecay: new widget.NumberInput(
    detailSnareExcitation, "Mod. Decay", param.excitationSineModDecay, render),

  fdnSize:
    new widget.NumberInput(detailSnareDelay, "FDN Size", param.fdnSize, onFdnSizeChanged),
  delayInterpType: new widget.ComboBoxLine(
    detailSnareDelay, "Delay Interpolation", param.delayInterpType, render),
  frequencyHz:
    new widget.NumberInput(detailSnareDelay, "Frequency [Hz]", param.frequencyHz, render),
  allpassDelayRatio: new widget.NumberInput(
    detailSnareDelay, "Allpass:Delay Ratio", param.allpassDelayRatio, render),
  allpassGain:
    new widget.NumberInput(detailSnareDelay, "Allpass Gain", param.allpassGain, render),
  feedback: new widget.NumberInput(detailSnareDelay, "Feedback", param.feedback, render),
  matrixCharacterA:
    new widget.NumberInput(detailSnareDelay, "Matrix α", param.matrixCharacterA, render),
  matrixCharacterB:
    new widget.NumberInput(detailSnareDelay, "Matrix β", param.matrixCharacterB, render),
  inputGain: new widget.BarBox(
    detailSnareDelay, "Matrix Input Gain", uiSize.barboxWidth, uiSize.barboxHeight,
    param.inputGain, render),

  membranePitchType: new widget.ComboBoxLine(
    detailSnareTone, "Pitch Type", param.membranePitchType, render),
  membranePitchIndex: new widget.NumberInput(
    detailSnareTone, "Pitch Index", param.membranePitchIndex, render),
  lowpassHz:
    new widget.NumberInput(detailSnareTone, "Lowpass [Hz]", param.lowpassHz, render),
  highpassHz:
    new widget.NumberInput(detailSnareTone, "Highpass [Hz]", param.highpassHz, render),
  noiseLevel:
    new widget.NumberInput(detailSnareTone, "Noise Level", param.noiseLevel, render),
  noiseReleaseHz: new widget.NumberInput(
    detailSnareTone, "Noise Release [Hz]", param.noiseReleaseHz, render),

  velocity: new widget.NumberInput(detailSnareMisc, "Velocity", param.velocity, render),
  seed: new widget.NumberInput(detailSnareMisc, "Seed", param.seed, render),
  couplingGain: new widget.NumberInput(
    detailSnareMisc, "Coupling Gain [dB]", param.couplingGain, render),

  envelopeDecaySecond: new widget.NumberInput(
    detailSnareModulation, "Env. Decay [s]", param.envelopeDecaySecond, render),
  pitchMod: new widget.NumberInput(
    detailSnareModulation, "Env. -> Pitch", param.pitchMod, render),
  delayTimeMod: new widget.NumberInput(
    detailSnareModulation, "Delay Mod. [sample]", param.delayTimeMod, render),
  delayTimeEnv: new widget.NumberInput(
    detailSnareModulation, "Env. -> Delay Mod.", param.delayTimeEnv, render),
  allpassTimeEnv: new widget.NumberInput(
    detailSnareModulation, "Env. -> Allpass Mod.", param.allpassTimeEnv, render),

  reverbTimeMultiplier: new widget.NumberInput(
    detailBodyResonance, "Time Multiplier", param.reverbTimeMultiplier, render),
  reverbLowpassHz: new widget.NumberInput(
    detailBodyResonance, "Lowpass Cutoff [Hz]", param.reverbLowpassHz, render),
  reverbFeedback:
    new widget.NumberInput(detailBodyResonance, "Feedback", param.reverbFeedback, render),
  reverbTimeMod: new widget.NumberInput(
    detailBodyResonance, "Delay Mod. [sample]", param.reverbTimeMod, render),
};

onFdnSizeChanged(param.fdnSize.dsp);
window.addEventListener("load", (ev) => { widget.refresh(ui); });
