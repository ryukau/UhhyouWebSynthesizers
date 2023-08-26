// Copyright 2023 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {uiSize} from "../common/gui/palette.js";
import * as widget from "../common/gui/widget.js";
import * as parameter from "../common/parameter.js";
import * as util from "../common/util.js";
import * as wave from "../common/wave.js";

import * as menuitems from "./menuitems.js";
import {WaveformXYPad} from "./waveformxypad.js";

function randomize() {
  for (const key in param) {
    if (key === "renderDuration") continue;
    if (key === "fadeIn") continue;
    if (key === "fadeOut") continue;
    if (key === "decayTo") continue;
    if (key === "overSample") continue;
    if (key === "sampleRateScaler") continue;
    if (key === "oscSync") continue;
    if (key === "frequencyHz") {
      // param[key].dsp = util.exponentialMap(Math.random(), 40, 4000);
      continue;
    }
    if (key === "arpeggioDurationSeconds") continue;
    if (key === "pitchScale") {
      // param[key].normalized = Math.random();
      continue;
    }
    if (key === "equalTemperament") continue;
    if (key === "pitchDriftCent") continue;
    if (Array.isArray(param[key])) {
      param[key].forEach(e => { e.normalized = Math.random(); });
    } else if (param[key].scale instanceof parameter.MenuItemScale) {
      // Do nothing for now.
    } else {
      param[key].normalized = Math.random();
    }
  }

  ui.waveform.randomize();

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
      a: ui.waveform.coefficients(),
    }),
    "perChannel",
    togglebuttonQuickSave.state === 1,
  );
}

const scales = {
  boolean: new parameter.IntScale(0, 1),

  renderDuration: new parameter.DecibelScale(-40, 40, false),
  fade: new parameter.DecibelScale(-60, 40, true),
  decayTo: new parameter.DecibelScale(util.ampToDB(1 / 2 ** 24), 0, false),
  overSample: new parameter.MenuItemScale(menuitems.oversampleItems),
  sampleRateScaler: new parameter.MenuItemScale(menuitems.sampleRateScalerItems),

  seed: new parameter.IntScale(0, 2 ** 32),
  frequencyHz: new parameter.DecibelScale(util.ampToDB(20), util.ampToDB(20000), false),
  oscSync: new parameter.LinearScale(0, 1),
  fmIndex: new parameter.DecibelScale(-60, 40, true),

  arpeggioDurationSeconds: new parameter.DecibelScale(-40, 0, false),
  arpeggioDurationVariation: new parameter.IntScale(1, 4),
  equalTemperament: new parameter.IntScale(1, 24),
  pitchScale: new parameter.MenuItemScale(menuitems.pitchScaleItems),
  pitchDriftCent: new parameter.LinearScale(0, 100),
  pitchVariation: new parameter.IntScale(0, 16),
  pitchOctaveWrap: new parameter.IntScale(1, 8),
  arpeggioDecayTo: new parameter.DecibelScale(-60, 0, false),
};

const param = {
  renderDuration: new parameter.Parameter(1.28, scales.renderDuration, true),
  fadeIn: new parameter.Parameter(0, scales.fade, true),
  fadeOut: new parameter.Parameter(0.002, scales.fade, true),
  decayTo: new parameter.Parameter(1, scales.decayTo, false),
  overSample: new parameter.Parameter(0, scales.overSample),
  sampleRateScaler: new parameter.Parameter(0, scales.sampleRateScaler),

  seed: new parameter.Parameter(0, scales.seed, true),
  frequencyHz: new parameter.Parameter(160, scales.frequencyHz, true),
  oscSync: new parameter.Parameter(1, scales.oscSync, true),
  fmIndex: new parameter.Parameter(0, scales.fmIndex, true),

  arpeggioDurationSeconds:
    new parameter.Parameter(0.08, scales.arpeggioDurationSeconds, true),
  arpeggioDurationVariation:
    new parameter.Parameter(1, scales.arpeggioDurationVariation, true),
  equalTemperament: new parameter.Parameter(5, scales.equalTemperament, true),
  pitchScale: new parameter.Parameter(0, scales.pitchScale),
  pitchDriftCent: new parameter.Parameter(25, scales.pitchDriftCent),
  pitchVariation: new parameter.Parameter(0, scales.pitchVariation),
  pitchOctaveWrap: new parameter.Parameter(2, scales.pitchOctaveWrap),
  arpeggioDecayTo: new parameter.Parameter(1, scales.arpeggioDecayTo, false),
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
const detailOsc = widget.details(divLeft, "Oscillator");
const detailWaveform = widget.details(divRight, "Waveform");
const detailArpeggio = widget.details(divRight, "Arpeggio");

const ui = {
  renderDuration:
    new widget.NumberInput(detailRender, "Duration [s]", param.renderDuration, render),
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
  oscSync: new widget.NumberInput(detailOsc, "Sync.", param.oscSync, render),
  fmIndex: new widget.NumberInput(detailOsc, "FM Index", param.fmIndex, render),

  waveform: new WaveformXYPad(
    detailWaveform, 2 * uiSize.waveViewWidth, 2 * uiSize.waveViewHeight, "Waveform", 13,
    render),

  arpeggioDurationSeconds: new widget.NumberInput(
    detailArpeggio, "Duration [s]", param.arpeggioDurationSeconds, render),
  arpeggioDurationVariation: new widget.NumberInput(
    detailArpeggio, "Duration Variation", param.arpeggioDurationVariation, render),
  equalTemperament: new widget.NumberInput(
    detailArpeggio, "Equal Temperament", param.equalTemperament, render),
  pitchScale: new widget.ComboBoxLine(detailArpeggio, "Scale", param.pitchScale, render),
  pitchDriftCent: new widget.NumberInput(
    detailArpeggio, "Pitch Drift [cent]", param.pitchDriftCent, render),
  pitchVariation: new widget.NumberInput(
    detailArpeggio, "Pitch Variation", param.pitchVariation, render),
  pitchOctaveWrap: new widget.NumberInput(
    detailArpeggio, "Pitch Wrap [oct]", param.pitchOctaveWrap, render),
  arpeggioDecayTo: new widget.NumberInput(
    detailArpeggio, "Decay To [dB]", param.arpeggioDecayTo, render),
};

render();
window.addEventListener("load", (ev) => { widget.refresh(ui); });
