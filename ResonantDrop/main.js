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
  dcHighpassHz: new parameter.DecibelScale(-20, 40, true),

  seed: new parameter.IntScale(0, 2 ** 32),
  frequencyHz: new parameter.DecibelScale(util.ampToDB(2), util.ampToDB(20000), false),
  oscDecaySeconds: new parameter.DecibelScale(-60, 60, false),
  oscTone: new parameter.DecibelScale(util.ampToDB(2), util.ampToDB(32), false),
  timeSpreadSeconds: new parameter.DecibelScale(-80, 20, false),
  fmIndex: new parameter.DecibelScale(-20, 40, true),

  nResonator: new parameter.IntScale(0, 64),
  resonatorBandWidth: new parameter.NegativeDecibelScale(-100, -20, 1, true),
  envelopeDecaySeconds: new parameter.DecibelScale(-40, 40, false),
  envelopeTimeRandom: new parameter.LinearScale(0, 8),
  realImaginaryMix: new parameter.LinearScale(0, 1),

  reverbMix: new parameter.DecibelScale(-60, 0, true),
  reverbSecond: new parameter.DecibelScale(-60, -20, true),
  reverbLowpassHz: new parameter.MidiPitchScale(
    util.freqToMidiPitch(100), util.freqToMidiPitch(48000), false),
  reverbFeedback: new parameter.NegativeDecibelScale(-60, 0, 1, true),
};

const param = {
  renderDuration: new parameter.Parameter(1, scales.renderDuration, true),
  fadeIn: new parameter.Parameter(0.0, scales.fade, true),
  fadeOut: new parameter.Parameter(0.002, scales.fade, true),
  decayTo: new parameter.Parameter(1, scales.decayTo, false),
  stereoMerge: new parameter.Parameter(0.6, scales.stereoMerge),
  overSample: new parameter.Parameter(1, scales.overSample),
  sampleRateScaler: new parameter.Parameter(0, scales.sampleRateScaler),
  toneSlope: new parameter.Parameter(1, scales.toneSlope, false),
  dcHighpassHz: new parameter.Parameter(4, scales.dcHighpassHz, true),

  seed: new parameter.Parameter(0, scales.seed, true),
  baseHz: new parameter.Parameter(util.midiPitchToFreq(96), scales.frequencyHz, true),
  oscDecaySeconds: new parameter.Parameter(2, scales.oscDecaySeconds, true),
  oscTone: new parameter.Parameter(2, scales.oscTone, true),
  timeSpreadSeconds: new parameter.Parameter(2, scales.timeSpreadSeconds, true),
  fmIndex: new parameter.Parameter(0, scales.fmIndex, true),

  resonatorNormalize: new parameter.Parameter(1, scales.boolean, true),
  nResonator: new parameter.Parameter(32, scales.nResonator, true),
  resonatorBandWidth: new parameter.Parameter(0.995, scales.resonatorBandWidth, true),
  resonanceBaseHz: new parameter.Parameter(400, scales.frequencyHz, true),
  resonanceRandom: new parameter.Parameter(4, scales.envelopeTimeRandom, true),
  resonanceEnvMod: new parameter.Parameter(0, scales.envelopeTimeRandom, true),
  resonanceOscMod: new parameter.Parameter(0, scales.envelopeTimeRandom, true),
  envelopeDecaySeconds: new parameter.Parameter(4, scales.envelopeDecaySeconds, true),
  envelopeTimeRandom: new parameter.Parameter(1, scales.envelopeTimeRandom, true),
  realImaginaryMix: new parameter.Parameter(1, scales.realImaginaryMix, true),

  reverbMix: new parameter.Parameter(0.1, scales.reverbMix),
  reverbBaseSecond: new parameter.Parameter(0.01, scales.reverbSecond, true),
  reverbLowpassHz:
    new parameter.Parameter(scales.reverbLowpassHz.maxDsp, scales.reverbLowpassHz, true),
  reverbFeedback: new parameter.Parameter(0.98, scales.reverbFeedback, true),
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

const detailRender = widget.details(divLeft, "Render");
const detailReverb = widget.details(divLeft, "Reverb");
const detailOsc = widget.details(divRightA, "Oscillator");
const detailResonator = widget.details(divRightA, "Resonator");

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
  dcHighpassHz:
    new widget.NumberInput(detailRender, "DC Highpass [Hz]", param.dcHighpassHz, render),

  seed: new widget.NumberInput(detailOsc, "Seed", param.seed, render),
  baseHz: new widget.NumberInput(detailOsc, "Frequency [Hz]", param.baseHz, render),
  oscDecaySeconds:
    new widget.NumberInput(detailOsc, "Decay [s]", param.oscDecaySeconds, render),
  oscTone: new widget.NumberInput(detailOsc, "Tone", param.oscTone, render),
  fmIndex: new widget.NumberInput(detailOsc, "FM Index", param.fmIndex, render),

  resonatorNormalize: new widget.ToggleButtonLine(
    detailResonator, menuitems.resonatorNormalizeItems, param.resonatorNormalize, render),
  nResonator: new widget.NumberInput(detailResonator, "Count", param.nResonator, render),
  timeSpreadSeconds: new widget.NumberInput(
    detailResonator, "Time Spread [s]", param.timeSpreadSeconds, render),
  resonatorBandWidth: new widget.NumberInput(
    detailResonator, "Band Width", param.resonatorBandWidth, render),
  resonanceBaseHz: new widget.NumberInput(
    detailResonator, "Resonance Frequency [Hz]", param.resonanceBaseHz, render),
  resonanceRandom: new widget.NumberInput(
    detailResonator, "Resonance Random [oct]", param.resonanceRandom, render),
  resonanceEnvMod: new widget.NumberInput(
    detailResonator, "Resonance Envelope Mod [oct]", param.resonanceEnvMod, render),
  resonanceOscMod: new widget.NumberInput(
    detailResonator, "Resonance Osc. Mod [oct]", param.resonanceOscMod, render),
  envelopeDecaySeconds: new widget.NumberInput(
    detailResonator, "Envelope Decay [s]", param.envelopeDecaySeconds, render),
  envelopeTimeRandom: new widget.NumberInput(
    detailResonator, "Envelope Time Random", param.envelopeTimeRandom, render),
  realImaginaryMix:
    new widget.NumberInput(detailResonator, "Re/Im Mix", param.realImaginaryMix, render),

  reverbMix: new widget.NumberInput(detailReverb, "Mix [dB]", param.reverbMix, render),
  reverbBaseSecond:
    new widget.NumberInput(detailReverb, "Time Base [s]", param.reverbBaseSecond, render),
  reverbLowpassHz: new widget.NumberInput(
    detailReverb, "Lowpass Cutoff [Hz]", param.reverbLowpassHz, render),
  reverbFeedback:
    new widget.NumberInput(detailReverb, "Feedback", param.reverbFeedback, render),
};

render();
window.addEventListener("load", (ev) => { widget.refresh(ui); });
