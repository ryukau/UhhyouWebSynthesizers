// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {uiSize} from "../common/gui/palette.js";
import * as widget from "../common/gui/widget.js";
import * as parameter from "../common/parameter.js";
import * as util from "../common/util.js";
import * as wave from "../common/wave.js";

import * as menuitems from "./menuitems.js";

const version = 0;

const randomUniform
  = (prm, low, high) => prm.randomize((p) => (p.dsp = util.randomUniformFloat(low, high)));
const randomInt
  = (prm, low, high) => prm.randomize((p) => (p.dsp = util.randomUniformInt(low, high)));
const randomLoguniform
  = (prm, low, high) => prm.randomize((p) => (p.dsp = util.randomLoguniform(low, high)));
const randomLogInt
  = (prm, low, high) => prm.randomize((p) => (p.dsp = util.randomLoguniformInt(low, high)));
const randomFull = (prm) => prm.randomize((p) => (p.normalized = Math.random()));

function randomizeDefault(param) {
  if (Math.random() < 0.5) param.feedback.dsp = -param.feedback.dsp;

  randomLoguniform(param.nonlinearDamping, 0.01, 2.5);

  randomUniform(
    param.lpCutoffRelative, param.lpCutoffRelative.scale.minDsp,
    param.lpCutoffRelative.scale.maxDsp);
  randomUniform(
    param.apCutoffRelative, param.apCutoffRelative.scale.minDsp,
    param.apCutoffRelative.scale.maxDsp);
  randomUniform(param.apQ, 0.5, 5.0);

  randomFull(param.noiseSeed);
  randomLoguniform(param.noiseDecay, 0.05, 2);
  randomInt(param.noiseFilterType, 0, menuitems.noiseFilterItems.length);
  randomUniform(param.noiseFilterQ, 0.5, 10.0);
  randomUniform(param.noiseFilterCutoffStart, 0, 96);
  randomUniform(param.noiseFilterCutoffEnd, -24, 48);

  randomUniform(param.pickPosition, 0.01, 0.5);

  const maxFFCombTapsLog2p1 = 1 + Math.round(Math.log2(scales.ffCombTaps.maxDsp));
  param.ffCombTaps.dsp = 2 ** Math.floor(Math.random() * maxFFCombTapsLog2p1);
  for (const p of param.ffCombPoint) randomUniform(p, 0.01, 0.99);
  for (const p of param.ffCombGain) randomFull(p);

  randomUniform(param.subRatio, 4.0, 20.0);
  randomUniform(param.subFeedback, 0.7, 0.98);
  randomLoguniform(param.subNonlinearDamping, 0.01, 2.5);
  randomUniform(param.subLpCutoffRelative, 0.0, 60.0);
  randomUniform(param.subDirectExcitation, 0.0, 0.5);
  randomUniform(param.subCoupling, 0.0, 0.3);
  randomUniform(param.subBridgeCoupling, 0.0, 0.2);
  randomUniform(param.subMix, 0.0, 0.5);
}

const localRecipeBook = {
  "Default": (param) => { randomizeDefault(param); },
  "Modulation": (param) => {
    randomizeDefault(param);
    randomUniform(param.tensionMod, 0, 1);
    randomInt(param.nAllpass, 0, 16);
    randomInt(param.apModSource, 0, scales.apModSource.maxDsp);
    randomUniform(param.apModAmount, scales.apModAmount.minDsp, scales.apModAmount.maxDsp);
  },
};

const scales = {
  boolean: new parameter.IntScale(0, 1),
  renderDuration: new parameter.DecibelScale(-40, 30, false),
  fade: new parameter.DecibelScale(-60, 40, true),
  decayTo: new parameter.DecibelScale(util.ampToDB(1 / 2 ** 24), 0, false),
  overSample: new parameter.MenuItemScale(menuitems.oversampleItems),
  sampleRateScaler: new parameter.MenuItemScale(menuitems.sampleRateScalerItems),
  dcHighpassCutoffRelative: new parameter.LinearScale(-60, 60),

  excitationGain: new parameter.DecibelScale(-40, 20, false),

  pickPosition: new parameter.LinearScale(0.0, 0.5),

  noiseSeed: new parameter.IntScale(0, 2 ** 32 - 1),
  noiseDecay: new parameter.DecibelScale(-40, 40, false),
  noiseFilterType: new parameter.MenuItemScale(menuitems.noiseFilterItems),
  noiseFilterQ: new parameter.DecibelScale(-20, 40, false),
  noiseFilterCutoffRelative: new parameter.LinearScale(-48, 96),
  ffCombTaps: new parameter.IntScale(1, 64),
  ffCombPoint: new parameter.LinearScale(1e-4, 1.0),
  ffCombGain: new parameter.DecibelScale(-20, 0, true),

  notePitch: new parameter.MidiPitchScale(-24, 140, false),
  lpCutoffRelative: new parameter.LinearScale(0, 96),
  apCutoffRelative: new parameter.LinearScale(-48, 48),
  apQ: new parameter.DecibelScale(-20, 40, false),
  apModSource: new parameter.MenuItemScale(menuitems.apModSourceItems),
  apModAmount: new parameter.LinearScale(-48.0, 48.0),
  nAllpass: new parameter.IntScale(0, 80),
  feedback: new parameter.LinearScale(-1.0, 1.0),
  nonlinearDamping: new parameter.DecibelScale(-40, 20, true),

  tensionMod: new parameter.LinearScale(0.0, 1.0),

  subRatio: new parameter.LinearScale(0.1, 40.0),
  subFeedback: new parameter.LinearScale(-1.0, 1.0),
  subLpCutoffRelative: new parameter.LinearScale(-24, 96),
  subDirectExcitation: new parameter.LinearScale(0.0, 1.0),
  subCoupling: new parameter.LinearScale(0.0, 1.0),
  subBridgeCoupling: new parameter.LinearScale(0.0, 1.0),
  subMix: new parameter.LinearScale(0.0, 1.0),
};

function createArrayParameters(defaultDspValue, scale) {
  let arr = new Array(scales.ffCombTaps.max);
  for (let i = 0; i < arr.length; ++i) {
    arr[i] = new parameter.Parameter(defaultDspValue, scale, false);
  }
  return arr;
}

const param = {
  renderDuration: new parameter.Parameter(1, scales.renderDuration, true),
  fadeIn: new parameter.Parameter(0.002, scales.fade, true),
  fadeOut: new parameter.Parameter(0.05, scales.fade, true),
  decayTo: new parameter.Parameter(1, scales.decayTo, false),
  normalize: new parameter.Parameter(1, scales.boolean),
  overSample: new parameter.Parameter(0, scales.overSample),
  sampleRateScaler: new parameter.Parameter(3, scales.sampleRateScaler),
  integerPitch: new parameter.Parameter(0, scales.boolean),

  excitationGain: new parameter.Parameter(1, scales.excitationGain, false),
  pickPosition: new parameter.Parameter(0.2, scales.pickPosition, false),
  noiseSeed: new parameter.Parameter(0, scales.noiseSeed),
  noiseDecay: new parameter.Parameter(1.0, scales.noiseDecay, true),
  noiseFilterType: new parameter.Parameter(0, scales.noiseFilterType),
  noiseFilterQ: new parameter.Parameter(Math.SQRT1_2, scales.noiseFilterQ, true),
  noiseFilterCutoffStart: new parameter.Parameter(48, scales.noiseFilterCutoffRelative, false),
  noiseFilterCutoffEnd: new parameter.Parameter(0, scales.noiseFilterCutoffRelative, false),

  ffCombTaps: new parameter.Parameter(32, scales.ffCombTaps),
  ffCombPoint: createArrayParameters(0.2, scales.ffCombPoint),
  ffCombGain: createArrayParameters(1.0, scales.ffCombGain),

  notePitch: new parameter.Parameter(util.midiPitchToFreq(60), scales.notePitch, false),
  feedback: new parameter.Parameter(0.95, scales.feedback, false),
  nonlinearDamping: new parameter.Parameter(0.0, scales.nonlinearDamping, true),
  dcHighpassCutoffRelative: new parameter.Parameter(-60, scales.dcHighpassCutoffRelative, false),
  lpCutoffRelative: new parameter.Parameter(55, scales.lpCutoffRelative, false),
  nAllpass: new parameter.Parameter(0, scales.nAllpass, false),
  apCutoffRelative: new parameter.Parameter(12, scales.apCutoffRelative, false),
  apQ: new parameter.Parameter(Math.SQRT1_2, scales.apQ, true),
  apModSource: new parameter.Parameter(0, scales.apModSource),
  apModAmount: new parameter.Parameter(0.0, scales.apModAmount, false),

  tensionMod: new parameter.Parameter(0.0, scales.tensionMod, false),

  subRatio: new parameter.Parameter(10.0, scales.subRatio, true),
  subFeedback: new parameter.Parameter(0.92, scales.subFeedback, false),
  subNonlinearDamping: new parameter.Parameter(0.0, scales.nonlinearDamping, true),
  subLpCutoffRelative: new parameter.Parameter(24.0, scales.subLpCutoffRelative, false),
  subDirectExcitation: new parameter.Parameter(0.2, scales.subDirectExcitation, false),
  subCoupling: new parameter.Parameter(0.1, scales.subCoupling, false),
  subBridgeCoupling: new parameter.Parameter(0.0, scales.subBridgeCoupling, false),
  subMix: new parameter.Parameter(0.2, scales.subMix, false),
};

const recipeBook = parameter.addLocalRecipes(localRecipeBook);
await parameter.loadJson(param, recipeBook, []);

function getSampleRateScaler() {
  return parseInt(menuitems.sampleRateScalerItems[param.sampleRateScaler.dsp]);
}

function onFFCombTapsChanged() {
  ui.ffCombPoint.setViewRange(0, param.ffCombTaps.dsp);
  ui.ffCombGain.setViewRange(0, param.ffCombTaps.dsp);
  render();
}

function render() {
  const targetRate = audio.audioContext.sampleRate * getSampleRateScaler();
  audio.render(
    parameter.toMessage(param, {
      sampleRate: targetRate,
    }),
    param.normalize.dsp ? "link" : "bypass",
    playControl.togglebuttonQuickSave.state === 1,
  );
}

const audio = new wave.Audio(2, "./renderer.js");

const pageTitle = widget.pageTitle(document.body);
const divMain = widget.div(document.body, "main", undefined);

const divLeft = widget.div(divMain, undefined, "controlBlock");
const divMid = widget.div(divMain, undefined, "controlBlock");
const divRight = widget.div(divMain, undefined, "controlBlock");

const headingWaveform = widget.heading(divLeft, 6, "Waveform");
const divWaveRow = widget.div(divLeft, undefined, "viewRow");
const waveView = [
  new widget.WaveView(
    divWaveRow, uiSize.waveViewWidth, uiSize.waveViewHeight, audio.wave.data[0], false),
  new widget.WaveView(
    divWaveRow, uiSize.waveViewWidth, uiSize.waveViewHeight, audio.wave.data[1], false),
];

audio.addEventListener("renderfinish", (event) => {
  const wave = event.detail;
  for (let i = 0; i < waveView.length; ++i) { waveView[i].set(wave.data[i], wave.peakValue); }
});

const pRenderStatus = widget.paragraph(divLeft, "renderStatus", undefined);
audio.renderStatusElement = pRenderStatus;

const recipeExportDialog = new widget.RecipeExportDialog(document.body, (ev) => {
  parameter.downloadJson(param, version, recipeExportDialog.author, recipeExportDialog.recipeName);
});
const recipeImportDialog = new widget.RecipeImportDialog(document.body, (ev, data) => {
  const recipeName = parameter.addRecipe(param, recipeBook, data);
  if (recipeName) {
    widget.option(playControl.selectRandom, recipeName);
    playControl.selectRandom.value = recipeName;
    const runImport = () => {
      recipeBook.get(recipeName).setParameters(param);
      onFFCombTapsChanged();
      widget.refresh(ui);
    };
    if (playControl.historyManager) {
      playControl.historyManager.transaction(`Import: ${recipeName}`, runImport);
    } else {
      runImport();
    }
  }
});

const playControl = widget.playControl(
  divLeft,
  (ev) => { audio.play(getSampleRateScaler()); },
  (ev) => { audio.stop(); },
  (ev) => {
    audio.save(
      false, [], getSampleRateScaler(),
      parameter.dumpJsonString(param, version, {recipeName: util.getTimeStamp()}));
  },
  (ev) => {},
  (ev) => {
    recipeBook.get(playControl.selectRandom.value).randomize(param);
    onFFCombTapsChanged();
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
  param,
  () => {
    onFFCombTapsChanged();
    widget.refresh(ui);
    render();
  },
);

const detailRender = widget.details(divLeft, "Render");
const detailPitch = widget.details(divLeft, "Pitch");
const detailExcitation = widget.details(divMid, "Excitation");
const detailMainPath = widget.details(divRight, "Main Path");
const detailSubPath = widget.details(divRight, "Sub Path");

const ui = {
  renderDuration: new widget.NumberInput(detailRender, "Length [s]", param.renderDuration, render),
  fadeIn: new widget.NumberInput(detailRender, "Declick In [s]", param.fadeIn, render),
  fadeOut: new widget.NumberInput(detailRender, "Declick Out [s]", param.fadeOut, render),
  decayTo: new widget.NumberInput(detailRender, "Decay To [dB]", param.decayTo, render),
  overSample: new widget.ComboBoxLine(detailRender, "Oversampling", param.overSample, render),
  sampleRateScaler:
    new widget.ComboBoxLine(detailRender, "Sample Rate Scale", param.sampleRateScaler, render),
  normalize: new widget.ToggleButtonLine(
    detailRender, ["Normalize Off", "Normalize On"], param.normalize, render),
  integerPitch: new widget.ToggleButtonLine(
    detailRender, ["Integer Pitch Off", "Integer Pitch On"], param.integerPitch, render),

  tensionMod: new widget.NumberInput(detailPitch, "Tension Mod", param.tensionMod, render),

  excitationGain:
    new widget.NumberInput(detailExcitation, "Gain [dB]", param.excitationGain, render),

  pickPosition:
    new widget.NumberInput(detailExcitation, "Pick Position [ratio]", param.pickPosition, render),

  noiseSeed: new widget.NumberInput(detailExcitation, "Noise Seed", param.noiseSeed, render),
  noiseDecay: new widget.NumberInput(detailExcitation, "Noise Decay", param.noiseDecay, render),
  noiseFilterType:
    new widget.ComboBoxLine(detailExcitation, "Noise Filter Type", param.noiseFilterType, render),
  noiseFilterQ:
    new widget.NumberInput(detailExcitation, "Noise Filter Q", param.noiseFilterQ, render),
  noiseFilterCutoffStart: new widget.NumberInput(
    detailExcitation, "Filter Cutoff Start [st.]", param.noiseFilterCutoffStart, render),
  noiseFilterCutoffEnd: new widget.NumberInput(
    detailExcitation, "Filter Cutoff End [st.]", param.noiseFilterCutoffEnd, render),

  ffCombTaps:
    new widget.NumberInput(detailExcitation, "FF Comb Taps", param.ffCombTaps, onFFCombTapsChanged),
  ffCombPoint: new widget.BarBox(
    detailExcitation, "FF Comb Point [ratio]", uiSize.barboxWidth, uiSize.barboxHeight,
    param.ffCombPoint, render),
  ffCombGain: new widget.BarBox(
    detailExcitation, "FF Comb Gain [dB]", uiSize.barboxWidth, uiSize.barboxHeight,
    param.ffCombGain, render),

  notePitch: new widget.NumberInput(detailMainPath, "Note Pitch", param.notePitch, render),
  feedback: new widget.NumberInput(detailMainPath, "Feedback", param.feedback, render),
  nonlinearDamping:
    new widget.NumberInput(detailMainPath, "Attack Damping", param.nonlinearDamping, render),
  dcHighpassCutoffRelative: new widget.NumberInput(
    detailMainPath, "DC Highpass [st.]", param.dcHighpassCutoffRelative, render),

  lpCutoffRelative:
    new widget.NumberInput(detailMainPath, "LP Cutoff [st.]", param.lpCutoffRelative, render),
  nAllpass: new widget.NumberInput(detailMainPath, "nAllpass", param.nAllpass, render),
  apCutoffRelative:
    new widget.NumberInput(detailMainPath, "AP Cutoff [st.]", param.apCutoffRelative, render),
  apQ: new widget.NumberInput(detailMainPath, "AP Q", param.apQ, render),
  apModAmount: new widget.NumberInput(detailMainPath, "AP Mod [st.]", param.apModAmount, render),
  apModSource: new widget.ComboBoxLine(detailMainPath, "AP Mod Source", param.apModSource, render),

  subRatio: new widget.NumberInput(detailSubPath, "Freq Ratio", param.subRatio, render),
  subFeedback: new widget.NumberInput(detailSubPath, "Feedback", param.subFeedback, render),
  subNonlinearDamping:
    new widget.NumberInput(detailSubPath, "Attack Damping", param.subNonlinearDamping, render),
  subLpCutoffRelative:
    new widget.NumberInput(detailSubPath, "LP Cutoff [st.]", param.subLpCutoffRelative, render),
  subDirectExcitation:
    new widget.NumberInput(detailSubPath, "Direct Excitation", param.subDirectExcitation, render),
  subCoupling: new widget.NumberInput(detailSubPath, "Main Coupling", param.subCoupling, render),
  subBridgeCoupling:
    new widget.NumberInput(detailSubPath, "Bridge Coupling", param.subBridgeCoupling, render),
  subMix: new widget.NumberInput(detailSubPath, "Mix", param.subMix, render),
};

onFFCombTapsChanged();
window.addEventListener("load", (ev) => { widget.refresh(ui); });
