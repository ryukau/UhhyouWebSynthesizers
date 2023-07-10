// Copyright 2022 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {palette, uiSize} from "../common/gui/palette.js";
import * as widget from "../common/gui/widget.js";
import * as parameter from "../common/parameter.js";
import * as util from "../common/util.js";
import * as wave from "../common/wave.js";

import {FormantXYPad} from "./formantxypad.js";
import * as menuitems from "./menuitems.js";

function randomize() {
  if (selectRandom.value === "Chord") {
    for (const key in param) {
      if (key === "nChord") {
        param[key].ui = Math.floor(1 + scales.nChord.maxUi * Math.random());
      } else if (key.includes("chordPitch")) {
        param[key].normalized = Math.random();
      }
    }
  } else { // "Default"
    for (const key in param) {
      if (key === "renderDuration") continue;
      if (key === "fade") continue;

      if (key === "baseFrequencyHz") {
        // param[key].dsp = util.uniformDistributionMap(Math.random(), 90, 1000);
        continue;
      }
      if (key === "phaseRandomAmount") continue;
      if (key === "pitchRandomOctave") continue;
      if (key === "lowpassPower") {
        param[key].dsp = util.uniformDistributionMap(Math.random(), 0, 2);
        continue;
      }
      // if (key === "highShelfHz") continue;
      // if (key === "highShelfGain") continue;
      if (key === "formantTracking") {
        param[key].dsp = util.uniformDistributionMap(Math.random(), 0, 0.6);
        continue;
      }
      if (key === "formantPower") {
        // param[key].dsp = util.uniformDistributionMap(Math.random(), 0.8, 1.3);
        // continue;
      }

      if (Array.isArray(param[key])) {
        param[key].forEach(e => { e.normalized = Math.random(); });
      } else if (param[key].scale instanceof parameter.MenuItemScale) {
        // Do nothing for now.
      } else {
        param[key].normalized = Math.random();
      }
    }
  }

  render();
  widget.refresh(ui);
}

function createArrayParameters(defaultDspValue, scale) {
  let arr = new Array(scales.nChord.max);
  for (let i = 0; i < arr.length; ++i) {
    arr[i] = new parameter.Parameter(defaultDspValue, scale, true);
  }
  return arr;
}

function createBezierEnvelopeParameters(x1 = 0.2, y1 = 0.2, x2 = 0.8, y2 = 0.8) {
  return [
    new parameter.Parameter(x1, scales.defaultScale),
    new parameter.Parameter(y1, scales.defaultScale),
    new parameter.Parameter(x2, scales.defaultScale),
    new parameter.Parameter(y2, scales.defaultScale),
  ];
}

function render() {
  audio.render(
    parameter.toMessage(param, {
      sampleRate: audio.audioContext.sampleRate,
      maxVocalType: scales.vocalType.maxDsp,
      fadeIn: param.fade.dsp,
      fadeOut: param.fade.dsp,
    }),
    "perChannel",
    togglebuttonQuickSave.state === 1,
  );
}

const scales = {
  defaultScale: new parameter.LinearScale(0, 1),

  renderDuration: new parameter.DecibelScale(-40, 40, false),
  fade: new parameter.DecibelScale(-60, 40, true),
  seed: new parameter.IntScale(0, 2 ** 53),

  baseFrequencyHz: new parameter.MidiPitchScale(0, 136, false),
  bandWidthOctave: new parameter.DecibelScale(-40, util.ampToDB(0.25), false),
  spectralFilterPower:
    new parameter.DecibelScale(util.ampToDB(0.01), util.ampToDB(8), true),
  highShelfHz: new parameter.MidiPitchScale(
    util.freqToMidiPitch(1000), util.freqToMidiPitch(24000), false),
  highShelfGain: new parameter.DecibelScale(-60, 0, true),

  nChord: new parameter.IntScale(0, 8),
  chordPitch: new parameter.DecibelScale(util.ampToDB(1), util.ampToDB(3), false),
  pitchRandomOctave: new parameter.LinearScale(0, 10),

  vocalType: new parameter.LinearScale(0, 4),
  formantPower: new parameter.LinearScale(0, 4),
  formantGainType: new parameter.MenuItemScale(menuitems.formantGainType),
};

const param = {
  renderDuration: new parameter.Parameter(2, scales.renderDuration, true),
  fade: new parameter.Parameter(0, scales.fade, true),
  seed: new parameter.Parameter(0, scales.seed),

  baseFrequencyHz: new parameter.Parameter(220, scales.baseFrequencyHz, true),
  bandWidthOctave: new parameter.Parameter(0.01, scales.bandWidthOctave, true),
  phaseRandomAmount: new parameter.Parameter(1, scales.defaultScale, true),
  highpassHz: new parameter.Parameter(1000, scales.baseFrequencyHz, true),
  highpassPower: new parameter.Parameter(1, scales.spectralFilterPower, true),
  lowpassHz: new parameter.Parameter(1000, scales.baseFrequencyHz, true),
  lowpassPower: new parameter.Parameter(1, scales.spectralFilterPower, true),
  highShelfHz:
    new parameter.Parameter(scales.highShelfHz.maxDsp, scales.highShelfHz, true),
  highShelfGain: new parameter.Parameter(1, scales.highShelfGain, false),

  nChord: new parameter.Parameter(4, scales.nChord, true),
  chordPitch1: new parameter.Parameter(1.25, scales.chordPitch, true),
  chordPitch2: new parameter.Parameter(1.5, scales.chordPitch, true),
  chordPitch3: new parameter.Parameter(1.225, scales.chordPitch, true),
  pitchRandomOctave: new parameter.Parameter(0, scales.pitchRandomOctave, true),

  formantX: new parameter.Parameter(0, scales.defaultScale),
  formantY: new parameter.Parameter(0, scales.defaultScale),
  formantGainType: new parameter.Parameter(0, scales.formantGainType),
  vocalType: new parameter.Parameter(0, scales.vocalType),
  formantTracking: new parameter.Parameter(0.3, scales.defaultScale),
  formantTrackingSlope: new parameter.Parameter(0, scales.defaultScale),
  formantPower: new parameter.Parameter(1, scales.formantPower),
  formantRandom: new parameter.Parameter(0, scales.defaultScale),
  vocalRandom: new parameter.Parameter(0, scales.defaultScale),
};

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

const divPlayControl = widget.div(divLeft, "playControl", undefined);
const selectRandom = widget.select(
  divPlayControl, "Randomize Recipe", "randomRecipe", undefined, ["Default", "Chord"],
  "Default", (ev) => { randomize(); });
const buttonRandom = widget.Button(divPlayControl, "Random", (ev) => { randomize(); });
buttonRandom.id = "randomRecipe";
const spanPlayControlFiller = widget.span(divPlayControl, "playControlFiller", undefined);
const buttonPlay = widget.Button(divPlayControl, "Play", (ev) => { audio.play(); });
const buttonStop = widget.Button(divPlayControl, "Stop", (ev) => { audio.stop(); });
const buttonSave = widget.Button(divPlayControl, "Save", (ev) => { audio.save(true); });
const togglebuttonQuickSave = new widget.ToggleButton(
  divPlayControl, "QuickSave", undefined, undefined, 0, (ev) => {});

const detailRender = widget.details(divLeft, "Render");
const detailOsc = widget.details(divLeft, "Oscillator");
const detailChord = widget.details(divRight, "Chord");
const detailFormant = widget.details(divRight, "Formant");

const ui = {
  renderDuration:
    new widget.NumberInput(detailRender, "Duration [s]", param.renderDuration, render),
  fade: new widget.NumberInput(detailRender, "Fade [s]", param.fade, render),
  seed: new widget.NumberInput(detailRender, "Seed", param.seed, render),

  baseFrequencyHz: new widget.NumberInput(
    detailOsc, "Base Frequency [Hz]", param.baseFrequencyHz, render),
  bandWidthOctave:
    new widget.NumberInput(detailOsc, "Band Width [oct]", param.bandWidthOctave, render),
  phaseRandomAmount:
    new widget.NumberInput(detailOsc, "Random Phase", param.phaseRandomAmount, render),
  highpassHz:
    new widget.NumberInput(detailOsc, "Highpass [Hz]", param.highpassHz, render),
  highpassPower:
    new widget.NumberInput(detailOsc, "Highpass Power", param.highpassPower, render),
  lowpassHz: new widget.NumberInput(detailOsc, "Lowpass [Hz]", param.lowpassHz, render),
  lowpassPower:
    new widget.NumberInput(detailOsc, "Lowpass Power", param.lowpassPower, render),
  highShelfHz:
    new widget.NumberInput(detailOsc, "High Shelf Cut [Hz]", param.highShelfHz, render),
  highShelfGain: new widget.NumberInput(
    detailOsc, "High Shelf Gain [dB]", param.highShelfGain, render),

  nChord: new widget.NumberInput(detailChord, "nChord", param.nChord, render),
  chordPitch1: new widget.NumberInput(detailChord, "Pitch 1", param.chordPitch1, render),
  chordPitch2: new widget.NumberInput(detailChord, "Pitch 2", param.chordPitch2, render),
  chordPitch3: new widget.NumberInput(detailChord, "Pitch 3", param.chordPitch3, render),
  pitchRandomOctave: new widget.NumberInput(
    detailChord, "Random Pitch [oct]", param.pitchRandomOctave, render),

  formant: new FormantXYPad(
    detailFormant, uiSize.waveViewWidth, uiSize.waveViewWidth, "Vowel", param.formantX,
    param.formantY, render),
  formantGainType:
    new widget.ComboBoxLine(detailFormant, "Gain Type", param.formantGainType, render),
  vocalType: new widget.NumberInput(detailFormant, "Vocal Type", param.vocalType, render),
  formantTracking: new widget.NumberInput(
    detailFormant, "Formant Tracking", param.formantTracking, render),
  formantTrackingSlope: new widget.NumberInput(
    detailFormant, "Formant Tracking Slope", param.formantTrackingSlope, render),
  formantPower:
    new widget.NumberInput(detailFormant, "Formant Power", param.formantPower, render),
  formantRandom:
    new widget.NumberInput(detailFormant, "Random Formant", param.formantRandom, render),
  vocalRandom:
    new widget.NumberInput(detailFormant, "Random Vocal", param.vocalRandom, render),
};

render();
