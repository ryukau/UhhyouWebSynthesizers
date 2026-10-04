// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {AudioFileManager} from "../common/audiofile.js";
import {uiSize} from "../common/gui/palette.js";
import * as widget from "../common/gui/widget.js";
import * as parameter from "../common/parameter.js";
import * as util from "../common/util.js";
import * as wave from "../common/wave.js";

import {GuitarChordSelector} from "./guitarchordselector.js";
import * as menuitems from "./menuitems.js";

const version = 2;

const randomUniform
  = (prm, low, high) => prm.randomize((p) => (p.dsp = util.randomUniformFloat(low, high)));
const randomInt
  = (prm, low, high) => prm.randomize((p) => (p.dsp = util.randomUniformInt(low, high)));
const randomLoguniform
  = (prm, low, high) => prm.randomize((p) => (p.dsp = util.randomLoguniform(low, high)));
const randomFull = (prm) => prm.randomize((p) => (p.normalized = Math.random()));

function randomizeChordDefault(param) {
  if (!param.chordFrets[0].lockRandomization) { ui?.chordSelector?.randomizeChord?.(); }

  for (const p of param.chordGains) { randomLoguniform(p, util.dbToAmp(-3), 1.0); }

  const scaleLength = 0.648;
  const stringSpacing = 0.0105;
  const basePickDist = util.randomUniformFloat(0.04, 0.24);
  const wristRadius = util.randomUniformFloat(0.10, 0.20);
  const strumAngle = util.randomUniformFloat(-25 * (Math.PI / 180), 25 * (Math.PI / 180));
  const arcSign = Math.random() < 0.5 ? 1 : -1;
  const numStrings = param.chordPickPositions.length;
  for (let i = 0; i < numStrings; ++i) {
    const y = (i - 0.5 * (numStrings - 1)) * stringSpacing;
    const dxAngle = y * Math.tan(strumAngle);
    const dxArc
      = arcSign * (wristRadius - Math.sqrt(Math.max(0, wristRadius * wristRadius - y * y)));
    const jitter = util.randomUniformFloat(-0.0015, 0.0015);

    const pickDist = basePickDist + dxAngle + dxArc + jitter;
    const pickPos = util.clamp(pickDist / scaleLength, 1e-3, 0.5);
    param.chordPickPositions[i].randomize((p) => (p.dsp = pickPos));
  }

  for (const p of param.chordFeedbacks) {
    p.randomize((x) => (x.dsp = util.randomLoguniform(0.9, 0.95)));
  }
  for (const p of param.chordLpCutoffs) { randomUniform(p, 60, 80); }

  const isUpstroke = Math.random() < 0.3;
  const isArpeggio = Math.random() < 0.15;
  const strumDuration = util.randomLoguniform(0.015, 0.16);
  const step = strumDuration / Math.max(1, param.chordDelays.length - 1);
  for (let i = 0; i < param.chordDelays.length; ++i) {
    let t;
    if (isArpeggio) {
      t = util.randomUniformFloat(0.0, strumDuration);
    } else {
      const order = isUpstroke ? (param.chordDelays.length - 1 - i) : i;
      const jitter = util.randomUniformFloat(-0.002, 0.002);
      t = Math.max(0, order * step + jitter);
    }
    param.chordDelays[i].randomize((p) => (p.dsp = Math.min(t, p.scale.maxDsp)));
  }
}

function randomizeExcitationDefault(param) {
  randomInt(param.excitationType, 0, 2);
  randomUniform(param.excitationShape, 0.0, 1.0);
  randomUniform(param.excitationMix, 0.0, 1.0);
  randomFull(param.noiseSeed);
  randomLoguniform(param.noiseDecay, 0.05, 2);
  randomInt(param.noiseFilterType, 0, menuitems.noiseFilterItems.length - 1);
  randomUniform(param.noiseFilterQ, 0.5, 10.0);
  randomUniform(param.noiseFilterCutoffStart, 0, 96);
  randomUniform(param.noiseFilterCutoffPeak, 0, 96);
  randomUniform(param.noiseFilterCutoffEnd, -24, 48);
  randomLoguniform(param.noiseFilterAttackTime, 0.01, 1.0);

  const maxFFCombTapsLog2p1 = 1 + Math.round(Math.log2(scales.ffCombTaps.maxDsp));
  param.ffCombTaps.dsp = 2 ** Math.floor(Math.random() * maxFFCombTapsLog2p1);
  for (const p of param.ffCombPoint) { randomUniform(p, 0.01, 0.99); }
  for (const p of param.ffCombGain) { randomFull(p); }

  randomUniform(param.pickCombTime, 0.05, 4.0);
  randomUniform(param.pickCombFB, 0.0, 0.8);
  randomInt(param.nFilter, 1, 16);
}

// Keep the comments in the recipes.
const localRecipeBook = {
  "Default": (param) => {
    randomLoguniform(param.attackNonlinearDamping, 0.01, 2.5);
    randomUniform(param.attackLpOpenCycles, 0.0, 2.5);
    randomUniform(param.attackFeedbackCycles, 0.0, 2.5);

    randomizeExcitationDefault(param);

    randomUniform(param.randomDetune, -1, 1);
    randomUniform(param.detuneBias, -1.0, 1.0);

    randomizeChordDefault(param);
  },
  "Chord": (param) => { randomizeChordDefault(param); },
  "Excitation": (param) => { randomizeExcitationDefault(param); },
  "Full": (param) => {
    randomFull(param.feedbackScalar);
    randomFull(param.lpCutoff);
    randomFull(param.dcHighpassCutoffRelative);
    randomFull(param.tensionMod);

    randomFull(param.attackNonlinearDamping);
    randomFull(param.attackLpOpenCycles);
    randomFull(param.attackFeedbackCycles);

    randomFull(param.excitationGain);
    randomFull(param.excitationType);
    randomFull(param.excitationShape);
    randomFull(param.excitationMix);

    randomFull(param.noiseSeed);
    randomFull(param.noiseDecay);
    randomFull(param.noiseFilterType);
    randomFull(param.noiseFilterQ);
    randomFull(param.noiseFilterCutoffStart);
    randomFull(param.noiseFilterCutoffPeak);
    randomFull(param.noiseFilterCutoffEnd);
    randomFull(param.noiseFilterAttackTime);

    randomFull(param.ffCombTaps);
    for (const p of param.ffCombPoint) { randomFull(p); }
    for (const p of param.ffCombGain) { randomFull(p); }

    randomFull(param.pickCombOn);
    randomFull(param.pickCombTime);
    randomFull(param.pickCombFB);
    randomFull(param.nFilter);

    randomFull(param.stereoNoise);
    randomFull(param.randomDetune);
    randomFull(param.detuneBias);

    randomFull(param.chordBass);
    randomFull(param.chordTuning);
    for (const p of param.chordFrets) { randomFull(p); }
    for (const p of param.chordMutes) { randomFull(p); }
    for (const p of param.chordGains) { randomFull(p); }
    for (const p of param.chordPickPositions) { randomFull(p); }
    for (const p of param.chordDelays) { randomFull(p); }
    for (const p of param.chordFeedbacks) { randomFull(p); }
    for (const p of param.chordLpCutoffs) { randomFull(p); }
  },
};

const scales = {
  boolean: new parameter.IntScale(0, 1),
  renderDuration: new parameter.DecibelScale(-40, 30, false),
  fade: new parameter.DecibelScale(-60, 40, true),
  decayTo: new parameter.DecibelScale(util.ampToDB(1 / 2 ** 24), 0, false),
  overSample: new parameter.MenuItemScale(menuitems.oversampleItems),
  sampleRateScaler: new parameter.MenuItemScale(menuitems.sampleRateScalerItems),
  normalize: new parameter.MenuItemScale(menuitems.normalizeItems),
  pickPositionMethod: new parameter.MenuItemScale(menuitems.pickPositionMethodItems),

  feedbackScalar: new parameter.DecibelScale(-60, 0, true),
  lpCutoff: new parameter.LinearScale(-60, 60),
  dcHighpassCutoffRelative: new parameter.LinearScale(-60, 60),
  tensionMod: new parameter.DecibelScale(-80, 0, true),

  attackNonlinearDamping: new parameter.DecibelScale(-40, 20, true),
  attackLpOpenCycles: new parameter.DecibelScale(-40, 20, true),
  attackFeedbackCycles: new parameter.DecibelScale(-20, 20, true),

  excitationGain: new parameter.DecibelScale(-40, 20, false),
  excitationType: new parameter.MenuItemScale(menuitems.excitationItems),
  excitationShape: new parameter.LinearScale(0.0, 1.0),
  excitationMix: new parameter.LinearScale(0.0, 1.0),

  noiseSeed: new parameter.IntScale(0, 2 ** 32 - 1),
  noiseDecay: new parameter.DecibelScale(-40, 40, false),
  noiseFilterType: new parameter.MenuItemScale(menuitems.noiseFilterItems),
  noiseFilterQ: new parameter.DecibelScale(-20, 40, false),
  noiseFilterCutoffRelative: new parameter.LinearScale(-48, 96),
  noiseFilterAttackTime: new parameter.DecibelScale(-60, 40, true),

  ffCombTaps: new parameter.IntScale(1, 64),
  ffCombPoint: new parameter.LinearScale(1e-4, 1.0),
  ffCombGain: new parameter.DecibelScale(-20, 0, true),

  pickCombTime: new parameter.DecibelScale(-40, 20, true),
  pickCombFB: new parameter.LinearScale(-1, 1),
  nFilter: new parameter.IntScale(1, 16),

  randomDetune: new parameter.LinearScale(-200, 200),
  detuneBias: new parameter.LinearScale(-1, 1),

  chordBass: new parameter.MidiPitchScale(-24, 140, false),
  chordTuning: new parameter.MenuItemScale(menuitems.chordTuningItems),
  chordFret: new parameter.IntScale(0, 5),
  chordMute: new parameter.IntScale(0, 1),
  chordGain: new parameter.DecibelScale(-40, 0, true),
  pickPosition: new parameter.LinearScale(0.0, 0.5),
  chordDelay: new parameter.LinearScale(0.0, 0.2),
  feedback: new parameter.SymmetricLogScale(1e-2, 1),
  lpCutoffRelative: new parameter.LinearScale(0, 96),
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
    arr[i] = new parameter.Parameter(((i + 1) * step) % 1, scale, false);
  }
  return arr;
}

function createChordParameters(defaultValues, scale, commentPrefix, displayDsp = false) {
  return defaultValues.map(
    (val,
     i) => new parameter.Parameter(val, scale, displayDsp, `${commentPrefix} String ${6 - i}`));
}

const param = {
  renderDuration: new parameter.Parameter(1, scales.renderDuration, true),
  fadeIn: new parameter.Parameter(0.002, scales.fade, true),
  fadeOut: new parameter.Parameter(0.05, scales.fade, true),
  decayTo: new parameter.Parameter(1, scales.decayTo, false),
  overSample: new parameter.Parameter(0, scales.overSample),
  sampleRateScaler: new parameter.Parameter(3, scales.sampleRateScaler),
  normalize: new parameter.Parameter(1, scales.normalize),
  pickPositionMethod: new parameter.Parameter(2, scales.pickPositionMethod),
  integerPitch: new parameter.Parameter(0, scales.boolean),

  feedbackScalar: new parameter.Parameter(1.0, scales.feedbackScalar, true),
  lpCutoff: new parameter.Parameter(0, scales.lpCutoff, false),
  dcHighpassCutoffRelative: new parameter.Parameter(-12, scales.dcHighpassCutoffRelative, false),
  tensionMod: new parameter.Parameter(0.0, scales.tensionMod, true),

  attackNonlinearDamping: new parameter.Parameter(0.0, scales.attackNonlinearDamping, true),
  attackLpOpenCycles: new parameter.Parameter(0.0, scales.attackLpOpenCycles, true),
  attackFeedbackCycles: new parameter.Parameter(0.0, scales.attackFeedbackCycles, true),

  excitationGain: new parameter.Parameter(1, scales.excitationGain, false),
  excitationType: new parameter.Parameter(1, scales.excitationType),
  excitationShape: new parameter.Parameter(0.25, scales.excitationShape, false),
  excitationMix: new parameter.Parameter(0.5, scales.excitationMix, false),

  noiseSeed: new parameter.Parameter(0, scales.noiseSeed),
  noiseDecay: new parameter.Parameter(1.0, scales.noiseDecay, true),
  noiseFilterType: new parameter.Parameter(1, scales.noiseFilterType),
  noiseFilterQ: new parameter.Parameter(Math.SQRT1_2, scales.noiseFilterQ, true),
  noiseFilterCutoffStart: new parameter.Parameter(48, scales.noiseFilterCutoffRelative, false),
  noiseFilterCutoffPeak: new parameter.Parameter(48, scales.noiseFilterCutoffRelative, false),
  noiseFilterCutoffEnd: new parameter.Parameter(0, scales.noiseFilterCutoffRelative, false),
  noiseFilterAttackTime: new parameter.Parameter(0.0, scales.noiseFilterAttackTime, true),

  ffCombTaps: new parameter.Parameter(32, scales.ffCombTaps),
  ffCombPoint: createArrayParametersSequenced(0.1234, scales.ffCombPoint),
  ffCombGain: createArrayParametersUniform(0.125, scales.ffCombGain),

  pickCombOn: new parameter.Parameter(0, scales.boolean),
  pickCombTime: new parameter.Parameter(1.0, scales.pickCombTime, true),
  pickCombFB: new parameter.Parameter(0.3, scales.pickCombFB, false),
  nFilter: new parameter.Parameter(8, scales.nFilter),

  stereoNoise: new parameter.Parameter(1, scales.boolean),
  randomDetune: new parameter.Parameter(0, scales.randomDetune, false),
  detuneBias: new parameter.Parameter(0, scales.detuneBias, false),

  chordBass:
    new parameter.Parameter(util.midiPitchToFreq(40), scales.chordBass, false, "Chord Bass"),
  chordTuning: new parameter.Parameter(0, scales.chordTuning),
  chordFrets: createChordParameters([0, 2, 2, 1, 0, 0], scales.chordFret, "Fret"),
  chordMutes: createChordParameters([0, 0, 0, 0, 0, 0], scales.chordMute, "Mute"),
  chordGains: createChordParameters([1, 1, 1, 1, 1, 1], scales.chordGain, "Gain"),
  chordPickPositions:
    createChordParameters([0.2, 0.2, 0.2, 0.2, 0.2, 0.2], scales.pickPosition, "Pick Position"),
  chordDelays:
    createChordParameters([0.0, 0.008, 0.016, 0.024, 0.032, 0.040], scales.chordDelay, "Delay"),
  chordFeedbacks:
    createChordParameters([0.95, 0.95, 0.95, 0.95, 0.95, 0.95], scales.feedback, "Feedback", true),
  chordLpCutoffs:
    createChordParameters([72, 72, 72, 72, 72, 72], scales.lpCutoffRelative, "LP Cutoff"),
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
  await audioFileManager.resample(targetRate);
  audio.render(
    parameter.toMessage(param, {
      sampleRate: targetRate,
      ...audioFileManager.toMessage(),
      chord: ui.chordSelector?.dsp ?? [],
    }),
    ["bypass", "link", "perChannel"][param.normalize.dsp],
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
const detailStereo = widget.details(divColumn0, "Stereo");
const detailString = widget.details(divColumn1, "String");
const detailAttack = widget.details(divColumn1, "Attack");
const detailExcitation = widget.details(divColumn1, "Excitation");
const detailChord = widget.details(divColumn2, "Guitar Chord Voicing");

const ui = {
  renderDuration: new widget.NumberInput(detailRender, "Length [s]", param.renderDuration, render),
  fadeIn: new widget.NumberInput(detailRender, "Declick In [s]", param.fadeIn, render),
  fadeOut: new widget.NumberInput(detailRender, "Declick Out [s]", param.fadeOut, render),
  decayTo: new widget.NumberInput(detailRender, "Decay To [dB]", param.decayTo, render),
  overSample: new widget.ComboBoxLine(detailRender, "Oversampling", param.overSample, render),
  sampleRateScaler:
    new widget.ComboBoxLine(detailRender, "Sample Rate Scale", param.sampleRateScaler, render),
  normalize: new widget.ComboBoxLine(detailRender, "Normalization", param.normalize, render),
  pickPositionMethod:
    new widget.ComboBoxLine(detailRender, "Pick Pos. Method", param.pickPositionMethod, render),
  integerPitch: new widget.ToggleButtonLine(
    detailRender, ["Integer Pitch Off", "Integer Pitch On"], param.integerPitch, render),

  feedbackScalar:
    new widget.NumberInput(detailString, "Feedback Scalar", param.feedbackScalar, render),
  lpCutoff: new widget.NumberInput(detailString, "LP Cutoff [st.]", param.lpCutoff, render),
  dcHighpassCutoffRelative: new widget.NumberInput(
    detailString, "DC Highpass [st.]", param.dcHighpassCutoffRelative, render),
  tensionMod: new widget.NumberInput(detailString, "Tension Mod", param.tensionMod, render),

  attackNonlinearDamping:
    new widget.NumberInput(detailAttack, "Nonlinear Damping", param.attackNonlinearDamping, render),
  attackLpOpenCycles:
    new widget.NumberInput(detailAttack, "LP Open [cycle]", param.attackLpOpenCycles, render),
  attackFeedbackCycles: new widget.NumberInput(
    detailAttack, "Feedback Open [cycle]", param.attackFeedbackCycles, render),

  excitationGain:
    new widget.NumberInput(detailExcitation, "Gain [dB]", param.excitationGain, render),

  stereoNoise: new widget.ToggleButtonLine(
    detailStereo, ["Stereo Noise Off", "Stereo Noise On"], param.stereoNoise, render),
  randomDetune:
    new widget.NumberInput(detailStereo, "Random Detune [cent]", param.randomDetune, render),
  detuneBias: new widget.NumberInput(detailStereo, "Detune Bias", param.detuneBias, render),

  chordSelector: new GuitarChordSelector(
    detailChord,
    "Guitar Voicing & Strum",
    {
      bass: param.chordBass,
      tuning: param.chordTuning,
      frets: param.chordFrets,
      mutes: param.chordMutes,
      gains: param.chordGains,
      pickPositions: param.chordPickPositions,
      delays: param.chordDelays,
      feedbacks: param.chordFeedbacks,
      lpCutoffs: param.chordLpCutoffs,
    },
    render,
    uiSize.barboxWidth,
    ),
};

ui.tabExcitation = new widget.TabView(detailExcitation, "excitationTab", [
  (parent) => {
    const audioLoader = new widget.AudioLoader(
      parent,
      "Audio File",
      async (data, name) => {
        await audioFileManager.setAudio(
          0, data, audio.audioContext.sampleRate * getSampleRateScaler());
        render();
      },
      () => {
        audioFileManager.clearAudio(0);
        render();
      },
    );
    ui.excitationType = new widget.ComboBoxLine(parent, "Pulse Type", param.excitationType, render);
    ui.excitationShape
      = new widget.NumberInput(parent, "Pulse Shape", param.excitationShape, render);
    ui.excitationMix
      = new widget.NumberInput(detailExcitation, "Mix (Pulse/Noise)", param.excitationMix, render);
    ui.noiseSeed = new widget.NumberInput(parent, "Noise Seed", param.noiseSeed, render);
    ui.noiseDecay = new widget.NumberInput(parent, "Noise Decay", param.noiseDecay, render);
    ui.noiseFilterType
      = new widget.ComboBoxLine(parent, "Noise Filter Type", param.noiseFilterType, render);
    ui.noiseFilterQ = new widget.NumberInput(parent, "Noise Filter Q", param.noiseFilterQ, render);
    ui.noiseFilterCutoffStart = new widget.NumberInput(
      parent, "Filter Cutoff Start [st.]", param.noiseFilterCutoffStart, render);
    ui.noiseFilterCutoffPeak = new widget.NumberInput(
      parent, "Filter Cutoff Peak [st.]", param.noiseFilterCutoffPeak, render);
    ui.noiseFilterCutoffEnd = new widget.NumberInput(
      parent, "Filter Cutoff End [st.]", param.noiseFilterCutoffEnd, render);
    ui.noiseFilterAttackTime = new widget.NumberInput(
      parent, "Filter Attack Time [cycle]", param.noiseFilterAttackTime, render);
    return {
      index: 0,
      label: "Pulse/Noise",
      widgets: {
        audioLoader,
        excitationType: ui.excitationType,
        excitationShape: ui.excitationShape,
        excitationMix: ui.excitationMix,
        noiseSeed: ui.noiseSeed,
        noiseDecay: ui.noiseDecay,
        noiseFilterType: ui.noiseFilterType,
        noiseFilterQ: ui.noiseFilterQ,
        noiseFilterCutoffStart: ui.noiseFilterCutoffStart,
        noiseFilterCutoffPeak: ui.noiseFilterCutoffPeak,
        noiseFilterCutoffEnd: ui.noiseFilterCutoffEnd,
        noiseFilterAttackTime: ui.noiseFilterAttackTime,
      },
    };
  },
  (parent) => {
    ui.ffCombTaps
      = new widget.NumberInput(parent, "FF Comb Taps", param.ffCombTaps, onFFCombTapsChanged);
    ui.ffCombPoint = new widget.BarBox(
      parent, "FF Comb Point [ratio]", uiSize.barboxWidth, uiSize.barboxHeight, param.ffCombPoint,
      render);
    ui.ffCombGain = new widget.BarBox(
      parent, "FF Comb Gain [dB]", uiSize.barboxWidth, uiSize.barboxHeight, param.ffCombGain,
      render);
    return {
      index: 1,
      label: "Feed-forward Comb",
      widgets: {
        ffCombTaps: ui.ffCombTaps,
        ffCombPoint: ui.ffCombPoint,
        ffCombGain: ui.ffCombGain,
      },
    };
  },
  (parent) => {
    ui.pickCombOn = new widget.ToggleButtonLine(
      parent, ["Extra Comb Off", "Extra Comb On"], param.pickCombOn, render);
    ui.excitationCombBypass = ui.pickCombOn;
    ui.pickCombTime = new widget.NumberInput(parent, "Time [ratio]", param.pickCombTime, render);
    ui.pickCombFB = new widget.NumberInput(parent, "Feedback", param.pickCombFB, render);
    ui.nFilter = new widget.NumberInput(parent, "Stages", param.nFilter, render);
    return {
      index: 2,
      label: "Extra Comb",
      widgets: {
        pickCombOn: ui.pickCombOn,
        excitationCombBypass: ui.excitationCombBypass,
        pickCombTime: ui.pickCombTime,
        pickCombFB: ui.pickCombFB,
        nFilter: ui.nFilter,
      },
    };
  },
]);

onFFCombTapsChanged();
window.addEventListener("load", (ev) => { widget.refresh(ui); });
