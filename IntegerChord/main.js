// Copyright Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {justIntonationTable} from "../common/dsp/tuning.js"
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
    noteDecayT60: () => {},
    stereoMerge: () => {},
    dcHighpassHz: () => {},
    overSample: () => {},
    sampleRateScaler: () => {},

    limiterEnable: () => {},
    limiterThreshold: () => {},
    limiterAttackSeconds: () => {},

    frequencyHz: () => {},
    oscOctave: () => {},

    useFilter: () => {},
    filterType: (prm) => {/*prm.normalized = Math.random();*/},
    filterCascade: () => {},
    // filterResonance: () => {},
    // filterCutoffOctave: () => {},
    // filterRiseOctave: () => {},
    // filterCutoffDecayT60: () => {},
    // filterCutoffKeyFollow: () => {},

    chordGainSlope: () => {},
    chordNotes: (prm) => {
      const presetScales = [
        [0, 4, 8, 9, 18, 20, 24],  // [0, 2, 4, 5, 7, 9, 11].
        [0, 5, 7, 9, 18, 20, 22],  // [0, 2, 3, 5, 7, 9, 10].
        [0, 1, 7, 9, 18, 19, 22],  // [0, 1, 3, 5, 7, 8, 10].
        [0, 4, 8, 10, 18, 20, 24], // [0, 2, 4, 6, 7, 9, 11].
        [0, 4, 8, 9, 18, 20, 21],  // [0, 2, 4, 5, 7, 9, 10].
        [0, 5, 7, 9, 18, 19, 22],  // [0, 2, 3, 5, 7, 8, 10].
        [0, 1, 7, 9, 14, 19, 22],  // [0, 1, 3, 5, 6, 8, 10].
      ];
      let chord = presetScales[Math.floor(Math.random() * presetScales.length)];

      // `nRemove` must be a separate variable. `chord.length` changes in the loop below.
      const targetLength = Math.floor(Math.random() * chord.length) + 1;
      const nRemove = chord.length - targetLength;
      for (let i = 0; i < nRemove; ++i) {
        const removeIndex = Math.floor(Math.random() * chord.length);
        chord.splice(removeIndex, 1);
      }

      for (let idx = 0; idx < prm.length; ++idx) {
        prm[idx].dsp = chord.includes(idx) ? 1 : 0;
      }
    },
  },
};

function createArrayParameters(defaultDspValues, size, scale) {
  let arr = new Array(size);
  for (let i = 0; i < arr.length; ++i) {
    arr[i] = new parameter.Parameter(defaultDspValues[i], scale, true);
  }
  return arr;
}

function getSampleRateScaler() {
  return parseInt(menuitems.sampleRateScalerItems[param.sampleRateScaler.dsp]);
}

function render() {
  audio.render(
    parameter.toMessage(param, {
      sampleRate: audio.audioContext.sampleRate * getSampleRateScaler(),
      polynomial: ui.waveform.coefficients(false),
    }),
    "perChannel",
    playControl.togglebuttonQuickSave.state === 1,
  );
}

const scales = {
  boolean: new parameter.IntScale(0, 1),

  renderDuration: new parameter.DecibelScale(-40, 40, false),
  fade: new parameter.DecibelScale(-60, 40, true),
  stereoMerge: new parameter.LinearScale(0, 1),
  dcHighpassHz: new parameter.DecibelScale(-20, 40, true),
  overSample: new parameter.MenuItemScale(menuitems.oversampleItems),
  sampleRateScaler: new parameter.MenuItemScale(menuitems.sampleRateScalerItems),

  limiterThreshold: new parameter.DecibelScale(-60, 40, false),
  limiterAttackSeconds: new parameter.DecibelScale(-100, -40, false),

  seed: new parameter.IntScale(0, 2 ** 32),
  frequencyHz: new parameter.DecibelScale(util.ampToDB(20), util.ampToDB(20000), false),
  oscOctave: new parameter.IntScale(-16, 16),
  fmIndex: new parameter.DecibelScale(-60, 40, true),
  distortionGain: new parameter.DecibelScale(0, 60, false),

  filterType: new parameter.MenuItemScale(menuitems.filterTypeItems),
  filterCascade: new parameter.IntScale(1, 16),
  cutoffHz: new parameter.DecibelScale(util.ampToDB(0), util.ampToDB(20000), true),
  filterOctave: new parameter.LinearScale(-4, 16),
  resonance: new parameter.LinearScale(0, 1),
  filterCutoffDecayCurve: new parameter.LinearScale(0, 1),
  keyFollow: new parameter.LinearScale(0, 1),

  arpeggioDirection: new parameter.MenuItemScale(menuitems.arpeggioDirectionItems),
  chordMaxOctave: new parameter.IntScale(0, 8),
  chordPhaseOffset: new parameter.LinearScale(-1, 1),
  chordRandomStartSeconds: new parameter.DecibelScale(-80, 0, true),
  chordGainSlope: new parameter.DecibelScale(-12, 12, false),
};

const param = {
  renderDuration: new parameter.Parameter(2, scales.renderDuration, true),
  fadeIn: new parameter.Parameter(0, scales.fade, true),
  fadeOut: new parameter.Parameter(0.002, scales.fade, true),
  noteDecayT60: new parameter.Parameter(2, scales.renderDuration, true),
  stereoMerge: new parameter.Parameter(0, scales.stereoMerge),
  dcHighpassHz: new parameter.Parameter(0, scales.dcHighpassHz, true),
  overSample: new parameter.Parameter(0, scales.overSample),
  sampleRateScaler: new parameter.Parameter(1, scales.sampleRateScaler),

  limiterEnable: new parameter.Parameter(0, scales.boolean),
  limiterThreshold: new parameter.Parameter(1, scales.limiterThreshold, false),
  limiterAttackSeconds: new parameter.Parameter(0.01, scales.limiterAttackSeconds, true),

  seed: new parameter.Parameter(0, scales.seed, true),
  frequencyHz: new parameter.Parameter(40, scales.frequencyHz, true),
  oscOctave: new parameter.Parameter(0, scales.oscOctave, true),
  fmIndex: new parameter.Parameter(0, scales.fmIndex, true),

  saturationGain: new parameter.Parameter(util.dbToAmp(0), scales.distortionGain, true),

  filterType: new parameter.Parameter(1, scales.filterType),
  filterCascade: new parameter.Parameter(1, scales.filterCascade, true),
  filterResonance: new parameter.Parameter(0.7, scales.resonance, true),
  filterCutoffOctave: new parameter.Parameter(6, scales.filterOctave, true),
  filterCutoffDecayT60: new parameter.Parameter(2, scales.renderDuration, true),
  filterCutoffDecayCurve: new parameter.Parameter(0, scales.filterCutoffDecayCurve, true),
  filterCutoffKeyFollow: new parameter.Parameter(0.5, scales.keyFollow, true),

  arpeggioDirection: new parameter.Parameter(0, scales.arpeggioDirection),
  chordMaxOctave: new parameter.Parameter(3, scales.chordMaxOctave),
  chordPhaseOffset: new parameter.Parameter(1, scales.chordPhaseOffset),
  chordRandomStartSeconds:
    new parameter.Parameter(0, scales.chordRandomStartSeconds, true),
  chordGainSlope: new parameter.Parameter(1, scales.chordGainSlope),
  chordNotes: createArrayParameters(
    [
      1, // 0
      0, // 1
      0, // 1 (7-limit)
      0, // 1 (17-limit)
      0, // 2 Pairs with 9.
      0, // 2 Pairs with 7.
      1, // 2 (7 or 17-limit)
      0, // 3
      1, // 4
      1, // 5
      0, // 6 aug. Pairs with 11.
      0, // 6 aug. Pairs with 11.
      0, // 6 aug. (7-limit)
      0, // 6 aug. (17-limit)
      0, // 6 dim. Pairs with 1.
      0, // 6 dim. Pairs with 1.
      0, // 6 dim. (7-limit)
      0, // 6 dim. (17-limit)
      1, // 7
      0, // 8
      1, // 9
      0, // 10 Pairs with 5.
      0, // 10 Pairs with 3.
      0, // 10 (7 or 17-limit)
      0, // 11
      1, // 11 (17-limit)
    ],
    justIntonationTable.length, scales.boolean),
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
    ui.waveform.randomize(); // Specific to this synth.
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
const detailOsc = widget.details(divRightA, "Oscillator");
const detailFilter = widget.details(divRightA, "Filter");
const detailChord = widget.details(divRightB, "Chord");

const ui = {
  renderDuration:
    new widget.NumberInput(detailRender, "Duration [s]", param.renderDuration, render),
  fadeIn: new widget.NumberInput(detailRender, "Fade-in [s]", param.fadeIn, render),
  fadeOut: new widget.NumberInput(detailRender, "Fade-out [s]", param.fadeOut, render),
  noteDecayT60: new widget.NumberInput(
    detailRender, "Time at -60 dB [s]", param.noteDecayT60, render),
  stereoMerge:
    new widget.NumberInput(detailRender, "Stereo Merge", param.stereoMerge, render),
  dcHighpassHz:
    new widget.NumberInput(detailRender, "DC Highpass [Hz]", param.dcHighpassHz, render),
  overSample:
    new widget.ComboBoxLine(detailRender, "Over-sample", param.overSample, render),
  sampleRateScaler: new widget.ComboBoxLine(
    detailRender, "Sample Rate Scale", param.sampleRateScaler, render),

  limiterEnable: new widget.ToggleButtonLine(
    detailLimiter, ["Off", "On"], param.limiterEnable, render),
  limiterThreshold: new widget.NumberInput(
    detailLimiter, "Threshold [dB]", param.limiterThreshold, render),
  limiterAttackSeconds: new widget.NumberInput(
    detailLimiter, "Attack [s]", param.limiterAttackSeconds, render),

  waveform: new widget.WaveformXYPad(
    detailOsc, "Waveform", 2 * uiSize.waveViewWidth, 2 * uiSize.waveViewHeight, 23,
    render),
  seed: new widget.NumberInput(detailOsc, "Seed", param.seed, render),
  frequencyHz:
    new widget.NumberInput(detailOsc, "Frequency [Hz]", param.frequencyHz, render),
  oscOctave: new widget.NumberInput(detailOsc, "Octave", param.oscOctave, render),
  fmIndex: new widget.NumberInput(detailOsc, "FM Index", param.fmIndex, render),
  saturationGain: new widget.NumberInput(
    detailOsc, "Saturation Gain [dB]", param.saturationGain, render),

  filterType: new widget.ComboBoxLine(detailFilter, "Type", param.filterType, render),
  filterCascade:
    new widget.NumberInput(detailFilter, "nCascade", param.filterCascade, render),
  filterResonance:
    new widget.NumberInput(detailFilter, "Resonance", param.filterResonance, render),
  filterCutoffOctave: new widget.NumberInput(
    detailFilter, "Cutoff [oct]", param.filterCutoffOctave, render),
  filterCutoffDecayT60: new widget.NumberInput(
    detailFilter, "Time at -60 dB [s]", param.filterCutoffDecayT60, render),
  filterCutoffDecayCurve: new widget.NumberInput(
    detailFilter, "Decay Curve", param.filterCutoffDecayCurve, render),
  filterCutoffKeyFollow: new widget.NumberInput(
    detailFilter, "Key Follow", param.filterCutoffKeyFollow, render),

  arpeggioDirection: new widget.ComboBoxLine(
    detailChord, "Arpeggio Direction", param.arpeggioDirection, render),
  chordMaxOctave:
    new widget.NumberInput(detailChord, "Max Octave", param.chordMaxOctave, render),
  chordPhaseOffset:
    new widget.NumberInput(detailChord, "Phase Offset", param.chordPhaseOffset, render),
  chordRandomStartSeconds: new widget.NumberInput(
    detailChord, "Random Start [s]", param.chordRandomStartSeconds, render),
  chordGainSlope: new widget.NumberInput(
    detailChord, "Chord: Gain [dB/oct]", param.chordGainSlope, render),
  chordNotes: new widget.MultiCheckBoxVertical(
    detailChord, "Notes in Scale (Just Intonation, Semitone)",
    [
      " 1 / 1  ,  0",
      "16 / 15 ,  1",
      "15 / 14 ,  1 (7-limit)",
      "14 / 13 ,  1 (17-limit)",
      "10 / 9  ,  2 Pairs with 9.",
      " 9 / 8  ,  2 Pairs with 7.",
      " 8 / 7  ,  2 (7 or 17-limit)",
      " 6 / 5  ,  3",
      " 5 / 4  ,  4",
      " 4 / 3  ,  5",
      "45 / 32 ,  6 aug. Pairs with 11.",
      "25 / 18 ,  6 aug. Pairs with 11.",
      " 7 / 5  ,  6 aug. (7-limit)",
      "17 / 12 ,  6 aug. (17-limit)",
      "64 / 45 ,  6 dim. Pairs with 1.",
      "36 / 25 ,  6 dim. Pairs with 1.",
      "10 / 7  ,  6 dim. (7-limit)",
      "24 / 17 ,  6 dim. (17-limit)",
      " 3 / 2  ,  7",
      " 8 / 5  ,  8",
      " 5 / 3  ,  9",
      "16 / 9  ,  10 Pairs with 5.",
      " 9 / 5  ,  10 Pairs with 3.",
      " 7 / 4  ,  10 (7 or 17-limit)",
      "15 / 8  ,  11",
      "13 / 7  ,  11 (17-limit)",
    ],
    2 * uiSize.waveViewWidth, param.chordNotes, render),
};

ui.waveform.setControlPoints("sawtooth");

render();
window.addEventListener("load", (ev) => { widget.refresh(ui); });
