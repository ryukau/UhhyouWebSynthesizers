// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {AudioFileManager} from "../common/audiofile.js";
import {sosFilterType} from "../common/dsp/sos.js";
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

const randomEq = (prm, lowHz, highHz, lowQ, highQ, lowDB, highDB) => {
  randomLoguniform(prm[1], lowHz, highHz);
  randomLoguniform(prm[2], lowQ, highQ);
  randomUniform(prm[3], lowDB, highDB);
};

const localRecipeBook = {
  "Default": (param) => {
    if (Math.random() < 0.5) param.feedback.dsp = -param.feedback.dsp;

    randomInt(param.excitationType, 0, 2);
    randomUniform(param.excitationShape, 0.0, 1.0);
    randomUniform(
      param.lpCutoffRelative, param.lpCutoffRelative.scale.minDsp,
      param.lpCutoffRelative.scale.maxDsp);

    randomUniform(param.excitationMix, 0.0, 1.0);
    randomFull(param.noiseSeed);
    randomLoguniform(param.noiseDecay, 0.05, 2);
    randomInt(param.noiseFilterType, 0, menuitems.noiseFilterItems.length - 1);
    randomUniform(param.noiseFilterQ, 0.5, 10.0);
    randomUniform(param.noiseFilterCutoffStart, 0, 96);
    randomUniform(param.noiseFilterCutoffEnd, -24, 48);

    const maxFFCombTapsLog2p1 = 1 + Math.round(Math.log2(scales.ffCombTaps.maxDsp));
    param.ffCombTaps.dsp = 2 ** Math.floor(Math.random() * maxFFCombTapsLog2p1);
    for (const p of param.ffCombPoint) randomUniform(p, 0.01, 0.99);
    for (const p of param.ffCombGain) randomFull(p);

    randomInt(param.phaserStage, 2, 32);
    randomUniform(param.phaserMix, 0.2, 1.0);
    randomUniform(param.phaserFeedback, -0.85, 0.85);
    randomUniform(param.phaserAllpassSpread, 0.0, 1.5);
    randomLoguniform(param.phaserAllpassCenterHz, 40.0, 3000.0);
    randomUniform(param.phaserModAmount, 0.1, 8.0);
    randomLoguniform(param.phaserModLowpassHz, 200.0, 8000.0);

    randomUniform(param.buzzerGain, -0.8, 0.8);
    randomUniform(param.buzzerFeedback, -0.8, 0.8);
    // randomUniform(param.buzzerMix, 0.0, 1.0);
    for (const p of param.buzzerDelaySeconds) randomFull(p);
    if (param.buzzerEq.length > 0) randomLoguniform(param.buzzerEq[0][1], 20, 80);
    if (param.buzzerEq.length > 1) randomEq(param.buzzerEq[1], 800, 2200, 0.7, 3.0, 10, 35);
  },
};

const scales = {
  boolean: new parameter.IntScale(0, 1),
  renderDuration: new parameter.DecibelScale(-40, 30, false),
  fade: new parameter.DecibelScale(-60, 40, true),
  decayTo: new parameter.DecibelScale(util.ampToDB(1 / 2 ** 24), 0, false),
  overSample: new parameter.MenuItemScale(menuitems.oversampleItems),
  sampleRateScaler: new parameter.MenuItemScale(menuitems.sampleRateScalerItems),

  tensionMod: new parameter.DecibelScale(-80, 0, true),

  fretAction: new parameter.DecibelScale(util.ampToDB(0.0002), util.ampToDB(2.0), false),
  fretActionDecay: new parameter.DecibelScale(-60, 40, true),
  fretActionTarget: new parameter.DecibelScale(util.ampToDB(0.0002), util.ampToDB(2.0), false),
  fretRestitution: new parameter.LinearScale(0.0, 1.0),
  fretCount: new parameter.IntScale(0, 24),
  slapPosition: new parameter.LinearScale(0.5, 0.95),
  pickupPosition: new parameter.LinearScale(0.05, 0.98),
  pickupDistance: new parameter.DecibelScale(util.ampToDB(0.001), util.ampToDB(10.0), false),

  buzzerMix: new parameter.DecibelScale(-60, 20, true),
  buzzerGain: new parameter.LinearScale(-0.99, 0.99),
  buzzerFeedback: new parameter.LinearScale(-1.99, 1.99),
  buzzerDelaySeconds: new parameter.DecibelScale(-80, 0, false),
  buzzerEqCutoff: new parameter.DecibelScale(util.ampToDB(5), util.ampToDB(1e5), false),
  buzzerEqQ: new parameter.DecibelScale(util.ampToDB(0.1), util.ampToDB(100), false),
  buzzerEqGain: new parameter.DecibelScale(-6, 6, true),
  buzzerEqFilterType: new parameter.MenuItemScale(Object.values(sosFilterType)),

  excitationGain: new parameter.DecibelScale(-40, 20, false),
  excitationType: new parameter.MenuItemScale(menuitems.excitationItems),
  excitationShape: new parameter.LinearScale(0.0, 1.0),
  excitationMix: new parameter.LinearScale(0.0, 1.0),

  noiseSeed: new parameter.IntScale(0, 2 ** 32 - 1),
  noiseDecay: new parameter.DecibelScale(-40, 40, false),
  noiseFilterType: new parameter.MenuItemScale(menuitems.noiseFilterItems),
  noiseFilterQ: new parameter.DecibelScale(-20, 40, false),
  noiseFilterCutoffRelative: new parameter.LinearScale(-48, 96),
  ffCombTaps: new parameter.IntScale(1, 64),
  ffCombPoint: new parameter.LinearScale(1e-4, 1.0),
  ffCombGain: new parameter.DecibelScale(-20, 0, true),

  notePitch: new parameter.MidiPitchScale(-24, 140, false),
  feedback: new parameter.SymmetricLogScale(1e-2, 1),
  dcHighpassCutoffRelative: new parameter.LinearScale(-60, 60),
  lpCutoffRelative: new parameter.LinearScale(0, 96),

  phaserStage: new parameter.IntScale(1, 64),
  phaserMix: new parameter.LinearScale(-1.0, 1.0),
  phaserFeedback: new parameter.LinearScale(-0.99, 0.99),
  phaserAllpassCenterHz: new parameter.DecibelScale(0.0, 100.0, false),
  phaserAllpassSpread: new parameter.LinearScale(0.0, 2.0),
  phaserModAmount: new parameter.DecibelScale(-60.0, 80.0, true),
  phaserModLowpassHz: new parameter.DecibelScale(-20.0, 100.0, false),
};

function createArrayParametersUniform(defaultDspValue, scale) {
  let arr = new Array(scales.ffCombTaps.max);
  for (let i = 0; i < arr.length; ++i) {
    arr[i] = new parameter.Parameter(defaultDspValue, scale, false);
  }
  return arr;
}

function createArrayParametersSequenced(step, scale) {
  let arr = new Array(scales.ffCombTaps.max);
  for (let i = 0; i < arr.length; ++i) {
    const value = ((i + 1) * step) % 1;
    arr[i] = new parameter.Parameter(Math.sqrt(value), scale, false);
  }
  return arr;
}

function createEqualizerParameters(filterType, cutoffHz, Q, gainDB) {
  const typeIndex = scales.buzzerEqFilterType.items.indexOf(filterType);
  if (typeIndex < 0) {
    console.warn(
      `createEqualizerParameters: Unknown filterType "${filterType}". Available types:`,
      scales.buzzerEqFilterType.items,
    );
  }
  return [
    new parameter.Parameter(
      typeIndex >= 0 ? typeIndex : 0, scales.buzzerEqFilterType, false, "filter-type"),
    new parameter.Parameter(cutoffHz, scales.buzzerEqCutoff, true, "cutoff-Hz"),
    new parameter.Parameter(Q, scales.buzzerEqQ, true, "Q"),
    new parameter.Parameter(util.dbToAmp(gainDB), scales.buzzerEqGain, false, "gain-dB"),
  ];
}

const param = {
  renderDuration: new parameter.Parameter(1, scales.renderDuration, true),
  fadeIn: new parameter.Parameter(0.002, scales.fade, true),
  fadeOut: new parameter.Parameter(0.05, scales.fade, true),
  decayTo: new parameter.Parameter(1, scales.decayTo, false),
  overSample: new parameter.Parameter(0, scales.overSample),
  sampleRateScaler: new parameter.Parameter(3, scales.sampleRateScaler),
  normalize: new parameter.Parameter(1, scales.boolean),
  integerPitch: new parameter.Parameter(0, scales.boolean),

  tensionMod: new parameter.Parameter(0.002, scales.tensionMod, true),

  bypassNoiseFilter: new parameter.Parameter(0, scales.boolean),
  bypassFFCombFilter: new parameter.Parameter(0, scales.boolean),
  bypassBassString: new parameter.Parameter(0, scales.boolean),
  bypassFeedbackPhaser: new parameter.Parameter(1, scales.boolean),
  bypassFretCollision: new parameter.Parameter(0, scales.boolean),
  bypassBuzzer: new parameter.Parameter(0, scales.boolean),

  fretAction: new parameter.Parameter(1, scales.fretAction, false),
  fretActionDecay: new parameter.Parameter(0.1, scales.fretActionDecay, true),
  fretActionTarget: new parameter.Parameter(util.dbToAmp(-20), scales.fretActionTarget, false),
  fretRestitution: new parameter.Parameter(0.75, scales.fretRestitution, false),
  fretCount: new parameter.Parameter(24, scales.fretCount),
  slapPosition: new parameter.Parameter(0.6, scales.slapPosition, false),
  pickupPosition: new parameter.Parameter(0.88, scales.pickupPosition, false),
  pickupDistance: new parameter.Parameter(0.3, scales.pickupDistance, true),

  buzzerMix: new parameter.Parameter(0.05, scales.buzzerMix, false),
  buzzerGain: new parameter.Parameter(0.5, scales.buzzerGain, false),
  buzzerFeedback: new parameter.Parameter(0.98, scales.buzzerFeedback, false),
  buzzerDelaySeconds: [
    new parameter.Parameter(0.001, scales.buzzerDelaySeconds, true),
    new parameter.Parameter(0.031, scales.buzzerDelaySeconds, true),
  ],
  buzzerEq: [
    createEqualizerParameters(sosFilterType.hp2bq, 100.0, Math.SQRT1_2, 0.0),
    createEqualizerParameters(sosFilterType.lp2bq, 4000.0, Math.SQRT1_2, 0.0),
  ],

  excitationGain: new parameter.Parameter(1, scales.excitationGain, false),
  excitationType: new parameter.Parameter(1, scales.excitationType),
  excitationShape: new parameter.Parameter(0.8, scales.excitationShape, false),
  excitationMix: new parameter.Parameter(0.7, scales.excitationMix, false),

  noiseSeed: new parameter.Parameter(0, scales.noiseSeed),
  noiseDecay: new parameter.Parameter(0.3, scales.noiseDecay, true),
  noiseFilterType: new parameter.Parameter(0, scales.noiseFilterType),
  noiseFilterQ: new parameter.Parameter(Math.SQRT1_2, scales.noiseFilterQ, true),
  noiseFilterCutoffStart: new parameter.Parameter(96, scales.noiseFilterCutoffRelative, false),
  noiseFilterCutoffEnd: new parameter.Parameter(0, scales.noiseFilterCutoffRelative, false),

  ffCombTaps: new parameter.Parameter(32, scales.ffCombTaps),
  ffCombPoint: createArrayParametersSequenced(0.022, scales.ffCombPoint),
  ffCombGain: createArrayParametersUniform(0.25, scales.ffCombGain),

  notePitch: new parameter.Parameter(util.midiPitchToFreq(36), scales.notePitch, false),
  feedback: new parameter.Parameter(0.95, scales.feedback, true),
  dcHighpassCutoffRelative: new parameter.Parameter(-24, scales.dcHighpassCutoffRelative, false),
  lpCutoffRelative: new parameter.Parameter(38.5, scales.lpCutoffRelative, false),

  phaserStage: new parameter.Parameter(16, scales.phaserStage),
  phaserMix: new parameter.Parameter(1.0, scales.phaserMix, false),
  phaserFeedback: new parameter.Parameter(0.5, scales.phaserFeedback, false),
  phaserAllpassCenterHz: new parameter.Parameter(100.0, scales.phaserAllpassCenterHz, true),
  phaserAllpassSpread: new parameter.Parameter(0.0, scales.phaserAllpassSpread, false),
  phaserModAmount: new parameter.Parameter(1.0, scales.phaserModAmount, true),
  phaserModLowpassHz: new parameter.Parameter(2000.0, scales.phaserModLowpassHz, true),
};

const audioFileManager = new AudioFileManager(1);

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

async function render() {
  const targetRate = audio.audioContext.sampleRate * getSampleRateScaler();
  ui.buzzerEq?.setSampleRate(targetRate);
  await audioFileManager.resample(targetRate);
  audio.render(
    parameter.toMessage(param, {
      sampleRate: targetRate,
      buzzerEq: ui.buzzerEq.toMessage(),
      ...audioFileManager.toMessage(),
    }),
    param.normalize.dsp ? "link" : "bypass",
    playControl.togglebuttonQuickSave.state === 1,
  );
}

const audio = new wave.Audio(
  2,
  "./renderer.js",
  undefined,
  (wave) => {
    for (let i = 0; i < waveView.length; ++i) { waveView[i].set(wave.data[i], wave.peakValue); }
  },
);

const pageTitle = widget.pageTitle(document.body);
const divMain = widget.div(document.body, "main", undefined);

const divColumn0 = widget.div(divMain, undefined, "controlBlock");
const divColumn1 = widget.div(divMain, undefined, "controlBlock");
const divColumn2 = widget.div(divMain, undefined, "controlBlock");
const divColumn3 = widget.div(divMain, undefined, "controlBlock");

const headingWaveform = widget.heading(divColumn0, 6, "Waveform");
const divWaveRow = widget.div(divColumn0, undefined, "viewRow");
const waveView = [
  new widget.WaveView(
    divWaveRow, uiSize.waveViewWidth, uiSize.waveViewHeight, audio.wave.data[0], false),
  new widget.WaveView(
    divWaveRow, uiSize.waveViewWidth, uiSize.waveViewHeight, audio.wave.data[1], false),
];

const pRenderStatus = widget.paragraph(divColumn0, "renderStatus", undefined);
audio.renderStatusElement = pRenderStatus;

const recipeExportDialog = new widget.RecipeExportDialog(document.body, (ev) => {
  parameter.downloadJson(param, version, recipeExportDialog.author, recipeExportDialog.recipeName);
});
const recipeImportDialog = new widget.RecipeImportDialog(document.body, (ev, data) => {
  const recipeName = parameter.addRecipe(param, recipeBook, data);
  if (recipeName) {
    widget.option(playControl.selectRandom, recipeName);
    playControl.selectRandom.value = recipeName;
    recipeBook.get(recipeName).randomize(param);
    onFFCombTapsChanged();
    widget.refresh(ui);
  }
});

const playControl = widget.playControl(
  divColumn0,
  (ev) => { audio.play(getSampleRateScaler()); },
  (ev) => { audio.stop(); },
  (ev) => { audio.save(false, [], getSampleRateScaler()); },
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
);

const detailRender = widget.details(divColumn0, "Render");
const detailString = widget.details(divColumn0, "String");
const detailPitch = widget.details(divColumn0, "Pitch");
const detailExcitation = widget.details(divColumn1, "Excitation");
const detailSlap = widget.details(divColumn2, "Slap & Frets");
const detailBuzzer = widget.details(divColumn2, "Buzzer");
const detailPhaser = widget.details(divColumn3, "Feedback Phaser");
const detailBypass = widget.details(divColumn3, "Bypass");

const audioLoader = new widget.AudioLoader(
  detailExcitation,
  "Audio File",
  async (data, name) => {
    await audioFileManager.setAudio(0, data, audio.audioContext.sampleRate * getSampleRateScaler());
    render();
  },
  () => {
    audioFileManager.clearAudio(0);
    render();
  },
);

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

  bypassNoiseFilter: new widget.ToggleButtonLine(
    detailBypass, ["Filter Bypass Off", "Filter Bypass On"], param.bypassNoiseFilter, render),
  bypassFFCombFilter: new widget.ToggleButtonLine(
    detailBypass, ["FF Comb Bypass Off", "FF Comb Bypass On"], param.bypassFFCombFilter, render),
  bypassBassString: new widget.ToggleButtonLine(
    detailBypass, ["String Bypass Off", "String Bypass On"], param.bypassBassString, render),
  bypassFeedbackPhaser: new widget.ToggleButtonLine(
    detailBypass, ["Phaser Bypass Off", "Phaser Bypass On"], param.bypassFeedbackPhaser, render),
  bypassFretCollision: new widget.ToggleButtonLine(
    detailBypass, ["Collision Bypass Off", "Collision Bypass On"], param.bypassFretCollision,
    render),
  bypassBuzzer: new widget.ToggleButtonLine(
    detailBypass, ["Buzzer Bypass Off", "Buzzer Bypass On"], param.bypassBuzzer, render),

  excitationGain:
    new widget.NumberInput(detailExcitation, "Gain [dB]", param.excitationGain, render),
  excitationType:
    new widget.ComboBoxLine(detailExcitation, "Pulse Type", param.excitationType, render),
  excitationShape:
    new widget.NumberInput(detailExcitation, "Pulse Shape", param.excitationShape, render),
  excitationMix:
    new widget.NumberInput(detailExcitation, "Mix (Pulse/Noise)", param.excitationMix, render),

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

  fretAction: new widget.NumberInput(detailSlap, "Action", param.fretAction, render),
  fretActionDecay:
    new widget.NumberInput(detailSlap, "Action Decay [s]", param.fretActionDecay, render),
  fretActionTarget:
    new widget.NumberInput(detailSlap, "Target Action Level", param.fretActionTarget, render),
  fretRestitution: new widget.NumberInput(detailSlap, "Restitution", param.fretRestitution, render),
  fretCount: new widget.NumberInput(detailSlap, "Fret Count", param.fretCount, render),
  slapPosition: new widget.NumberInput(detailSlap, "Strike Point", param.slapPosition, render),
  pickupPosition:
    new widget.NumberInput(detailSlap, "Pickup Position", param.pickupPosition, render),
  pickupDistance:
    new widget.NumberInput(detailSlap, "Pickup Distance [m]", param.pickupDistance, render),

  buzzerMix: new widget.NumberInput(detailBuzzer, "Mix [dB]", param.buzzerMix, render),
  buzzerGain: new widget.NumberInput(detailBuzzer, "Gain / Decay", param.buzzerGain, render),
  buzzerFeedback: new widget.NumberInput(detailBuzzer, "Feedback", param.buzzerFeedback, render),
  buzzerDelaySeconds: new widget.BarBox(
    detailBuzzer, "Delay [s]", uiSize.barboxWidth, uiSize.barboxHeight, param.buzzerDelaySeconds,
    render),
  buzzerEq: new widget.EqualizerXYPad(
    detailBuzzer,
    "Buzzer Resonances",
    uiSize.barboxWidth,
    uiSize.barboxHeight * 1.5,
    param.buzzerEq,
    render,
    {
      sampleRate: audio.audioContext.sampleRate,
      autoGain: "normalize",
      ceilingDB: 0.0,
    },
    ),

  notePitch: new widget.NumberInput(detailString, "Note Pitch", param.notePitch, render),
  feedback: new widget.NumberInput(detailString, "Feedback", param.feedback, render),
  dcHighpassCutoffRelative: new widget.NumberInput(
    detailString, "DC Highpass [st.]", param.dcHighpassCutoffRelative, render),
  lpCutoffRelative:
    new widget.NumberInput(detailString, "LP Cutoff [st.]", param.lpCutoffRelative, render),

  phaserStage: new widget.NumberInput(detailPhaser, "Stages", param.phaserStage, render),
  phaserMix: new widget.NumberInput(detailPhaser, "Mix", param.phaserMix, render),
  phaserFeedback: new widget.NumberInput(detailPhaser, "Feedback", param.phaserFeedback, render),
  phaserAllpassCenterHz:
    new widget.NumberInput(detailPhaser, "Center Freq [Hz]", param.phaserAllpassCenterHz, render),
  phaserAllpassSpread:
    new widget.NumberInput(detailPhaser, "Spread", param.phaserAllpassSpread, render),
  phaserModAmount:
    new widget.NumberInput(detailPhaser, "Mod Amount", param.phaserModAmount, render),
  phaserModLowpassHz:
    new widget.NumberInput(detailPhaser, "Mod Lowpass [Hz]", param.phaserModLowpassHz, render),
};

onFFCombTapsChanged();
window.addEventListener("load", (ev) => { widget.refresh(ui); });
