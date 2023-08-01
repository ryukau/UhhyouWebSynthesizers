// Copyright 2023 Takamitsu Endo
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
    if (key === "fadeIn") continue;
    if (key === "fadeOut") continue;
    if (key === "dcHighpassHz") continue;
    if (key === "impulseGain") continue;
    if (key === "pulseFormantOctave") continue;
    if (key === "maxJitterSecond") continue;
    if (key === "feedbackGain") continue;
    if (key === "lowpassHz") {
      // param[key].dsp = util.exponentialMap(Math.random(), 8000, 100000);
      continue;
    }
    if (key === "highpassHz") {
      param[key].dsp = util.exponentialMap(Math.random(), 10, 120);
      continue;
    }
    if (key === "delayTimeSlewRate") continue;
    // if (key === "randomFrequencyHz") continue;
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
  renderDuration: new parameter.DecibelScale(-40, 40, false),
  // renderDuration: new parameter.DecibelScale(-100, 40, false),
  fade: new parameter.DecibelScale(-60, 40, true),
  overSample: new parameter.MenuItemScale(menuitems.oversampleItems),
  dcHighpassHz: new parameter.DecibelScale(-20, 40, true),

  seed: new parameter.IntScale(0, 2 ** 32),
  randomFrequencyHz: new parameter.LinearScale(0, 2),

  impactEnvelopeTime: new parameter.DecibelScale(-60, 40, true),
  impactEnvelopeAM: new parameter.DecibelScale(-100, 0, true),
  pulseType: new parameter.LinearScale(0, 1),
  pulseBendOct: new parameter.LinearScale(0, 8),
  grainOverlap: new parameter.LinearScale(0, 0.99),
  freqModMix: new parameter.LinearScale(0, 1),
  noiseDecayTime: new parameter.DecibelScale(-60, 40, true),
  noiseGain: new parameter.DecibelScale(-60, 20, true),
  formantOctave: new parameter.LinearScale(-6, 6),
  formantQRatio: new parameter.DecibelScale(-20, 20, false),

  delayCount: new parameter.IntScale(1, 16),
  maxJitterSecond: new parameter.DecibelScale(-80, util.ampToDB(0.2), true),
  frequencyHz: new parameter.DecibelScale(util.ampToDB(10), 80, false),
  feedbackGain: new parameter.NegativeDecibelScale(-80, 0, 1, true),
  feedbackMod: new parameter.LinearScale(0, 1),
  cutoffHz: new parameter.DecibelScale(20, 100, false),
  frequencyRatio: new parameter.DecibelScale(-20, 20, false),
  filterQ: new parameter.DecibelScale(-20, 20, false),
  cutoffMod: new parameter.LinearScale(-4, 4),
  energyLossThreshold: new parameter.DecibelScale(-20, 20, false),
  delayTimeSlewRate: new parameter.DecibelScale(-40, 40, false),
};

const param = {
  renderDuration: new parameter.Parameter(2, scales.renderDuration, true),
  // renderDuration: new parameter.Parameter(100 / 48000, scales.renderDuration, true),
  fadeIn: new parameter.Parameter(0, scales.fade, true),
  fadeOut: new parameter.Parameter(0.002, scales.fade, true),
  overSample: new parameter.Parameter(1, scales.overSample),
  dcHighpassHz: new parameter.Parameter(4, scales.dcHighpassHz, true),

  seed: new parameter.Parameter(0, scales.seed),
  randomFrequencyHz: new parameter.Parameter(1.0, scales.randomFrequencyHz, true),

  impulseGain: new parameter.Parameter(0, scales.noiseGain, false),
  impactEnvelopeAttack: new parameter.Parameter(1, scales.impactEnvelopeTime, true),
  impactEnvelopeDecay: new parameter.Parameter(2, scales.impactEnvelopeTime, true),
  impactEnvelopeAM: new parameter.Parameter(0.01, scales.impactEnvelopeAM, true),
  pulseType: new parameter.Parameter(0.5, scales.pulseType, true),
  pulseStartHz: new parameter.Parameter(32, scales.frequencyHz, true),
  pulsePitchOct: new parameter.Parameter(0, scales.formantOctave, true),
  pulseBendOct: new parameter.Parameter(3.2, scales.pulseBendOct, true),
  pulseFormantOctave: new parameter.Parameter(0, scales.formantOctave, true),
  pulseFormantQRatio: new parameter.Parameter(1, scales.formantQRatio, true),
  grainOverlap: new parameter.Parameter(0, scales.grainOverlap, true),
  freqModMix: new parameter.Parameter(0, scales.freqModMix, true),
  noiseDecaySecond: new parameter.Parameter(0.03, scales.noiseDecayTime, true),
  noiseGain: new parameter.Parameter(0, scales.noiseGain, false),
  noiseFormantOctave: new parameter.Parameter(0, scales.formantOctave, true),
  noiseFormantQRatio: new parameter.Parameter(1, scales.formantQRatio, true),

  delayCount: new parameter.Parameter(8, scales.delayCount, true),
  maxJitterSecond: new parameter.Parameter(0.001, scales.maxJitterSecond, true),
  frequencyHz: new parameter.Parameter(815.0, scales.frequencyHz, true),
  feedbackGain: new parameter.Parameter(0.94, scales.feedbackGain, true),
  feedbackMod: new parameter.Parameter(0, scales.feedbackMod, true),
  lowpassHz: new parameter.Parameter(22000, scales.cutoffHz, true),
  highpassHz: new parameter.Parameter(20, scales.cutoffHz, true),
  allpassCut: new parameter.Parameter(0.2, scales.frequencyRatio, true),
  allpassQ: new parameter.Parameter(0.2, scales.filterQ, true),
  allpassMod: new parameter.Parameter(1.0, scales.cutoffMod, true),
  energyLossThreshold: new parameter.Parameter(4.0, scales.energyLossThreshold, true),
  delayTimeMod: new parameter.Parameter(1.0, scales.cutoffMod, true),
  delayTimeSlewRate: new parameter.Parameter(0.25, scales.delayTimeSlewRate, true),
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

const divPlayControl = widget.div(divLeft, "playControl", undefined);
const selectRandom = widget.select(
  divPlayControl, "Randomize Recipe", "randomRecipe", undefined, ["Default"], "Default",
  (ev) => { randomize(); });
const buttonRandom = widget.Button(divPlayControl, "Random", (ev) => { randomize(); });
buttonRandom.id = "randomRecipe";
const spanPlayControlFiller = widget.span(divPlayControl, "playControlFiller", undefined);
// spanPlayControlFiller.textContent = " ";
const buttonPlay = widget.Button(divPlayControl, "Play", (ev) => { audio.play(); });
const buttonStop = widget.Button(divPlayControl, "Stop", (ev) => { audio.stop(); });
const buttonSave = widget.Button(divPlayControl, "Save", (ev) => { audio.save(); });
const togglebuttonQuickSave = new widget.ToggleButton(
  divPlayControl, "QuickSave", undefined, undefined, 0, (ev) => {});

const detailRender = widget.details(divLeft, "Render");
const detailRandom = widget.details(divLeft, "Random");
const detailSource = widget.details(divRightA, "Source");
const detailDelay = widget.details(divRightB, "Delay");

const ui = {
  renderDuration:
    new widget.NumberInput(detailRender, "Duration [s]", param.renderDuration, render),
  fadeIn: new widget.NumberInput(detailRender, "Fade-in [s]", param.fadeIn, render),
  fadeOut: new widget.NumberInput(detailRender, "Fade-out [s]", param.fadeOut, render),
  overSample:
    new widget.ComboBoxLine(detailRender, "Over-sample", param.overSample, render),
  dcHighpassHz:
    new widget.NumberInput(detailRender, "DC Highpass [Hz]", param.dcHighpassHz, render),

  seed: new widget.NumberInput(detailRandom, "Seed", param.seed, render),
  randomFrequencyHz: new widget.NumberInput(
    detailRandom, "Frequency [oct]", param.randomFrequencyHz, render),

  impulseGain:
    new widget.NumberInput(detailSource, "Impulse [dB]", param.impulseGain, render),
  impactEnvelopeAttack: new widget.NumberInput(
    detailSource, "Attack [s]", param.impactEnvelopeAttack, render),
  impactEnvelopeDecay:
    new widget.NumberInput(detailSource, "Decay [s]", param.impactEnvelopeDecay, render),
  impactEnvelopeAM:
    new widget.NumberInput(detailSource, "AM Amount", param.impactEnvelopeAM, render),
  pulseType: new widget.NumberInput(detailSource, "Pulse Type", param.pulseType, render),
  pulseStartHz:
    new widget.NumberInput(detailSource, "Pulse Start [Hz]", param.pulseStartHz, render),
  pulsePitchOct: new widget.NumberInput(
    detailSource, "Pulse Pitch [oct]", param.pulsePitchOct, render),
  pulseBendOct:
    new widget.NumberInput(detailSource, "Pulse Bend [oct]", param.pulseBendOct, render),
  pulseFormantOctave: new widget.NumberInput(
    detailSource, "Pulse Formant [oct]", param.pulseFormantOctave, render),
  pulseFormantQRatio:
    new widget.NumberInput(detailSource, "Pulse Q", param.pulseFormantQRatio, render),
  grainOverlap:
    new widget.NumberInput(detailSource, "Grain Overlap", param.grainOverlap, render),
  freqModMix:
    new widget.NumberInput(detailSource, "Freq. Mod. Mix", param.freqModMix, render),
  noiseDecaySecond: new widget.NumberInput(
    detailSource, "Noise Decay [s]", param.noiseDecaySecond, render),
  noiseGain:
    new widget.NumberInput(detailSource, "Noise Gain [dB]", param.noiseGain, render),
  noiseFormantOctave: new widget.NumberInput(
    detailSource, "Noise Formant [oct]", param.noiseFormantOctave, render),
  noiseFormantQRatio:
    new widget.NumberInput(detailSource, "Noise Q", param.noiseFormantQRatio, render),

  delayCount: new widget.NumberInput(detailDelay, "Quantity", param.delayCount, render),
  maxJitterSecond:
    new widget.NumberInput(detailDelay, "Jitter [s]", param.maxJitterSecond, render),
  frequencyHz:
    new widget.NumberInput(detailDelay, "Frequency [Hz]", param.frequencyHz, render),
  feedbackGain:
    new widget.NumberInput(detailDelay, "Feedback Gain", param.feedbackGain, render),
  feedbackMod:
    new widget.NumberInput(detailDelay, "Feedback Mod.", param.feedbackMod, render),
  lowpassHz: new widget.NumberInput(detailDelay, "LP Cut [Hz]", param.lowpassHz, render),
  highpassHz:
    new widget.NumberInput(detailDelay, "HP Cut [Hz]", param.highpassHz, render),
  allpassCut: new widget.NumberInput(detailDelay, "AP Cut", param.allpassCut, render),
  allpassQ: new widget.NumberInput(detailDelay, "AP Q", param.allpassQ, render),
  allpassMod: new widget.NumberInput(detailDelay, "AP Mod", param.allpassMod, render),
  energyLossThreshold: new widget.NumberInput(
    detailDelay, "Loss Threshold", param.energyLossThreshold, render),
  delayTimeMod:
    new widget.NumberInput(detailDelay, "Delay Mod", param.delayTimeMod, render),
  delayTimeSlewRate: new widget.NumberInput(
    detailDelay, "Mod. Slew Rate", param.delayTimeSlewRate, render),
};

render();
window.addEventListener("load", (ev) => { widget.refresh(ui); });
