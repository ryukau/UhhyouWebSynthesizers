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
    negativeEnvelope: () => {},
    noteNumber: () => {},
    mainPwmAmount: () => {},
    chorusAM: () => {},
    limiterEnable: () => {},
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

  envelopeTimeSeconds: new parameter.DecibelScale(-40, 60, false),
  envelopeLevel: new parameter.LinearScale(0, 1),
  pitchEnvOctave: new parameter.DecibelScale(util.ampToDB(0.02), util.ampToDB(20), true),

  noteNumber: new parameter.MidiPitchScale(-24, 128, false),
  lfoRateHz: new parameter.DecibelScale(-40, 40, true),
  ratio: new parameter.LinearScale(0, 1),
  octave: new parameter.IntScale(-1, 3),

  chorusAM: new parameter.DecibelScale(-30, 0, true),
  chorusTimeSeconds:
    new parameter.DecibelScale(util.ampToDB(1e-4), util.ampToDB(0.2), true),
  chorusDelayCount: new parameter.IntScale(1, 8),

  limiterThreshold: new parameter.DecibelScale(-20, 20, false),
};

const param = {
  renderDuration: new parameter.Parameter(2, scales.renderDuration, true),
  fadeIn: new parameter.Parameter(0.0, scales.fade, true),
  fadeOut: new parameter.Parameter(0.002, scales.fade, true),
  decayTo: new parameter.Parameter(1, scales.decayTo, false),
  stereoMerge: new parameter.Parameter(0.5, scales.stereoMerge),
  overSample: new parameter.Parameter(2, scales.overSample),
  sampleRateScaler: new parameter.Parameter(0, scales.sampleRateScaler),
  toneSlope: new parameter.Parameter(1, scales.toneSlope, false),
  dcHighpassHz: new parameter.Parameter(16, scales.dcHighpassHz, true),

  negativeEnvelope: new parameter.Parameter(0, scales.boolean, true),
  attackTimeSeconds: new parameter.Parameter(0.1, scales.envelopeTimeSeconds, true),
  attackLevel: new parameter.Parameter(0.5, scales.envelopeLevel, true),
  decayTimeSeconds: new parameter.Parameter(1, scales.envelopeTimeSeconds, true),
  decayLevel: new parameter.Parameter(0, scales.envelopeLevel, true),
  pitchEnvOctave: new parameter.Parameter(1, scales.pitchEnvOctave, true),
  pwmLfoRateEnvOctave: new parameter.Parameter(1, scales.pitchEnvOctave, true),

  noteNumber: new parameter.Parameter(util.midiPitchToFreq(36), scales.noteNumber, false),
  pwmLfoRateHz: new parameter.Parameter(1.5, scales.lfoRateHz, true),
  mainPwmAmount: new parameter.Parameter(1, scales.ratio, true),
  subPwmAmount: new parameter.Parameter(0, scales.ratio, true),
  subExtraMix: new parameter.Parameter(0, scales.ratio, true),
  subOctave: new parameter.Parameter(0, scales.octave, true),
  pwmSawOctave: new parameter.Parameter(1, scales.octave, true),

  chorusMix: new parameter.Parameter(1, scales.ratio, true),
  chorusAM: new parameter.Parameter(0, scales.chorusAM, true),
  chorusTimeBaseSeconds: new parameter.Parameter(0.01, scales.chorusTimeSeconds, true),
  chorusTimeModSeconds: new parameter.Parameter(0.01, scales.chorusTimeSeconds, true),
  chorusDelayCount: new parameter.Parameter(1, scales.chorusDelayCount, true),
  chorusLfoSpread: new parameter.Parameter(1, scales.ratio, true),

  limiterEnable: new parameter.Parameter(0, scales.boolean, true),
  limiterThreshold: new parameter.Parameter(1, scales.limiterThreshold, false),
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
const detailLimiter = widget.details(divLeft, "Limiter");
const detailEnvelope = widget.details(divRightA, "Envelope");
const detailOscillator = widget.details(divRightA, "Oscillator");
const detailChorus = widget.details(divRightA, "Chorus");

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

  limiterEnable: new widget.ToggleButtonLine(
    detailLimiter, ["Off", "On"], param.limiterEnable, render),
  limiterThreshold: new widget.NumberInput(
    detailLimiter, "Threshold [dB]", param.limiterThreshold, render),

  negativeEnvelope: new widget.ToggleButtonLine(
    detailEnvelope, ["Positive", "Negative"], param.negativeEnvelope, render),
  attackTimeSeconds: new widget.NumberInput(
    detailEnvelope, "Attack Time [s]", param.attackTimeSeconds, render),
  attackLevel:
    new widget.NumberInput(detailEnvelope, "Attack Level", param.attackLevel, render),
  decayTimeSeconds: new widget.NumberInput(
    detailEnvelope, "Decay Time [s]", param.decayTimeSeconds, render),
  decayLevel:
    new widget.NumberInput(detailEnvelope, "Decay Level", param.decayLevel, render),
  pitchEnvOctave: new widget.NumberInput(
    detailEnvelope, "Env -> Pitch [oct]", param.pitchEnvOctave, render),
  pwmLfoRateEnvOctave: new widget.NumberInput(
    detailEnvelope, "Env -> PWM Rate [oct]", param.pwmLfoRateEnvOctave, render),

  noteNumber:
    new widget.NumberInput(detailOscillator, "Note Number", param.noteNumber, render),
  pwmLfoRateHz:
    new widget.NumberInput(detailOscillator, "PWM Rate [Hz]", param.pwmLfoRateHz, render),
  mainPwmAmount:
    new widget.NumberInput(detailOscillator, "Main PWM", param.mainPwmAmount, render),
  subPwmAmount:
    new widget.NumberInput(detailOscillator, "Sub PWM", param.subPwmAmount, render),
  subExtraMix:
    new widget.NumberInput(detailOscillator, "Sub Extra", param.subExtraMix, render),
  subOctave:
    new widget.NumberInput(detailOscillator, "Sub Pitch [oct]", param.subOctave, render),
  pwmSawOctave: new widget.NumberInput(
    detailOscillator, "PWM Saw Pitch [oct]", param.pwmSawOctave, render),

  chorusMix: new widget.NumberInput(detailChorus, "Mix", param.chorusMix, render),
  chorusAM: new widget.NumberInput(detailChorus, "AM", param.chorusAM, render),
  chorusTimeBaseSeconds: new widget.NumberInput(
    detailChorus, "Base Time [s]", param.chorusTimeBaseSeconds, render),
  chorusTimeModSeconds: new widget.NumberInput(
    detailChorus, "Mod Time [s]", param.chorusTimeModSeconds, render),
  chorusDelayCount:
    new widget.NumberInput(detailChorus, "Delay Count", param.chorusDelayCount, render),
  chorusLfoSpread:
    new widget.NumberInput(detailChorus, "LFO Spread", param.chorusLfoSpread, render),
};

render();
window.addEventListener("load", (ev) => { widget.refresh(ui); });
