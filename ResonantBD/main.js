// Copyright 2022 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {palette, uiSize} from "../common/gui/palette.js";
import * as widget from "../common/gui/widget.js";
import * as parameter from "../common/parameter.js";
import * as util from "../common/util.js";
import * as wave from "../common/wave.js";

import * as menuitems from "./menuitems.js";

function randomize() {
  if (selectRandom.value === "Default") {
    for (const key in param) {
      if (key === "renderDuration") continue;
      if (key === "fadeIn") continue;
      if (key === "fadeOut") continue;
      if (key === "decayTo") {
        param[key].ui = util.uniformDistributionMap(Math.random(), -30, 0);
        continue;
      }
      if (key === "overSample") continue;
      if (key === "noiseStereo") continue;
      if (key === "noiseDecay") {
        param[key].dsp = util.uniformDistributionMap(Math.random(), 0, 0.05);
        continue;
      }
      if (key === "clickDecay") {
        param[key].dsp = util.uniformDistributionMap(Math.random(), 0, 0.05);
        continue;
      }
      if (key === "filter2Q") {
        // param[key].dsp = util.uniformDistributionMap(Math.random(), 10, 1000);
        // continue;
      }
      if (key === "filter2Cut") {
        param[key].dsp = util.uniformDistributionMap(Math.random(), 10, 120);
        continue;
      }
      if (key === "filter2PitchOct") {
        // param[key].dsp = util.uniformDistributionMap(Math.random(), 0, 2.3);
        // continue;
      }
      if (key === "eqGain") continue;
      if (key === "eqFeedback") continue;

      if (Array.isArray(param[key])) {
        param[key].forEach(e => { e.normalized = Math.random(); });
      } else if (param[key].scale instanceof parameter.MenuItemScale) {
        param[key].normalized = Math.random();
      } else {
        param[key].normalized = Math.random();
      }
    }
  } else { // selectRandom.value === "All"
    for (const key in param) {
      if (key === "renderDuration") {
        param[key].dsp = util.uniformDistributionMap(Math.random(), 0.1, 2);
        continue;
      }
      if (key === "fadeIn") continue;
      if (key === "fadeOut") continue;
      if (key === "overSample") continue;
      if (key === "noiseStereo") continue;

      if (Array.isArray(param[key])) {
        param[key].forEach(e => { e.normalized = Math.random(); });
      } else if (param[key].scale instanceof parameter.MenuItemScale) {
        param[key].normalized = Math.random();
      } else {
        param[key].normalized = Math.random();
      }
    }
  }

  render();
  widget.refresh(ui);
}

function render() {
  audio.render(
    parameter.toMessage(param, {
      sampleRate: audio.audioContext.sampleRate,
    }),
    "perChannel",
    togglebuttonQuickSave.state === 1,
  );
}

const scales = {
  defaultScale: new parameter.LinearScale(0, 1),

  renderDuration: new parameter.DecibelScale(-40, 40, false),
  fade: new parameter.DecibelScale(-60, 40, true),
  decayTo: new parameter.DecibelScale(util.ampToDB(1 / 2 ** 24), 0, false),
  overSample: new parameter.MenuItemScale(menuitems.oversampleItems),
  seed: new parameter.IntScale(0, 2 ** 53),

  limiterAttack: new parameter.DecibelScale(-80, -40, false),
  limiterRelease: new parameter.DecibelScale(-60, 0, true),
  limiterInputGain: new parameter.DecibelScale(0, 60, false),

  noiseStereo: new parameter.MenuItemScale(menuitems.noiseStereoItems),
  noiseDecay: new parameter.DecibelScale(-60, 20, true),
  clickPitchRatio: new parameter.LinearScale(0, 16),
  clickAmount: new parameter.DecibelScale(0, 100, true),

  filterQ: new parameter.DecibelScale(util.ampToDB(Math.SQRT1_2), 60, false),
  filterCut: new parameter.DecibelScale(20, 60, false),
  filterPitchOct: new parameter.LinearScale(0, 6),
  filterDecaySeconds: new parameter.DecibelScale(-40, 40, false),
  filterExponent: new parameter.LinearScale(0.1, 2),

  eqType: new parameter.MenuItemScale(menuitems.eqTypeItems),
  eqCut: new parameter.DecibelScale(20, 80, false),
  eqGain: new parameter.DecibelScale(0, 40, false),
  eqFeedback: new parameter.DecibelScale(0, 60, true),
};

const param = {
  renderDuration: new parameter.Parameter(Math.E / 10, scales.renderDuration, true),
  fadeIn: new parameter.Parameter(0.001, scales.fade, true),
  fadeOut: new parameter.Parameter(0.1, scales.fade, true),
  decayTo: new parameter.Parameter(1, scales.decayTo, false),
  overSample: new parameter.Parameter(1, scales.overSample),
  seed: new parameter.Parameter(0, scales.seed),

  limiterAttack: new parameter.Parameter(4 / 3000, scales.limiterAttack, true),
  limiterSustain: new parameter.Parameter(5 / 3000, scales.limiterAttack, true),
  limiterRelease: new parameter.Parameter(0, scales.limiterRelease, true),
  limiterInputGain: new parameter.Parameter(1, scales.limiterInputGain, false),
  limiterSaturationMix: new parameter.Parameter(0.2, scales.defaultScale),

  noiseStereo: new parameter.Parameter(0, scales.noiseStereo, true),
  noiseDecay: new parameter.Parameter(0.002, scales.noiseDecay, true),
  clickDecay: new parameter.Parameter(0.01, scales.noiseDecay, true),
  clickPitchRatio: new parameter.Parameter(0.01, scales.clickPitchRatio, true),
  clickAmount: new parameter.Parameter(1000, scales.clickAmount, true),

  filterExponent: new parameter.Parameter(1, scales.filterExponent, true),
  filter1Q: new parameter.Parameter(10, scales.filterQ, true),
  filter2Q: new parameter.Parameter(300, scales.filterQ, true),
  filter1Cut: new parameter.Parameter(400, scales.filterCut, true),
  filter2Cut: new parameter.Parameter(30 + 1 / 3, scales.filterCut, true),
  filter1PitchOct: new parameter.Parameter(2, scales.filterPitchOct, true),
  filter2PitchOct: new parameter.Parameter(1, scales.filterPitchOct, true),
  filter1DecaySeconds: new parameter.Parameter(1, scales.filterDecaySeconds, true),
  filter2DecaySeconds: new parameter.Parameter(10, scales.filterDecaySeconds, true),

  eqType: new parameter.Parameter(0, scales.eqType, true),
  eqCut: new parameter.Parameter(400, scales.eqCut, true),
  eqQ: new parameter.Parameter(10, scales.filterQ, true),
  eqGain: new parameter.Parameter(util.dbToAmp(10), scales.eqGain),
  eqFeedback: new parameter.Parameter(0, scales.eqFeedback, true),
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
  divPlayControl, "Randomize Recipe", "randomRecipe", undefined, ["All", "Default"],
  "Default", (ev) => { randomize(); });
const buttonRandom = widget.Button(divPlayControl, "Random", (ev) => { randomize(); });
buttonRandom.id = "randomRecipe";
const spanPlayControlFiller = widget.span(divPlayControl, "playControlFiller", undefined);
const buttonPlay = widget.Button(divPlayControl, "Play", (ev) => { audio.play(); });
const buttonStop = widget.Button(divPlayControl, "Stop", (ev) => { audio.stop(); });
const buttonSave = widget.Button(divPlayControl, "Save", (ev) => { audio.save(); });
const togglebuttonQuickSave = new widget.ToggleButton(
  divPlayControl, "QuickSave", undefined, undefined, 0, (ev) => {});

const detailRender = widget.details(divLeft, "Render");
const detailLimiter = widget.details(divLeft, "Limiter");
const detailOsc = widget.details(divRight, "Oscillator");
const detailFilter = widget.details(divRight, "Filter");
const detailEq = widget.details(divRight, "Equalizer");

const ui = {
  renderDuration:
    new widget.NumberInput(detailRender, "Duration [s]", param.renderDuration, render),
  fadeIn: new widget.NumberInput(detailRender, "Fade-in [s]", param.fadeIn, render),
  fadeOut: new widget.NumberInput(detailRender, "Fade-out [s]", param.fadeOut, render),
  decayTo: new widget.NumberInput(detailRender, "Decay To [dB]", param.decayTo, render),
  overSample:
    new widget.ComboBoxLine(detailRender, "Over-sample", param.overSample, render),
  seed: new widget.NumberInput(detailRender, "Seed", param.seed, render),

  limiterAttack:
    new widget.NumberInput(detailLimiter, "Attack [s]", param.limiterAttack, render),
  limiterSustain:
    new widget.NumberInput(detailLimiter, "Sustain [s]", param.limiterSustain, render),
  limiterRelease:
    new widget.NumberInput(detailLimiter, "Release [s]", param.limiterRelease, render),
  limiterInputGain: new widget.NumberInput(
    detailLimiter, "Input Gain [dB]", param.limiterInputGain, render),
  limiterSaturationMix: new widget.NumberInput(
    detailLimiter, "Saturation Mix", param.limiterSaturationMix, render),

  noiseStereo: new widget.ToggleButtonLine(
    detailOsc, menuitems.noiseStereoItems, param.noiseStereo, render),
  noiseDecay:
    new widget.NumberInput(detailOsc, "Noise Decay [s]", param.noiseDecay, render),
  clickDecay:
    new widget.NumberInput(detailOsc, "Click Decay [s]", param.clickDecay, render),
  clickPitchRatio:
    new widget.NumberInput(detailOsc, "Click Pitch Ratio", param.clickPitchRatio, render),
  clickAmount:
    new widget.NumberInput(detailOsc, "Click Amount", param.clickAmount, render),

  filterExponent:
    new widget.NumberInput(detailFilter, "Exponent", param.filterExponent, render),
  filter1Q: new widget.NumberInput(detailFilter, "Q1", param.filter1Q, render),
  filter2Q: new widget.NumberInput(detailFilter, "Q2", param.filter2Q, render),
  filter1Cut:
    new widget.NumberInput(detailFilter, "Cutoff 1 [Hz]", param.filter1Cut, render),
  filter2Cut:
    new widget.NumberInput(detailFilter, "Cutoff 2 [Hz]", param.filter2Cut, render),
  filter1PitchOct: new widget.NumberInput(
    detailFilter, "Pitch Amount 1 [oct]", param.filter1PitchOct, render),
  filter2PitchOct: new widget.NumberInput(
    detailFilter, "Pitch Amount 2 [oct]", param.filter2PitchOct, render),
  filter1DecaySeconds: new widget.NumberInput(
    detailFilter, "Pitch Time 1 [s]", param.filter1DecaySeconds, render),
  filter2DecaySeconds: new widget.NumberInput(
    detailFilter, "Pitch Time 2 [s]", param.filter2DecaySeconds, render),

  eqType: new widget.ComboBoxLine(detailEq, "Type", param.eqType, render),
  eqCut: new widget.NumberInput(detailEq, "Cut [Hz]", param.eqCut, render),
  eqQ: new widget.NumberInput(detailEq, "Q", param.eqQ, render),
  eqGain: new widget.NumberInput(detailEq, "Gain [dB]", param.eqGain, render),
  eqFeedback: new widget.NumberInput(detailEq, "Feedback", param.eqFeedback, render),
};

render();
window.addEventListener("load", (ev) => { widget.refresh(ui); });
