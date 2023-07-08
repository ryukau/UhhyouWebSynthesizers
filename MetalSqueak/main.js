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
    if (key === "decayTo") continue;
    if (key === "dcHighpassHz") continue;
    if (key === "toneSlope") continue;
    // if (key === "impulseGain") continue;
    if (key === "lowpassHz") continue;
    if (key === "allpassMod") {
      param[key].dsp = util.uniformDistributionMap(Math.random(), -4, 4);
      continue;
    }
    if (key === "modReductionThreshold") continue;
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

function createArrayParameters(defaultDspValue, depth, scale) {
  const base = scales.latticeSize.max;
  const size = base ** (base + 1 - depth);
  let arr = new Array(size);
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

const scales = {
  boolean: new parameter.IntScale(0, 1),

  renderDuration: new parameter.DecibelScale(-40, 40, false),
  fade: new parameter.DecibelScale(-60, 40, true),
  decayTo: new parameter.DecibelScale(util.ampToDB(1 / 2 ** 24), 0, false),
  overSample: new parameter.MenuItemScale(menuitems.oversampleItems),
  dcHighpassHz: new parameter.DecibelScale(-20, 40, true),
  toneSlope: new parameter.DecibelScale(-12, 0, false),

  seed: new parameter.IntScale(0, 2 ** 32),

  impulseGain: new parameter.DecibelScale(-40, 40, true),
  cutoffHz: new parameter.DecibelScale(0, 100, false),

  delayCount: new parameter.IntScale(1, 8),
  delayHz: new parameter.DecibelScale(util.ampToDB(200), util.ampToDB(22000), false),
  delayMod: new parameter.LinearScale(-4, 4),
  allpassCutRatio: new parameter.LinearScale(-8, 8),
  allpassMod: new parameter.LinearScale(-6, 6),
  modDecaySeconds: new parameter.DecibelScale(-40, 0, true),
  modReductionThreshold: new parameter.DecibelScale(-40, 20, true),
  modResumeRate: new parameter.DecibelScale(-140, -20, false),
  clipperScale: new parameter.DecibelScale(-20, 20, false),
};

const param = {
  renderDuration: new parameter.Parameter(2, scales.renderDuration, true),
  fadeIn: new parameter.Parameter(0, scales.fade, true),
  fadeOut: new parameter.Parameter(0.002, scales.fade, true),
  decayTo: new parameter.Parameter(1, scales.decayTo, false),
  overSample: new parameter.Parameter(1, scales.overSample),
  dcHighpassHz: new parameter.Parameter(4, scales.dcHighpassHz, true),
  toneSlope: new parameter.Parameter(1, scales.toneSlope, false),

  seed: new parameter.Parameter(0, scales.seed),

  impulseGain: new parameter.Parameter(util.dbToAmp(-10), scales.impulseGain, false),
  impulseLowpassHz: new parameter.Parameter(4000, scales.cutoffHz, true),
  impulseHighpassHz: new parameter.Parameter(20, scales.cutoffHz, true),

  fdnCount: new parameter.Parameter(4, scales.delayCount, true),
  minDelayHz: new parameter.Parameter(2000, scales.delayHz, true),
  maxDelayHz: new parameter.Parameter(8000, scales.delayHz, true),
  lowpassHz: new parameter.Parameter(70000, scales.cutoffHz, true),
  delayMod: new parameter.Parameter(0, scales.delayMod, true),
  allpass1Cut: new parameter.Parameter(0, scales.allpassCutRatio, true),
  allpass2Cut: new parameter.Parameter(0, scales.allpassCutRatio, true),
  allpassMod: new parameter.Parameter(0, scales.allpassMod, true),
  modDecaySeconds: new parameter.Parameter(1, scales.modDecaySeconds, true),
  feedbackDecaySeconds: new parameter.Parameter(0.1, scales.modDecaySeconds, true),
  modReductionThreshold: new parameter.Parameter(0.5, scales.modReductionThreshold, true),
  modResumeRate: new parameter.Parameter(0.01, scales.modResumeRate, true),
  enableClipper: new parameter.Parameter(1, scales.boolean, false),
  clipperScale: new parameter.Parameter(1, scales.clipperScale, false),
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

const pageTitle = widget.heading(document.body, 1, document.title, undefined, undefined);
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
  decayTo: new widget.NumberInput(detailRender, "Decay To [dB]", param.decayTo, render),
  overSample:
    new widget.ComboBoxLine(detailRender, "Over-sample", param.overSample, render),
  dcHighpassHz:
    new widget.NumberInput(detailRender, "DC Highpass [Hz]", param.dcHighpassHz, render),
  toneSlope:
    new widget.NumberInput(detailRender, "Tone Slope [dB/oct]", param.toneSlope, render),

  seed: new widget.NumberInput(detailRandom, "Seed", param.seed, render),

  impulseGain:
    new widget.NumberInput(detailSource, "Impulse [dB]", param.impulseGain, render),
  impulseLowpassHz:
    new widget.NumberInput(detailSource, "Lowpass [Hz]", param.impulseLowpassHz, render),
  impulseHighpassHz: new widget.NumberInput(
    detailSource, "Highpass [Hz]", param.impulseHighpassHz, render),

  fdnCount: new widget.NumberInput(detailDelay, "Quantity", param.fdnCount, render),
  minDelayHz:
    new widget.NumberInput(detailDelay, "Min. Delay [Hz]", param.minDelayHz, render),
  maxDelayHz:
    new widget.NumberInput(detailDelay, "Max. Delay [Hz]", param.maxDelayHz, render),
  lowpassHz: new widget.NumberInput(detailDelay, "Lowpass [Hz]", param.lowpassHz, render),
  delayMod: new widget.NumberInput(detailDelay, "Delay Mod.", param.delayMod, render),
  allpass1Cut:
    new widget.NumberInput(detailDelay, "Allpass 1 Cutoff", param.allpass1Cut, render),
  allpass2Cut:
    new widget.NumberInput(detailDelay, "Allpass 2 Cutoff", param.allpass2Cut, render),
  allpassMod:
    new widget.NumberInput(detailDelay, "Allpass Mod.", param.allpassMod, render),
  modDecaySeconds:
    new widget.NumberInput(detailDelay, "Mod. Decay", param.modDecaySeconds, render),
  feedbackDecaySeconds: new widget.NumberInput(
    detailDelay, "Feedback Decay", param.feedbackDecaySeconds, render),
  modReductionThreshold: new widget.NumberInput(
    detailDelay, "Mod. Threshold", param.modReductionThreshold, render),
  modResumeRate:
    new widget.NumberInput(detailDelay, "Mod. Resume Rate", param.modResumeRate, render),
  enableClipper: new widget.ToggleButtonLine(
    detailDelay, menuitems.enableClipperItems, param.enableClipper, render),
  clipperScale:
    new widget.NumberInput(detailDelay, "Clip Scale [dB]", param.clipperScale, render),
};

render();
