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

    slicerRegions: () => {},
    slicerExcitationGainRange: () => {},

    limiterType: () => {},
    limiterThreshold: () => {},
    limiterSmoothingSeconds: () => {},

    excitationGain: () => {},

    noiseLowOn: () => {},
    noiseLowDecaySeconds: () => {},

    noiseHighOn: () => {},
    noiseHighDecaySeconds: () => {},

    extraFdnOn: () => {},
    extraFdnSize: () => {},
    extraFeedback: () => {},
    extraLowpassHz: () => {},
    extraHighpassHz: () => {},

    cymbalFdnOn: () => {},
    cymbalFdnSize: () => {},
    cymbalFeedback: () => {},
    cymbalLowpassHz: () => {},
    cymbalHighpassHz: () => {},
    cymbalDelayTimeMod: () => {},
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
  ui.cymbalFdnInputGain.setViewRange(0, value);
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

  slicerRegions: new parameter.IntScale(1, 128),
  slicerExcitationGainRange: new parameter.DecibelScale(0, 60, false),

  limiterType: new parameter.MenuItemScale(menuitems.limiterTypeItems),
  limiterThreshold: new parameter.DecibelScale(-60, 40, false),
  limiterSmoothingSeconds: new parameter.DecibelScale(-80, -20, false),

  seed: new parameter.IntScale(0, 2 ** 32),
  excitationGain: new parameter.DecibelScale(-60, 60, false),
  mixRatio: new parameter.DecibelScale(-60, 60, true),
  envelopeFollowerHz: new parameter.DecibelScale(-60, 60, true),

  decaySeconds: new parameter.DecibelScale(-40, 40, false),
  noiseLowpassResonance: new parameter.LinearScale(0, 1),

  fdnSize: new parameter.IntScale(1, 64),
  membranePitchType: new parameter.MenuItemScale(menuitems.membranePitchTypeItems),
  membranePitchIndex: new parameter.IntScale(0, 15),
  delayInterpType: new parameter.MenuItemScale(menuitems.delayInterpTypeItems),
  frequencyHz: new parameter.DecibelScale(util.ampToDB(10), util.ampToDB(10000), false),
  feedback: new parameter.LinearScale(-1, 1),
  fdnInputGain: new parameter.LinearScale(0, 1),
  lowpassHz: new parameter.DecibelScale(20, 100, false),
  highpassHz: new parameter.DecibelScale(0, 80, false),
  highpassFollowDelayTime: new parameter.LinearScale(0, 1),
  delayTimeMod: new parameter.DecibelScale(-20, 120, true),
  envelopeFollowerToLowpass: new parameter.DecibelScale(-20, 100, true),
  cymbalSaturator: new parameter.MenuItemScale(menuitems.cymbalSaturatorItems),
};

const param = {
  renderDuration: new parameter.Parameter(2, scales.renderDuration, true),
  fadeIn: new parameter.Parameter(0.0, scales.fade, true),
  fadeOut: new parameter.Parameter(0.002, scales.fade, true),
  decayTo: new parameter.Parameter(1, scales.decayTo, false),
  stereoMerge: new parameter.Parameter(0, scales.stereoMerge),
  overSample: new parameter.Parameter(0, scales.overSample),
  sampleRateScaler: new parameter.Parameter(1, scales.sampleRateScaler),

  slicerRegions: new parameter.Parameter(1, scales.slicerRegions),
  slicerExcitationGainRange:
    new parameter.Parameter(util.dbToAmp(24), scales.slicerExcitationGainRange),

  limiterType: new parameter.Parameter(0, scales.limiterType, true),
  limiterThreshold: new parameter.Parameter(1, scales.limiterThreshold, false),
  limiterSmoothingSeconds:
    new parameter.Parameter(0.02, scales.limiterSmoothingSeconds, true),

  seed: new parameter.Parameter(1819103606, scales.seed, true),
  excitationGain:
    new parameter.Parameter(util.dbToAmp(-11), scales.excitationGain, false),
  envelopeFollowerHz: new parameter.Parameter(2.3, scales.envelopeFollowerHz, true),

  noiseLowOn: new parameter.Parameter(1, scales.boolean, true),
  noiseLowDecaySeconds: new parameter.Parameter(1, scales.decaySeconds, true),
  noiseLowLowpassBaseHz: new parameter.Parameter(1200, scales.lowpassHz, true),
  noiseLowLowpassModHz: new parameter.Parameter(8000, scales.lowpassHz, true),
  noiseLowLowpassResonance:
    new parameter.Parameter(0.57, scales.noiseLowpassResonance, true),

  noiseHighOn: new parameter.Parameter(1, scales.boolean, true),
  noiseHighMixRatio: new parameter.Parameter(2, scales.mixRatio, true),
  noiseHighDecaySeconds: new parameter.Parameter(0.05, scales.decaySeconds, true),
  noiseHighHighpassHz: new parameter.Parameter(1000, scales.lowpassHz, true),

  extraFdnOn: new parameter.Parameter(1, scales.boolean, true),
  extraFdnSize: new parameter.Parameter(16, scales.fdnSize, true),
  extraFrequencyHz: new parameter.Parameter(100, scales.frequencyHz, true),
  extraFeedback: new parameter.Parameter(0.95, scales.feedback, true),
  extraLowpassHz: new parameter.Parameter(15000, scales.lowpassHz, true),
  extraHighpassHz: new parameter.Parameter(23, scales.highpassHz, true),

  cymbalFdnOn: new parameter.Parameter(1, scales.boolean, true),
  cymbalFdnSize: new parameter.Parameter(16, scales.fdnSize, true),
  cymbalMembranePitchType: new parameter.Parameter(0, scales.membranePitchType, true),
  cymbalMembranePitchIndex: new parameter.Parameter(10, scales.membranePitchIndex, true),
  cymbalDelayInterpType: new parameter.Parameter(2, scales.delayInterpType),
  cymbalFrequencyHz: new parameter.Parameter(640, scales.frequencyHz, true),
  cymbalFeedback: new parameter.Parameter(0.992, scales.feedback, true),
  cymbalFdnInputGain: createArrayParameters(
    new Array(scales.fdnSize.max).fill(1).map((v, i) => i >= 16 ? 1 : (16 - i) / 16),
    scales.fdnInputGain, scales.fdnSize.max),
  cymbalLowpassHz: new parameter.Parameter(19000, scales.lowpassHz, true),
  cymbalHighpassHz: new parameter.Parameter(240, scales.highpassHz, true),
  cymbalHighpassFollowDelayTime:
    new parameter.Parameter(0.3, scales.highpassFollowDelayTime, true),
  cymbalDelayTimeMod: new parameter.Parameter(0, scales.delayTimeMod, true),
  cymbalEnvelopeFollowerToLowpass:
    new parameter.Parameter(0, scales.envelopeFollowerToLowpass, true),
  cymbalSaturator: new parameter.Parameter(2, scales.cymbalSaturator, true),
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
    onFdnSizeChanged(param.cymbalFdnSize.dsp);
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
const detailSlicer = widget.details(divLeft, "Slicer");
const detailLimiter = widget.details(divLeft, "Limiter");
const detailMisc = widget.details(divRightA, "Misc");
const detailNoiseLow = widget.details(divRightA, "Noise Low");
const detailNoiseHigh = widget.details(divRightA, "Noise High");
const detailExtra = widget.details(divRightA, "Extra FDN");
const detailFdn = widget.details(divRightB, "Cymbal");

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

  slicerRegions:
    new widget.NumberInput(detailSlicer, "nRegion", param.slicerRegions, render),
  slicerExcitationGainRange: new widget.NumberInput(
    detailSlicer, "Excitation Range [dB]", param.slicerExcitationGainRange, render),

  limiterType: new widget.ComboBoxLine(detailLimiter, "Type", param.limiterType, render),
  limiterThreshold: new widget.NumberInput(
    detailLimiter, "Threshold [dB]", param.limiterThreshold, render),
  limiterSmoothingSeconds: new widget.NumberInput(
    detailLimiter, "Smoothing [s]", param.limiterSmoothingSeconds, render),

  seed: new widget.NumberInput(detailMisc, "Seed", param.seed, render),
  excitationGain:
    new widget.NumberInput(detailMisc, "Gain [dB]", param.excitationGain, render),
  envelopeFollowerHz: new widget.NumberInput(
    detailMisc, "Env. Follower [Hz]", param.envelopeFollowerHz, render),

  noiseLowOn:
    new widget.ToggleButtonLine(detailNoiseLow, ["Off", "On"], param.noiseLowOn, render),
  noiseLowDecaySeconds: new widget.NumberInput(
    detailNoiseLow, "Decay [s]", param.noiseLowDecaySeconds, render),
  noiseLowLowpassBaseHz: new widget.NumberInput(
    detailNoiseLow, "LP Base [Hz]", param.noiseLowLowpassBaseHz, render),
  noiseLowLowpassModHz: new widget.NumberInput(
    detailNoiseLow, "LP Mod. [Hz]", param.noiseLowLowpassModHz, render),
  noiseLowLowpassResonance: new widget.NumberInput(
    detailNoiseLow, "LP Resonance", param.noiseLowLowpassResonance, render),

  noiseHighOn: new widget.ToggleButtonLine(
    detailNoiseHigh, ["Off", "On"], param.noiseHighOn, render),
  noiseHighMixRatio: new widget.NumberInput(
    detailNoiseHigh, "Mix Ratio [dB]", param.noiseHighMixRatio, render),
  noiseHighDecaySeconds: new widget.NumberInput(
    detailNoiseHigh, "Decay [s]", param.noiseHighDecaySeconds, render),
  noiseHighHighpassHz: new widget.NumberInput(
    detailNoiseHigh, "Highpass [Hz]", param.noiseHighHighpassHz, render),

  extraFdnOn:
    new widget.ToggleButtonLine(detailExtra, ["Off", "On"], param.extraFdnOn, render),
  extraFdnSize:
    new widget.NumberInput(detailExtra, "FDN Size", param.extraFdnSize, render),
  extraFrequencyHz:
    new widget.NumberInput(detailExtra, "Frequency [Hz]", param.extraFrequencyHz, render),
  extraFeedback:
    new widget.NumberInput(detailExtra, "Feedback", param.extraFeedback, render),
  extraLowpassHz:
    new widget.NumberInput(detailExtra, "Lowpass [Hz]", param.extraLowpassHz, render),
  extraHighpassHz:
    new widget.NumberInput(detailExtra, "Highpass [Hz]", param.extraHighpassHz, render),

  cymbalFdnOn:
    new widget.ToggleButtonLine(detailFdn, ["Off", "On"], param.cymbalFdnOn, render),
  cymbalFdnSize:
    new widget.NumberInput(detailFdn, "FDN Size", param.cymbalFdnSize, onFdnSizeChanged),
  cymbalMembranePitchType: new widget.ComboBoxLine(
    detailFdn, "Pitch Type", param.cymbalMembranePitchType, render),
  cymbalMembranePitchIndex: new widget.NumberInput(
    detailFdn, "Pitch Index", param.cymbalMembranePitchIndex, render),
  cymbalDelayInterpType: new widget.ComboBoxLine(
    detailFdn, "Delay Interpolation", param.cymbalDelayInterpType, render),
  cymbalFrequencyHz:
    new widget.NumberInput(detailFdn, "Frequency [Hz]", param.cymbalFrequencyHz, render),
  cymbalFeedback:
    new widget.NumberInput(detailFdn, "Feedback", param.cymbalFeedback, render),
  cymbalFdnInputGain: new widget.BarBox(
    detailFdn, "Matrix Input Gain", uiSize.barboxWidth, uiSize.barboxHeight,
    param.cymbalFdnInputGain, render),
  cymbalLowpassHz:
    new widget.NumberInput(detailFdn, "Lowpass [Hz]", param.cymbalLowpassHz, render),
  cymbalHighpassHz:
    new widget.NumberInput(detailFdn, "Highpass [Hz]", param.cymbalHighpassHz, render),
  cymbalHighpassFollowDelayTime: new widget.NumberInput(
    detailFdn, "Highpass Character", param.cymbalHighpassFollowDelayTime, render),
  cymbalDelayTimeMod: new widget.NumberInput(
    detailFdn, "Delay Mod. [sample]", param.cymbalDelayTimeMod, render),
  cymbalEnvelopeFollowerToLowpass: new widget.NumberInput(
    detailFdn, "Env. To LP Mod.", param.cymbalEnvelopeFollowerToLowpass, render),
  cymbalSaturator:
    new widget.ComboBoxLine(detailFdn, "Saturator Type", param.cymbalSaturator, render),
};

onFdnSizeChanged(param.cymbalFdnSize.dsp);
window.addEventListener("load", (ev) => { widget.refresh(ui); });
