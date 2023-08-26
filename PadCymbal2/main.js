// Copyright 2022 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {uiSize} from "../common/gui/palette.js";
import * as widget from "../common/gui/widget.js";
import * as parameter from "../common/parameter.js";
import * as util from "../common/util.js";
import * as wave from "../common/wave.js";

import * as menuitems from "./menuitems.js";

function randomize() {
  for (const key in param) {
    if (key === "renderDuration") continue;
    if (key === "matrixSize") continue;
    if (key === "fadeOut") continue;
    if (key === "outputDecayTo") continue;
    if (key === "overSample") continue;
    if (key === "sampleRateScaler") continue;
    if (key === "attackSecond") continue;
    if (key === "stereoRandom") continue;
    if (key === "padMix") continue;
    if (key === "lowpassHz") continue;
    if (key === "lowpassQ") continue;
    if (key === "highpassHz") continue;
    if (key === "highpassQ") continue;

    if (Array.isArray(param[key])) {
      param[key].forEach(e => { e.normalized = Math.random(); });
    } else if (param[key].scale instanceof parameter.MenuItemScale) {
      // Do nothing for now.
    } else {
      param[key].normalized = Math.random();
    }
  }

  render();
  widget.refresh(ui);
}

function getSampleRateScaler() {
  return parseInt(menuitems.sampleRateScalerItems[param.sampleRateScaler.dsp]);
}

function render() {
  audio.render(
    parameter.toMessage(param, {
      sampleRate: audio.audioContext.sampleRate * getSampleRateScaler(),
    }),
    "perChannel",
    togglebuttonQuickSave.state === 1,
  );
}

const scales = {
  defaultScale: new parameter.LinearScale(0, 1),

  renderDuration: new parameter.DecibelScale(-40, 40, false),
  fade: new parameter.DecibelScale(-60, 40, true),
  overSample: new parameter.MenuItemScale(menuitems.oversampleItems),
  sampleRateScaler: new parameter.MenuItemScale(menuitems.sampleRateScalerItems),

  nLayer: new parameter.IntScale(1, 8),
  interval: new parameter.DecibelScale(-60, -20, true),
  seed: new parameter.IntScale(0, 2 ** 53),

  decayTo: new parameter.DecibelScale(util.ampToDB(1 / 2 ** 24), 0, false),
  attackSecond: new parameter.DecibelScale(-60, -20, true),
  minFreq: new parameter.MidiPitchScale(
    util.freqToMidiPitch(20), util.freqToMidiPitch(16000), false),
  numBin: new parameter.DecibelScale(20, 60, false),
  bandWidthOctave: new parameter.DecibelScale(-60, 0, false),
  gainSlope: new parameter.DecibelScale(-6, 6, false),

  combSection: new parameter.MenuItemScale(menuitems.combSectionItems),
  padMix: new parameter.DecibelScale(-80, 20, true),
  nDelay: new parameter.IntScale(1, 32),
  delayTime: new parameter.DecibelScale(-60, util.ampToDB(0.2), true),
  feedback: new parameter.LinearScale(-1, 1),
  highpassHz: new parameter.MidiPitchScale(
    util.freqToMidiPitch(1), util.freqToMidiPitch(48000), true),
  lowpassHz: new parameter.MidiPitchScale(
    util.freqToMidiPitch(10), util.freqToMidiPitch(48000), false),
  filterQ: new parameter.LinearScale(0.1, Math.SQRT1_2),
};

const param = {
  renderDuration: new parameter.Parameter(1 / 3, scales.renderDuration, true),
  fadeOut: new parameter.Parameter(0.002, scales.fade, true),
  outputDecayTo: new parameter.Parameter(0.01, scales.decayTo, false),
  overSample: new parameter.Parameter(1, scales.overSample),
  sampleRateScaler: new parameter.Parameter(0, scales.sampleRateScaler),

  nLayer: new parameter.Parameter(3, scales.nLayer),
  interval: new parameter.Parameter(0.02, scales.interval, true),
  jitter: new parameter.Parameter(0.1, scales.defaultScale),
  seed: new parameter.Parameter(0, scales.seed),

  padDecayTo: new parameter.Parameter(0.01, scales.decayTo, false),
  attackSecond: new parameter.Parameter(0, scales.attackSecond, true),
  minFreq: new parameter.Parameter(80, scales.minFreq, true),
  numBin: new parameter.Parameter(1000, scales.numBin, true),
  bandWidthOctave: new parameter.Parameter(0.01, scales.bandWidthOctave, true),
  gainSlope: new parameter.Parameter(1, scales.gainSlope, false),
  stereoRandom: new parameter.Parameter(0, scales.defaultScale),

  combSection: new parameter.Parameter(
    menuitems.combSectionItems.indexOf("Active"), scales.combSection),
  padMix: new parameter.Parameter(1, scales.padMix),
  nDelay: new parameter.Parameter(16, scales.nDelay),
  delayTime: new parameter.Parameter(0.03, scales.delayTime, true),
  feedback: new parameter.Parameter(-0.98, scales.feedback),
  lowpassHz: new parameter.Parameter(scales.lowpassHz.maxDsp, scales.lowpassHz, true),
  lowpassQ: new parameter.Parameter(Math.SQRT1_2, scales.filterQ, true),
  highpassHz: new parameter.Parameter(70, scales.highpassHz, true),
  highpassQ: new parameter.Parameter(Math.SQRT1_2, scales.filterQ, true),
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
  divPlayControl, "Randomize Recipe", "randomRecipe", undefined, ["Default"], "Default",
  (ev) => { randomize(); });
const buttonRandom = widget.Button(divPlayControl, "Random", (ev) => { randomize(); });
buttonRandom.id = "randomRecipe";
const spanPlayControlFiller = widget.span(divPlayControl, "playControlFiller", undefined);
const buttonPlay
  = widget.Button(divPlayControl, "Play", (ev) => { audio.play(getSampleRateScaler()); });
const buttonStop = widget.Button(divPlayControl, "Stop", (ev) => { audio.stop(); });
const buttonSave = widget.Button(
  divPlayControl, "Save", (ev) => { audio.save(false, [], getSampleRateScaler()); });
const togglebuttonQuickSave = new widget.ToggleButton(
  divPlayControl, "QuickSave", undefined, undefined, 0, (ev) => {});

const detailRender = widget.details(divLeft, "Render");
const detailLayer = widget.details(divLeft, "Layer");
const detailPad = widget.details(divRight, "PADsynth");
const detailComb = widget.details(divRight, "Serial Comb");

const ui = {
  renderDuration:
    new widget.NumberInput(detailRender, "Duration [s]", param.renderDuration, render),
  fadeOut: new widget.NumberInput(detailRender, "Fade-out [s]", param.fadeOut, render),
  outputDecayTo:
    new widget.NumberInput(detailRender, "Decay To [dB]", param.outputDecayTo, render),
  overSample:
    new widget.ComboBoxLine(detailRender, "Over-sample", param.overSample, render),
  sampleRateScaler: new widget.ComboBoxLine(
    detailRender, "Sample Rate Scale", param.sampleRateScaler, render),

  nLayer: new widget.NumberInput(detailLayer, "nLayer", param.nLayer, render),
  interval: new widget.NumberInput(detailLayer, "Interval [s]", param.interval, render),
  jitter: new widget.NumberInput(detailLayer, "Jitter", param.jitter, render),
  seed: new widget.NumberInput(detailLayer, "Seed", param.seed, render),

  padDecayTo:
    new widget.NumberInput(detailPad, "Decay To [dB]", param.padDecayTo, render),
  attackSecond:
    new widget.NumberInput(detailPad, "Attack [s]", param.attackSecond, render),
  minFreq:
    new widget.NumberInput(detailPad, "Min. Frequency [Hz]", param.minFreq, render),
  numBin: new widget.NumberInput(detailPad, "nBin", param.numBin, render),
  bandWidthOctave:
    new widget.NumberInput(detailPad, "Band Width [oct]", param.bandWidthOctave, render),
  gainSlope:
    new widget.NumberInput(detailPad, "Gain Slope [dB/oct]", param.gainSlope, render),
  stereoRandom:
    new widget.NumberInput(detailPad, "Stereo Randomize", param.stereoRandom, render),

  combSection: new widget.ToggleButtonLine(
    detailComb, menuitems.combSectionItems, param.combSection, render),
  padMix: new widget.NumberInput(detailComb, "Input Mix [dB]", param.padMix, render),
  nDelay: new widget.NumberInput(detailComb, "nDelay", param.nDelay, render),
  delayTime:
    new widget.NumberInput(detailComb, "Delay Time [s]", param.delayTime, render),
  feedback: new widget.NumberInput(detailComb, "Feedback", param.feedback, render),
  lowpassHz: new widget.NumberInput(detailComb, "LP Cut [Hz]", param.lowpassHz, render),
  lowpassQ: new widget.NumberInput(detailComb, "LP Q", param.lowpassQ, render),
  highpassHz: new widget.NumberInput(detailComb, "HP Cut [Hz]", param.highpassHz, render),
  highpassQ: new widget.NumberInput(detailComb, "HP Q", param.highpassQ, render),
};

ui.feedback.number.step = 0.01;

render();
window.addEventListener("load", (ev) => { widget.refresh(ui); });
