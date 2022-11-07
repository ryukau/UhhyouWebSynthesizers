// Copyright 2022 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {uiSize} from "../common/gui/palette.js";
import * as widget from "../common/gui/widget.js";
import * as parameter from "../common/parameter.js";
import * as util from "../common/util.js";
import * as wave from "../common/wave.js";

import * as menuitems from "./menuitems.js";

function randomize() {
  if (selectRandom.value === "SnareDrum") {
    for (const key in param) {
      if (key === "renderDuration") continue;
      if (key === "fadeIn") continue;
      if (key === "fadeOut") continue;
      if (key === "expDecayTo") continue;
      if (key === "stereoMerge") continue;
      if (key === "overSample") continue;
      if (key === "fdnMix") continue;
      if (key === "fdnCross") {
        param[key].dsp = util.uniformDistributionMap(Math.random(), 0, 20);
        continue;
      }
      if (key === "crossDecayTime") {
        param[key].dsp
          = util.dbToAmp(util.uniformDistributionMap(Math.random(), -20, 20));
        continue;
      }
      if (key.includes("MatrixSize")) {
        param[key].dsp = Math.floor(util.uniformDistributionMap(Math.random(), 8, 32));
        continue;
      }
      if (key.includes("MatrixType")) continue;
      if (key.includes("DelayInterp")) continue;
      if (key.includes("IdentityAmount")) {
        param[key].dsp
          = util.dbToAmp(util.uniformDistributionMap(Math.random(), -20, 40));
        continue;
      }
      if (key.includes("Frequency")) {
        param[key].dsp = util.uniformDistributionMap(Math.random(), 20, 90);
        continue;
      }
      if (key.includes("Feedback")) {
        param[key].dsp = 1
          - util.dbToAmp(util.uniformDistributionMap(
            Math.random(), util.ampToDB(0.02), util.ampToDB(0.15)));
        continue;
      }
      if (key === "batterLowpassCutoffHz") {
        param[key].dsp = util.uniformDistributionMap(Math.random(), 500, 4000);
        continue;
      }
      if (key === "snareLowpassCutoffHz") {
        param[key].dsp = util.uniformDistributionMap(Math.random(), 500, 16000);
        continue;
      }
      if (key.includes("LowpassQ")) continue;
      if (key.includes("HighpassQ")) continue;
      if (key === "batterHighpassCutoffHz") {
        param[key].dsp = util.uniformDistributionMap(Math.random(), 10, 100);
        continue;
      }
      if (key === "snareHighpassCutoffHz") {
        param[key].dsp = util.uniformDistributionMap(Math.random(), 10, 100);
        continue;
      }
      if (Array.isArray(param[key])) {
        param[key].forEach(e => { e.normalized = Math.random(); });
      } else if (param[key].scale instanceof parameter.MenuItemScale) {
        param[key].normalized = Math.random();
      } else {
        param[key].normalized = Math.random();
      }
    }
  } else { // selectRandom.value  === "Default"
    for (const key in param) {
      if (key === "renderDuration") continue;
      if (key === "fadeIn") continue;
      if (key === "fadeOut") continue;
      if (key === "expDecayTo") continue;
      if (key === "stereoMerge") continue;
      if (key === "overSample") continue;
      if (key === "fdnCross") continue;
      if (key.includes("MatrixType")) continue;
      if (key.includes("Frequency")) continue;
      if (Array.isArray(param[key])) {
        param[key].forEach(e => { e.normalized = Math.random(); });
      } else if (param[key].scale instanceof parameter.MenuItemScale) {
        param[key].normalized = Math.random();
      } else {
        param[key].normalized = Math.random();
      }
    }
  }

  onBatterMatrixSizeChanged(param.batterMatrixSize.dsp);
  onSnareMatrixSizeChanged(param.snareMatrixSize.dsp);
  widget.refresh(ui);
}

function createArrayParameters(defaultDspValue, scale) {
  let arr = new Array(scales.matrixSize.max);
  for (let i = 0; i < arr.length; ++i) {
    arr[i] = new parameter.Parameter(defaultDspValue, scale, true);
  }
  return arr;
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

function onBatterMatrixSizeChanged(value) {
  ui.batterLowpassQ.setViewRange(0, value);
  ui.batterHighpassQ.setViewRange(0, value);
  render();
}

function onSnareMatrixSizeChanged(value) {
  ui.snareLowpassQ.setViewRange(0, value);
  ui.snareHighpassQ.setViewRange(0, value);
  render();
}

const scales = {
  defaultScale: new parameter.LinearScale(0, 1),
  bipolarScale: new parameter.LinearScale(-1, 1),

  renderDuration: new parameter.DecibelScale(-40, 40, false),
  fade: new parameter.DecibelScale(-60, 40, true),
  expDecayTo: new parameter.DecibelScale(util.ampToDB(1 / 2 ** 24), 0, false),
  overSample: new parameter.MenuItemScale(menuitems.oversampleItems),
  seed: new parameter.IntScale(0, 2 ** 53),

  impactAmplitude: new parameter.DecibelScale(-20, 60, true),

  pulseDecayTime: new parameter.DecibelScale(-60, 20, true),

  fdnCross: new parameter.DecibelScale(-60, 40, true),
  crossDecayTime: new parameter.DecibelScale(-60, 40, true),

  matrixSize: new parameter.IntScale(2, 32),
  matrixType: new parameter.MenuItemScale(menuitems.matrixTypeItems),
  delayInterp: new parameter.MenuItemScale(menuitems.delayInterpItems),
  identityAmount: new parameter.DecibelScale(-60, 60, false),
  frequency: new parameter.MidiPitchScale(0, 144, false),
  filterCutoffBaseOctave: new parameter.MidiPitchScale(
    util.freqToMidiPitch(10), util.freqToMidiPitch(48000), false),
  filterCutoffOffsetOctave: new parameter.LinearScale(-1, 1),
  filterQ: new parameter.LinearScale(0.01, Math.SQRT1_2),
  filterGain: new parameter.DecibelScale(-24, 0, false),
  fdnTimeModulation: new parameter.DecibelScale(-40, 0, true),
  fdnTimeRateLimit: new parameter.LinearScale(0, 1),
  fdnFeedback: new parameter.NegativeDecibelScale(-60, 0, 1, true),
};

const param = {
  renderDuration: new parameter.Parameter(1, scales.renderDuration, true),
  fadeOut: new parameter.Parameter(0.002, scales.fade, true),
  expDecayTo: new parameter.Parameter(1, scales.expDecayTo, false),
  stereoMerge: new parameter.Parameter(0.8, scales.defaultScale),
  overSample: new parameter.Parameter(0, scales.overSample),
  seed: new parameter.Parameter(0, scales.seed),

  impactAmplitude: new parameter.Parameter(8, scales.impactAmplitude, true),
  impactPulseDecayTime: new parameter.Parameter(0.01, scales.pulseDecayTime, true),
  impactPosition: new parameter.Parameter(0.0, scales.bipolarScale, true),

  pulseThreshold: new parameter.Parameter(0.5, scales.defaultScale, true),
  pulseLoss: new parameter.Parameter(1, scales.defaultScale, true),
  pulseDecayTime: new parameter.Parameter(0.01, scales.pulseDecayTime, true),

  fdnMix: new parameter.Parameter(0.5, scales.defaultScale, true),
  fdnCross: new parameter.Parameter(16.0, scales.fdnCross, true),
  crossDecayTime: new parameter.Parameter(1, scales.crossDecayTime, true),
  crossSafetyReduction: new parameter.Parameter(0.99, scales.fdnFeedback, true),

  batterMatrixSize: new parameter.Parameter(16, scales.matrixSize),
  batterMatrixType: new parameter.Parameter(0, scales.matrixType),
  batterDelayInterp: new parameter.Parameter(1, scales.delayInterp),
  batterIdentityAmount: new parameter.Parameter(0.5, scales.identityAmount, true),
  batterFrequency: new parameter.Parameter(60, scales.frequency, true),
  batterShape: new parameter.Parameter(1, scales.defaultScale, true),
  batterOvertoneRandomization: new parameter.Parameter(0.01, scales.defaultScale),
  batterFeedback: new parameter.Parameter(0.96, scales.fdnFeedback, true),
  batterTimeModulation: new parameter.Parameter(1, scales.fdnTimeModulation, true),
  batterTimeRateLimit: new parameter.Parameter(0.5, scales.fdnTimeRateLimit, true),
  batterLowpassCutoffHz:
    new parameter.Parameter(2000, scales.filterCutoffBaseOctave, true),
  batterHighpassCutoffHz:
    new parameter.Parameter(190, scales.filterCutoffBaseOctave, true),
  batterLowpassQ: createArrayParameters(0.7, scales.filterQ),
  batterHighpassQ: createArrayParameters(0.7, scales.filterQ),

  snareMatrixSize: new parameter.Parameter(16, scales.matrixSize),
  snareMatrixType: new parameter.Parameter(0, scales.matrixType),
  snareDelayInterp: new parameter.Parameter(1, scales.delayInterp),
  snareIdentityAmount: new parameter.Parameter(0.5, scales.identityAmount, true),
  snareFrequency: new parameter.Parameter(60, scales.frequency, true),
  snareShape: new parameter.Parameter(1, scales.defaultScale, true),
  snareOvertoneRandomization: new parameter.Parameter(0.01, scales.defaultScale),
  snareFeedback: new parameter.Parameter(0.96, scales.fdnFeedback, true),
  snareTimeModulation: new parameter.Parameter(1, scales.fdnTimeModulation, true),
  snareTimeRateLimit: new parameter.Parameter(0.5, scales.fdnTimeRateLimit, true),
  snareLowpassCutoffHz:
    new parameter.Parameter(10000, scales.filterCutoffBaseOctave, true),
  snareHighpassCutoffHz: new parameter.Parameter(20, scales.filterCutoffBaseOctave, true),
  snareLowpassQ: createArrayParameters(0.7, scales.filterQ),
  snareHighpassQ: createArrayParameters(0.7, scales.filterQ),
};

// Add controls.
const pageTitle = widget.heading(document.body, 1, document.title, undefined, undefined);
const divMain = widget.div(document.body, "main", undefined);

const divLeft = widget.div(divMain, undefined, "controlBlock");
// const divRight = widget.div(divMain, undefined, "controlBlock");

const headingWaveform = widget.heading(divLeft, 6, "Waveform");
const waveView = [
  new widget.WaveView(
    divLeft, uiSize.waveViewWidth, uiSize.waveViewHeight, undefined, false),
  new widget.WaveView(
    divLeft, uiSize.waveViewWidth, uiSize.waveViewHeight, undefined, false),
];

const audio = new wave.Audio(
  2,
  "./renderer.js",
  undefined,
  (wave) => {
    for (let i = 0; i < waveView.length; ++i) waveView[i].set(wave.data[i]);
  },
);
for (let i = 0; i < waveView.length; ++i) waveView[i].set(audio.wave.data[i]);

const pRenderStatus = widget.paragraph(divLeft, "renderStatus", undefined);
audio.renderStatusElement = pRenderStatus;

const divPlayControl = widget.div(divLeft, "playControl", undefined);
const selectRandom = widget.select(
  divPlayControl, "Randomize Recipe", "randomRecipe", undefined, ["Default", "SnareDrum"],
  "SnareDrum", (ev) => { randomize(); });
const buttonRandom = widget.Button(divPlayControl, "Random", (ev) => { randomize(); });
buttonRandom.id = "randomRecipe";
const spanPlayControlFiller = widget.span(divPlayControl, "playControlFiller", undefined);
const buttonPlay = widget.Button(divPlayControl, "Play", (ev) => { audio.play(); });
const buttonStop = widget.Button(divPlayControl, "Stop", (ev) => { audio.stop(); });
const buttonSave = widget.Button(divPlayControl, "Save", (ev) => { audio.save(); });
const togglebuttonQuickSave = new widget.ToggleButton(
  divPlayControl, "QuickSave", undefined, undefined, 0, (ev) => {});

const createDetailInBlock = (name) => {
  const div = widget.div(divMain, undefined, "controlBlock");
  return widget.details(div, name);
};

const detailRender = widget.details(divLeft, "Render");
const detailImpact = widget.details(divLeft, "Impact");
const detailWire = widget.details(divLeft, "Snare Wire");
const detailFDN = createDetailInBlock("Coupling");
const detailBatter = createDetailInBlock("Batter Side");
const detailSnare = createDetailInBlock("Snare Side");

const ui = {
  renderDuration:
    new widget.NumberInput(detailRender, "Duration [s]", param.renderDuration, render),
  fadeOut: new widget.NumberInput(detailRender, "Fade-out [s]", param.fadeOut, render),
  expDecayTo:
    new widget.NumberInput(detailRender, "Decay To [dB]", param.expDecayTo, render),
  stereoMerge:
    new widget.NumberInput(detailRender, "Stereo Merge", param.stereoMerge, render),
  overSample:
    new widget.ComboBoxLine(detailRender, "Over-sample", param.overSample, render),
  seed: new widget.NumberInput(detailRender, "Seed", param.seed, render),

  impactAmplitude:
    new widget.NumberInput(detailImpact, "Amplitude", param.impactAmplitude, render),
  impactPulseDecayTime:
    new widget.NumberInput(detailImpact, "Decay [s]", param.impactPulseDecayTime, render),
  impactPosition: new widget.NumberInput(
    detailImpact, "Center-Rim Position", param.impactPosition, render),

  pulseThreshold:
    new widget.NumberInput(detailWire, "Threshold", param.pulseThreshold, render),
  pulseLoss: new widget.NumberInput(detailWire, "Loss", param.pulseLoss, render),
  pulseDecayTime:
    new widget.NumberInput(detailWire, "Decay [s]", param.pulseDecayTime, render),

  fdnMix: new widget.NumberInput(detailFDN, "Batter-Snare Mix", param.fdnMix, render),
  fdnCross: new widget.NumberInput(detailFDN, "Cross", param.fdnCross, render),
  crossDecayTime:
    new widget.NumberInput(detailFDN, "Cross Decay [s]", param.crossDecayTime, render),
  crossSafetyReduction: new widget.NumberInput(
    detailFDN, "Cross Safety Reduction", param.crossSafetyReduction, render),

  batterMatrixSize: new widget.NumberInput(
    detailBatter, "Matrix Size", param.batterMatrixSize, onBatterMatrixSizeChanged),
  batterMatrixType:
    new widget.ComboBoxLine(detailBatter, "Matrix Type", param.batterMatrixType, render),
  batterDelayInterp: new widget.ComboBoxLine(
    detailBatter, "Delay Interpolation", param.batterDelayInterp, render),
  batterIdentityAmount: new widget.NumberInput(
    detailBatter, "Identity Amount", param.batterIdentityAmount, render),
  batterFrequency:
    new widget.NumberInput(detailBatter, "Frequency [Hz]", param.batterFrequency, render),
  batterShape: new widget.NumberInput(detailBatter, "Shape", param.batterShape, render),
  batterOvertoneRandomization: new widget.NumberInput(
    detailBatter, "Overtone Random", param.batterOvertoneRandomization, render),
  batterFeedback:
    new widget.NumberInput(detailBatter, "Feedback", param.batterFeedback, render),
  batterTimeModulation: new widget.NumberInput(
    detailBatter, "Time Modulation", param.batterTimeModulation, render),
  batterTimeRateLimit: new widget.NumberInput(
    detailBatter, "Time Rate Limit", param.batterTimeRateLimit, render),
  batterLowpassCutoffHz: new widget.NumberInput(
    detailBatter, "Highshelf Cutoff [Hz]", param.batterLowpassCutoffHz, render),
  batterHighpassCutoffHz: new widget.NumberInput(
    detailBatter, "Highpass Cutoff [Hz]", param.batterHighpassCutoffHz, render),
  batterLowpassQ: new widget.BarBox(
    detailBatter, "Highshelf Q", uiSize.barboxWidth, uiSize.barboxHeight,
    param.batterLowpassQ, render),
  batterHighpassQ: new widget.BarBox(
    detailBatter, "Highpass Q", uiSize.barboxWidth, uiSize.barboxHeight,
    param.batterHighpassQ, render),

  snareMatrixSize: new widget.NumberInput(
    detailSnare, "Matrix Size", param.snareMatrixSize, onSnareMatrixSizeChanged),
  snareMatrixType:
    new widget.ComboBoxLine(detailSnare, "Matrix Type", param.snareMatrixType, render),
  snareDelayInterp: new widget.ComboBoxLine(
    detailSnare, "Delay Interpolation", param.snareDelayInterp, render),
  snareIdentityAmount: new widget.NumberInput(
    detailSnare, "Identity Amount", param.snareIdentityAmount, render),
  snareFrequency:
    new widget.NumberInput(detailSnare, "Frequency [Hz]", param.snareFrequency, render),
  snareShape: new widget.NumberInput(detailSnare, "Shape", param.snareShape, render),
  snareOvertoneRandomization: new widget.NumberInput(
    detailSnare, "Overtone Random", param.snareOvertoneRandomization, render),
  snareFeedback:
    new widget.NumberInput(detailSnare, "Feedback", param.snareFeedback, render),
  snareTimeModulation: new widget.NumberInput(
    detailSnare, "Time Modulation", param.snareTimeModulation, render),
  snareTimeRateLimit: new widget.NumberInput(
    detailSnare, "Time Rate Limit", param.snareTimeRateLimit, render),
  snareLowpassCutoffHz: new widget.NumberInput(
    detailSnare, "Highshelf Cutoff [Hz]", param.snareLowpassCutoffHz, render),
  snareHighpassCutoffHz: new widget.NumberInput(
    detailSnare, "Highpass Cutoff [Hz]", param.snareHighpassCutoffHz, render),
  snareLowpassQ: new widget.BarBox(
    detailSnare, "Highshelf Q", uiSize.barboxWidth, uiSize.barboxHeight,
    param.snareLowpassQ, render),
  snareHighpassQ: new widget.BarBox(
    detailSnare, "Highpass Q", uiSize.barboxWidth, uiSize.barboxHeight,
    param.snareHighpassQ, render),
};

onBatterMatrixSizeChanged(param.batterMatrixSize.defaultDsp);
onSnareMatrixSizeChanged(param.snareMatrixSize.defaultDsp);
