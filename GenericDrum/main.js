// Copyright 2023 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {uiSize} from "../common/gui/palette.js";
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
      if (key === "decayTo") continue;
      if (key === "stereoMerge") continue;
      if (key === "overSample") continue;
      if (key === "sampleRateScaler") continue;
      if (key === "dcHighpassHz") continue;
      if (key === "toneSlope") continue;

      if (key === "membraneWireMix") continue;
      if (key === "matrixSize") continue;
      if (key === "crossFeedbackGain") continue;
      if (key === "pitchType") {
        param[key].normalized = Math.random();
        continue;
      }
      if (key === "delayTimeModAmount") {
        param[key].dsp = util.exponentialMap(Math.random(), 0.1, 10000);
        continue;
      }
      if (key === "secondaryQOffset") continue;

      if (Array.isArray(param[key])) {
        param[key].forEach(e => { e.normalized = Math.random(); });
      } else if (param[key].scale instanceof parameter.MenuItemScale) {
        // Do nothing for now.
      } else {
        param[key].normalized = Math.random();
      }
    }
  }

  onMatrixSizeChanged(param.matrixSize.dsp);
  widget.refresh(ui);
}

function getSampleRateScaler() {
  return parseInt(menuitems.sampleRateScalerItems[param.sampleRateScaler.dsp]);
}

function createArrayParameters(defaultDspValues, scale, size) {
  let arr = new Array(size);
  for (let i = 0; i < arr.length; ++i) {
    arr[i] = new parameter.Parameter(defaultDspValues[i], scale, true);
  }
  return arr;
}

function render() {
  audio.render(
    parameter.toMessage(param, {
      sampleRate: audio.audioContext.sampleRate * getSampleRateScaler(),
    }),
    "perChannel",
    togglebuttonQuickSave.state === 1,
    (data) => {
      ui.wireStatus.textContent
        = data.isWireEngaged ? "Wire collided." : "Wire didn't collide.";
      ui.secondaryStatus.textContent
        = data.isSecondaryEngaged ? "Membrane collided." : "Membrane didn't collide.";
    },
  );
}

function onMatrixSizeChanged(value) {
  ui.crossFeedbackRatio.setViewRange(0, value);
  render();
}

const scales = {
  boolean: new parameter.IntScale(0, 1),

  renderDuration: new parameter.DecibelScale(-40, 40, false),
  fade: new parameter.DecibelScale(-60, 40, true),
  decayTo: new parameter.DecibelScale(util.ampToDB(1 / 2 ** 24), 0, false),
  stereoMerge: new parameter.LinearScale(0, 1),
  overSample: new parameter.MenuItemScale(menuitems.oversampleItems),
  sampleRateScaler: new parameter.MenuItemScale(menuitems.sampleRateScalerItems),
  dcHighpassHz: new parameter.DecibelScale(-20, 40, true),
  toneSlope: new parameter.DecibelScale(-12, 0, false),

  limiterType: new parameter.MenuItemScale(menuitems.limiterTypeItems),
  limiterThreshold: new parameter.DecibelScale(-60, 40, false),
  limiterSmoothingSeconds: new parameter.DecibelScale(-80, -20, false),

  mix: new parameter.LinearScale(0, 1),
  seed: new parameter.IntScale(0, 2 ** 32),
  noiseDecaySeconds: new parameter.DecibelScale(-40, util.ampToDB(0.5), false),
  noiseLowpassHz: new parameter.DecibelScale(util.ampToDB(2), util.ampToDB(10000), false),

  wireFrequencyHz: new parameter.DecibelScale(0, util.ampToDB(1000), false),
  wireDecaySeconds: new parameter.DecibelScale(-40, 40, false),

  matrixSize: new parameter.IntScale(1, 32),
  crossFeedbackGain: new parameter.DecibelScale(-12, 3, false),
  feedbackDecaySeconds: new parameter.DecibelScale(-40, 20, false),
  crossFeedbackRatio: new parameter.LinearScale(0, 1),

  pitchSpread: new parameter.LinearScale(0, 1),
  pitchRandomCent: new parameter.LinearScale(0, 1200),
  envelopeSeconds: new parameter.DecibelScale(-60, 40, false),
  envelopeModAmount: new parameter.DecibelScale(-20, 20, true),

  pitchType: new parameter.MenuItemScale(menuitems.pitchTypeItems),
  delayTimeHz: new parameter.DecibelScale(util.ampToDB(2), util.ampToDB(10000), false),
  delayTimeModAmount: new parameter.DecibelScale(-20, 100, true),
  bandpassCutRatio: new parameter.LinearScale(-8, 8),
  bandpassQ: new parameter.DecibelScale(-40, 40, false),

  secondaryDistance: new parameter.DecibelScale(-80, 40, true),
};

const param = {
  renderDuration: new parameter.Parameter(0.5, scales.renderDuration, true),
  fadeIn: new parameter.Parameter(0.002, scales.fade, true),
  fadeOut: new parameter.Parameter(0.002, scales.fade, true),
  decayTo: new parameter.Parameter(1, scales.decayTo, false),
  stereoMerge: new parameter.Parameter(0.75, scales.stereoMerge),
  overSample: new parameter.Parameter(1, scales.overSample),
  sampleRateScaler: new parameter.Parameter(0, scales.sampleRateScaler),
  dcHighpassHz: new parameter.Parameter(0, scales.dcHighpassHz, true),
  toneSlope: new parameter.Parameter(1, scales.toneSlope, false),

  limiterType: new parameter.Parameter(1, scales.limiterType, true),
  limiterThreshold: new parameter.Parameter(1, scales.limiterThreshold, false),
  limiterSmoothingSeconds:
    new parameter.Parameter(0.02, scales.limiterSmoothingSeconds, true),

  seed: new parameter.Parameter(406392312, scales.seed, true),
  noiseDecaySeconds: new parameter.Parameter(0.08, scales.noiseDecaySeconds, true),
  noiseLowpassHz: new parameter.Parameter(50.0, scales.noiseLowpassHz, true),
  allpassMaxTimeHz: new parameter.Parameter(3000, scales.delayTimeHz, true),

  impactWireMix: new parameter.Parameter(0.9, scales.mix, true),
  membraneWireMix: new parameter.Parameter(0, scales.mix, true),
  wireFrequencyHz: new parameter.Parameter(100, scales.wireFrequencyHz, true),
  wireDecaySeconds: new parameter.Parameter(2, scales.wireDecaySeconds, true),
  wireDistance: new parameter.Parameter(0.15, scales.secondaryDistance, true),
  wireCollisionTypeMix: new parameter.Parameter(0.5, scales.mix, true),

  matrixSize: new parameter.Parameter(5, scales.matrixSize, true),
  crossFeedbackGain:
    new parameter.Parameter(util.dbToAmp(-1), scales.crossFeedbackGain, false),
  crossFeedbackRatio: createArrayParameters(
    new Array(scales.matrixSize.max).fill(1), scales.crossFeedbackRatio,
    scales.matrixSize.max),

  delayTimeSpread: new parameter.Parameter(0.1, scales.pitchSpread, true),
  bandpassCutSpread: new parameter.Parameter(0.5, scales.pitchSpread, true),
  pitchRandomCent: new parameter.Parameter(300, scales.pitchRandomCent, true),

  envelopeAttackSeconds: new parameter.Parameter(0.01, scales.envelopeSeconds, true),
  envelopeDecaySeconds: new parameter.Parameter(0.01, scales.envelopeSeconds, true),
  envelopeModAmount: new parameter.Parameter(0, scales.envelopeModAmount, true),

  pitchType: new parameter.Parameter(7, scales.pitchType, true),
  delayTimeHz: new parameter.Parameter(110, scales.delayTimeHz, true),
  delayTimeModAmount: new parameter.Parameter(1150, scales.delayTimeModAmount, true),
  bandpassCutRatio: new parameter.Parameter(0.7, scales.bandpassCutRatio, true),
  bandpassQ: new parameter.Parameter(0.1, scales.bandpassQ, true),

  secondaryFdnMix: new parameter.Parameter(0.25, scales.mix, true),
  secondaryPitchOffset: new parameter.Parameter(0.65, scales.bandpassCutRatio, true),
  secondaryQOffset: new parameter.Parameter(-2, scales.bandpassCutRatio, true),
  secondaryDistance: new parameter.Parameter(0.0008, scales.secondaryDistance, true),
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
const buttonPlay
  = widget.Button(divPlayControl, "Play", (ev) => { audio.play(getSampleRateScaler()); });
const buttonStop = widget.Button(divPlayControl, "Stop", (ev) => { audio.stop(); });
const buttonSave = widget.Button(
  divPlayControl, "Save", (ev) => { audio.save(false, [], getSampleRateScaler()); });
const togglebuttonQuickSave = new widget.ToggleButton(
  divPlayControl, "QuickSave", undefined, undefined, 0, (ev) => {});

const detailRender = widget.details(divLeft, "Render");
const detailLimiter = widget.details(divLeft, "Limiter");
const detailOsc = widget.details(divRightA, "Impact Noise");
const detailWire = widget.details(divRightA, "Wire");
const detailFDN = widget.details(divRightA, "Membrane Tone");
const detailPitchTexture = widget.details(divRightB, "Pitch Texture");
const detailPitchEnvelope = widget.details(divRightB, "Pitch Envelope");
const detailPrimary = widget.details(divRightB, "Primary Membrane");
const detailSecondary = widget.details(divRightB, "Secondary Membrane");

const ui = {
  renderDuration:
    new widget.NumberInput(detailRender, "Duration [s]", param.renderDuration, render),
  fadeIn: new widget.NumberInput(detailRender, "Fade-in [s]", param.fadeIn, render),
  fadeOut: new widget.NumberInput(detailRender, "Fade-out [s]", param.fadeOut, render),
  decayTo: new widget.NumberInput(detailRender, "Decay To [dB]", param.decayTo, render),
  stereoMerge:
    new widget.NumberInput(detailRender, "Stereo Merge", param.stereoMerge, render),
  overSample:
    new widget.ComboBoxLine(detailRender, "Over-sample", param.overSample, render),
  sampleRateScaler: new widget.ComboBoxLine(
    detailRender, "Sample Rate Scale", param.sampleRateScaler, render),
  dcHighpassHz:
    new widget.NumberInput(detailRender, "DC Highpass [Hz]", param.dcHighpassHz, render),
  toneSlope:
    new widget.NumberInput(detailRender, "Tone Slope [dB/oct]", param.toneSlope, render),

  limiterType: new widget.ComboBoxLine(detailLimiter, "Type", param.limiterType, render),
  limiterThreshold: new widget.NumberInput(
    detailLimiter, "Threshold [dB]", param.limiterThreshold, render),
  limiterSmoothingSeconds: new widget.NumberInput(
    detailLimiter, "Smoothing [s]", param.limiterSmoothingSeconds, render),

  seed: new widget.NumberInput(detailOsc, "Seed", param.seed, render),
  noiseDecaySeconds:
    new widget.NumberInput(detailOsc, "Noise Decay [s]", param.noiseDecaySeconds, render),
  noiseLowpassHz:
    new widget.NumberInput(detailOsc, "Noise Lowpass [Hz]", param.noiseLowpassHz, render),
  allpassMaxTimeHz:
    new widget.NumberInput(detailOsc, "Echo [Hz]", param.allpassMaxTimeHz, render),

  impactWireMix:
    new widget.NumberInput(detailWire, "Impact-Wire Mix", param.impactWireMix, render),
  membraneWireMix: new widget.NumberInput(
    detailWire, "Membrane-Wire Mix", param.membraneWireMix, render),
  wireFrequencyHz:
    new widget.NumberInput(detailWire, "Frequency [Hz]", param.wireFrequencyHz, render),
  wireDecaySeconds:
    new widget.NumberInput(detailWire, "Decay [s]", param.wireDecaySeconds, render),
  wireDistance:
    new widget.NumberInput(detailWire, "Collision Distance", param.wireDistance, render),
  wireCollisionTypeMix: new widget.NumberInput(
    detailWire, "Ruttle-Squeak Mix", param.wireCollisionTypeMix, render),
  wireStatus: widget.paragraph(detailWire, "wireStatus", undefined),

  matrixSize:
    new widget.NumberInput(detailFDN, "FDN Size", param.matrixSize, onMatrixSizeChanged),
  crossFeedbackGain: new widget.NumberInput(
    detailFDN, "Cross Feedback Gain [dB]", param.crossFeedbackGain, render),
  crossFeedbackRatio: new widget.BarBox(
    detailFDN, "Cross Feedback Ratio", uiSize.barboxWidth, uiSize.barboxHeight,
    param.crossFeedbackRatio, render),

  delayTimeSpread: new widget.NumberInput(
    detailPitchTexture, "Delay Time Spread", param.delayTimeSpread, render),
  bandpassCutSpread: new widget.NumberInput(
    detailPitchTexture, "BP Cut Spread", param.bandpassCutSpread, render),
  pitchRandomCent: new widget.NumberInput(
    detailPitchTexture, "Pitch Random [cent]", param.pitchRandomCent, render),

  envelopeAttackSeconds: new widget.NumberInput(
    detailPitchEnvelope, "Attack [s]", param.envelopeAttackSeconds, render),
  envelopeDecaySeconds: new widget.NumberInput(
    detailPitchEnvelope, "Decay [s]", param.envelopeDecaySeconds, render),
  envelopeModAmount: new widget.NumberInput(
    detailPitchEnvelope, "Amount [oct]", param.envelopeModAmount, render),

  pitchType:
    new widget.ComboBoxLine(detailPrimary, "Pitch Type", param.pitchType, render),
  delayTimeHz:
    new widget.NumberInput(detailPrimary, "Delay [Hz]", param.delayTimeHz, render),
  delayTimeModAmount: new widget.NumberInput(
    detailPrimary, "Delay Moddulation [sample]", param.delayTimeModAmount, render),
  bandpassCutRatio:
    new widget.NumberInput(detailPrimary, "BP Cut [oct]", param.bandpassCutRatio, render),
  bandpassQ: new widget.NumberInput(detailPrimary, "BP Q", param.bandpassQ, render),

  secondaryFdnMix:
    new widget.NumberInput(detailSecondary, "Mix", param.secondaryFdnMix, render),
  secondaryPitchOffset: new widget.NumberInput(
    detailSecondary, "Pitch Offset [oct]", param.secondaryPitchOffset, render),
  secondaryQOffset: new widget.NumberInput(
    detailSecondary, "Q Offset [oct]", param.secondaryQOffset, render),
  secondaryDistance: new widget.NumberInput(
    detailSecondary, "Collision Distance", param.secondaryDistance, render),
  secondaryStatus: widget.paragraph(detailSecondary, "secondaryStatus", undefined),
};

// ui.crossFeedbackRatio.sliderZero = 0.5;
ui.wireStatus.textContent = "Wire collision status will be shown here.";
ui.wireStatus.style.textAlign = "center";
ui.secondaryStatus.textContent = "Membrane collision status will be shown here.";
ui.secondaryStatus.style.textAlign = "center";

onMatrixSizeChanged(param.matrixSize.defaultDsp);
window.addEventListener("load", (ev) => { widget.refresh(ui); });
