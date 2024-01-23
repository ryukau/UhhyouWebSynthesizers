// Copyright 2023 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {uiSize} from "../common/gui/palette.js";
import * as widget from "../common/gui/widget.js";
import * as parameter from "../common/parameter.js";
import * as util from "../common/util.js";
import * as wave from "../common/wave.js";

import * as menuitems from "./menuitems.js";
import {WaveformXYPad} from "./waveformxypad.js";

const version = 0;

const localRecipeBook = {
  "Default": {
    renderDurationBeat: () => {},
    tempoBpm: () => {},
    fadeIn: () => {},
    fadeOut: () => {},
    decayTo: () => {},
    overSample: () => {},
    sampleRateScaler: () => {},
    oscOctave: () => {},
    oscSync: () => {},
    frequencyHz: () => {},
    pitchScale: () => {},
    equalTemperament: () => {},
    pitchDriftCent: () => {},
    arpeggioDecayTo: () => {},
    arpeggioRestChance: () => {},
    chordChance: () => {},
  },
};

function getSampleRateScaler() {
  return parseInt(menuitems.sampleRateScalerItems[param.sampleRateScaler.dsp]);
}

function render() {
  audio.render(
    parameter.toMessage(param, {
      sampleRate: audio.audioContext.sampleRate * getSampleRateScaler(),
      a: ui.waveform.coefficients(),
    }),
    "perChannel",
    playControl.togglebuttonQuickSave.state === 1,
  );
}

const scales = {
  boolean: new parameter.IntScale(0, 1),

  tempoBpm: new parameter.LinearScale(0, 1024),
  renderDurationBeat: new parameter.IntScale(1, 128),
  fade: new parameter.DecibelScale(-60, 40, true),
  decayTo: new parameter.DecibelScale(util.ampToDB(1 / 2 ** 24), 0, false),
  overSample: new parameter.MenuItemScale(menuitems.oversampleItems),
  sampleRateScaler: new parameter.MenuItemScale(menuitems.sampleRateScalerItems),

  seed: new parameter.IntScale(0, 2 ** 32),
  frequencyHz: new parameter.DecibelScale(util.ampToDB(20), util.ampToDB(20000), false),
  oscOctave: new parameter.IntScale(-16, 16),
  oscSync: new parameter.LinearScale(0, 1),
  fmIndex: new parameter.DecibelScale(-60, 40, true),

  arpeggioDecayTo: new parameter.DecibelScale(-60, 0, false),
  arpeggioDurationVariation: new parameter.IntScale(1, 4),
  arpeggioRestChance: new parameter.LinearScale(0, 1),
  equalTemperament: new parameter.IntScale(1, 24),
  pitchScale: new parameter.MenuItemScale(menuitems.pitchScaleItems),
  pitchDriftCent: new parameter.LinearScale(0, 100),
  pitchVariation: new parameter.IntScale(0, 16),
  pitchOctaveWrap: new parameter.IntScale(1, 8),

  chordNoteCount: new parameter.IntScale(1, 32),
  chordChance: new parameter.LinearScale(0, 1),
  chordMaxOvertone: new parameter.IntScale(2, 64),
};

const param = {
  tempoBpm: new parameter.Parameter(187.5, scales.tempoBpm, true),
  renderDurationBeat: new parameter.Parameter(4, scales.renderDurationBeat, true),
  fadeIn: new parameter.Parameter(0, scales.fade, true),
  fadeOut: new parameter.Parameter(0.002, scales.fade, true),
  decayTo: new parameter.Parameter(1, scales.decayTo, false),
  overSample: new parameter.Parameter(0, scales.overSample),
  sampleRateScaler: new parameter.Parameter(0, scales.sampleRateScaler),

  seed: new parameter.Parameter(0, scales.seed, true),
  frequencyHz: new parameter.Parameter(160, scales.frequencyHz, true),
  oscOctave: new parameter.Parameter(0, scales.oscOctave, true),
  oscSync: new parameter.Parameter(1, scales.oscSync, true),
  fmIndex: new parameter.Parameter(0, scales.fmIndex, true),

  arpeggioDecayTo: new parameter.Parameter(1, scales.arpeggioDecayTo, false),
  arpeggioDurationVariation:
    new parameter.Parameter(1, scales.arpeggioDurationVariation, true),
  arpeggioRestChance: new parameter.Parameter(0, scales.arpeggioRestChance, false),
  equalTemperament: new parameter.Parameter(5, scales.equalTemperament, true),
  pitchScale: new parameter.Parameter(0, scales.pitchScale),
  pitchDriftCent: new parameter.Parameter(25, scales.pitchDriftCent),
  pitchVariation: new parameter.Parameter(0, scales.pitchVariation),
  pitchOctaveWrap: new parameter.Parameter(2, scales.pitchOctaveWrap),

  chordNoteCount: new parameter.Parameter(3, scales.chordNoteCount),
  chordChance: new parameter.Parameter(0.5, scales.chordChance),
  chordMaxOvertone: new parameter.Parameter(32, scales.chordMaxOvertone, false),
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
const divRight = widget.div(divMain, undefined, "controlBlock");

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
const detailOsc = widget.details(divLeft, "Oscillator");
const detailWaveform = widget.details(divRight, "Waveform");
const detailArpeggio = widget.details(divRight, "Arpeggio");
const detailChord = widget.details(divRight, "Overtone Chord");

const ui = {
  renderDurationBeat: new widget.NumberInput(
    detailRender, "Duration [beat]", param.renderDurationBeat, render),
  tempoBpm:
    new widget.NumberInput(detailRender, "Tempo [beat/min]", param.tempoBpm, render),
  fadeIn: new widget.NumberInput(detailRender, "Fade-in [s]", param.fadeIn, render),
  fadeOut: new widget.NumberInput(detailRender, "Fade-out [s]", param.fadeOut, render),
  decayTo: new widget.NumberInput(detailRender, "Decay To [dB]", param.decayTo, render),
  overSample:
    new widget.ComboBoxLine(detailRender, "Over-sample", param.overSample, render),
  sampleRateScaler: new widget.ComboBoxLine(
    detailRender, "Sample Rate Scale", param.sampleRateScaler, render),

  seed: new widget.NumberInput(detailOsc, "Seed", param.seed, render),
  frequencyHz:
    new widget.NumberInput(detailOsc, "Frequency [Hz]", param.frequencyHz, render),
  oscOctave: new widget.NumberInput(detailOsc, "Octave", param.oscOctave, render),
  oscSync: new widget.NumberInput(detailOsc, "Sync.", param.oscSync, render),
  fmIndex: new widget.NumberInput(detailOsc, "FM Index", param.fmIndex, render),

  waveform: new WaveformXYPad(
    detailWaveform, 2 * uiSize.waveViewWidth, 2 * uiSize.waveViewHeight, "Waveform", 13,
    render),

  arpeggioDecayTo: new widget.NumberInput(
    detailArpeggio, "Decay To [dB]", param.arpeggioDecayTo, render),
  arpeggioDurationVariation: new widget.NumberInput(
    detailArpeggio, "Duration Variation", param.arpeggioDurationVariation, render),
  arpeggioRestChance: new widget.NumberInput(
    detailArpeggio, "Rest Chance", param.arpeggioRestChance, render),
  equalTemperament: new widget.NumberInput(
    detailArpeggio, "Equal Temperament", param.equalTemperament, render),
  pitchScale: new widget.ComboBoxLine(detailArpeggio, "Scale", param.pitchScale, render),
  pitchDriftCent: new widget.NumberInput(
    detailArpeggio, "Pitch Drift [cent]", param.pitchDriftCent, render),
  pitchVariation: new widget.NumberInput(
    detailArpeggio, "Pitch Variation", param.pitchVariation, render),
  pitchOctaveWrap: new widget.NumberInput(
    detailArpeggio, "Pitch Wrap [oct]", param.pitchOctaveWrap, render),

  chordNoteCount:
    new widget.NumberInput(detailChord, "Note Count", param.chordNoteCount, render),
  chordChance: new widget.NumberInput(detailChord, "Chance", param.chordChance, render),
  chordMaxOvertone:
    new widget.NumberInput(detailChord, "Max Overtone", param.chordMaxOvertone, render),
};

render();
window.addEventListener("load", (ev) => { widget.refresh(ui); });
