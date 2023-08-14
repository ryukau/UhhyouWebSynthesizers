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
      if (key === "dcHighpassHz") continue;
      if (key === "toneSlope") continue;

      if (key === "notchInvert") {
        param[key].normalized = Math.random();
        continue;
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
  stereoMerge: new parameter.LinearScale(0, 1),
  overSample: new parameter.MenuItemScale(menuitems.oversampleItems),
  toneSlope: new parameter.DecibelScale(-12, 0, false),

  seed: new parameter.IntScale(0, 2 ** 32),
  noiseDistribution: new parameter.MenuItemScale(menuitems.noiseDistributionItems),
  cutoffHz: new parameter.DecibelScale(util.ampToDB(20), util.ampToDB(20000), false),

  combHz: new parameter.DecibelScale(util.ampToDB(20), util.ampToDB(4000), false),
  combRandomOctave: new parameter.LinearScale(0, 2),
  combFrequencySpread: new parameter.LinearScale(0, 1),

  notchCount: new parameter.IntScale(1, 32),
  notchNarrowness: new parameter.NegativeDecibelScale(-60, 0, 1, true),
  notchStepSizeScale: new parameter.DecibelScale(-20, 20, false),
  notchInvert: new parameter.MenuItemScale(menuitems.notchInvertItems),
};

const param = {
  renderDuration: new parameter.Parameter(0.5, scales.renderDuration, true),
  fadeIn: new parameter.Parameter(0.0, scales.fade, true),
  fadeOut: new parameter.Parameter(0.002, scales.fade, true),
  decayTo: new parameter.Parameter(1, scales.decayTo, false),
  stereoMerge: new parameter.Parameter(0, scales.stereoMerge),
  overSample: new parameter.Parameter(1, scales.overSample),
  toneSlope: new parameter.Parameter(1, scales.toneSlope, false),

  seed: new parameter.Parameter(0, scales.seed, true),
  noiseDistribution: new parameter.Parameter(0, scales.noiseDistribution),
  bandpassCutoffHz: new parameter.Parameter(1000, scales.cutoffHz, true),

  combCount: new parameter.Parameter(8, scales.notchCount, true),
  highpassCutoffHz: new parameter.Parameter(100, scales.cutoffHz, true),
  combBaseHz: new parameter.Parameter(100, scales.combHz, true),
  combRandomOctave: new parameter.Parameter(1, scales.combRandomOctave, true),
  combFrequencySpread: new parameter.Parameter(1, scales.combFrequencySpread, true),

  notchCount: new parameter.Parameter(32, scales.notchCount, true),
  notchNarrowness: new parameter.Parameter(0.99, scales.notchNarrowness, true),
  notchStepSizeScale: new parameter.Parameter(1, scales.notchStepSizeScale, true),
  notchInvert: new parameter.Parameter(0, scales.notchInvert, true),
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
const buttonPlay = widget.Button(divPlayControl, "Play", (ev) => { audio.play(); });
const buttonStop = widget.Button(divPlayControl, "Stop", (ev) => { audio.stop(); });
const buttonSave = widget.Button(divPlayControl, "Save", (ev) => { audio.save(); });
const togglebuttonQuickSave = new widget.ToggleButton(
  divPlayControl, "QuickSave", undefined, undefined, 0, (ev) => {});

const detailTips = widget.details(divLeft, "Tips");
const paragraphNote1 = widget.paragraph(detailTips, undefined, undefined);
paragraphNote1.textContent
  = "When the sound becomes inaudible, lower `Oscillator -> BP Cut` or raise `Notch -> Step Size Scale`.";
const paragraphNote2 = widget.paragraph(detailTips, undefined, undefined);
paragraphNote2.textContent
  = "To reduce clicks or spikes, lower `Comb -> Base Frequency`.";

const detailRender = widget.details(divLeft, "Render");
const detailOsc = widget.details(divRightA, "Oscillator");
const detailComb = widget.details(divRightA, "Comb");
const detailNotch = widget.details(divRightA, "Notch");

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
  toneSlope:
    new widget.NumberInput(detailRender, "Tone Slope [dB/oct]", param.toneSlope, render),

  seed: new widget.NumberInput(detailOsc, "Seed", param.seed, render),
  noiseDistribution: new widget.ComboBoxLine(
    detailOsc, "Noise Distribution", param.noiseDistribution, render),
  bandpassCutoffHz:
    new widget.NumberInput(detailOsc, "BP Cut [Hz]", param.bandpassCutoffHz, render),

  combCount: new widget.NumberInput(detailComb, "Count", param.combCount, render),
  highpassCutoffHz:
    new widget.NumberInput(detailComb, "HP Cut [Hz]", param.highpassCutoffHz, render),
  combBaseHz:
    new widget.NumberInput(detailComb, "Base Frequency [Hz]", param.combBaseHz, render),
  combRandomOctave: new widget.NumberInput(
    detailComb, "Random Frequency [oct]", param.combRandomOctave, render),
  combFrequencySpread: new widget.NumberInput(
    detailComb, "Frequency Spread", param.combFrequencySpread, render),

  notchCount: new widget.NumberInput(detailNotch, "Count", param.notchCount, render),
  notchNarrowness:
    new widget.NumberInput(detailNotch, "Narrowness", param.notchNarrowness, render),
  notchStepSizeScale: new widget.NumberInput(
    detailNotch, "Step Size Scale", param.notchStepSizeScale, render),
  notchInvert: new widget.ToggleButtonLine(
    detailNotch, menuitems.notchInvertItems, param.notchInvert, render),
};

render();
window.addEventListener("load", (ev) => { widget.refresh(ui); });
