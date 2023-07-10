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
  } else { // selectRandom.value === "All"
    for (const key in param) {
      if (key === "renderDuration") continue;
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

const scales = {
  defaultScale: new parameter.LinearScale(0, 1),

  renderDuration: new parameter.DecibelScale(-40, 40, false),
  fade: new parameter.DecibelScale(-60, 40, true),
  decayTo: new parameter.DecibelScale(util.ampToDB(1 / 2 ** 24), 0, false),
  overSample: new parameter.MenuItemScale(menuitems.oversampleItems),
  seed: new parameter.IntScale(0, 2 ** 53),

  limiterActive: new parameter.MenuItemScale(menuitems.limiterOnOffItems),
  limiterThreshold: new parameter.DecibelScale(-60, 60, false),

  nNode: new parameter.IntScale(4, 1000),
  lengthMeter: new parameter.LinearScale(0.1, 1),
  waveSpeed: new parameter.DecibelScale(0, 80, false),
  damping: new parameter.DecibelScale(-20, 60, true),
  wallDistance: new parameter.DecibelScale(-80, -40, true),
  restitution: new parameter.LinearScale(0, 2),
  pullUpDistance: new parameter.DecibelScale(-80, -40, false),

  nWire: new parameter.IntScale(1, 16),
  feedback: new parameter.DecibelScale(-80, -20, true),
};

const param = {
  renderDuration: new parameter.Parameter(Math.E / 10, scales.renderDuration, true),
  fadeIn: new parameter.Parameter(0.0, scales.fade, true),
  fadeOut: new parameter.Parameter(0.002, scales.fade, true),
  decayTo: new parameter.Parameter(1, scales.decayTo, false),
  overSample: new parameter.Parameter(2, scales.overSample),
  seed: new parameter.Parameter(0, scales.seed),

  limiterActive: new parameter.Parameter(0, scales.limiterActive, true),
  limiterThreshold: new parameter.Parameter(1, scales.limiterThreshold, false),

  nNode: new parameter.Parameter(1000, scales.nNode),
  lengthMeter: new parameter.Parameter(0.5, scales.lengthMeter),
  waveSpeed: new parameter.Parameter(20, scales.waveSpeed, true),
  damping: new parameter.Parameter(50, scales.damping, true),
  wallDistance: new parameter.Parameter(0.0001, scales.wallDistance, true),
  restitution: new parameter.Parameter(0.5, scales.restitution),
  pickUpPoint: new parameter.Parameter(0.5, scales.defaultScale),
  pullUpPoint: new parameter.Parameter(0.5, scales.defaultScale),
  pullUpDistance: new parameter.Parameter(0.001, scales.pullUpDistance, true),
  pullUpWidth: new parameter.Parameter(1, scales.defaultScale),

  nWire: new parameter.Parameter(1, scales.nWire),
  feedback: new parameter.Parameter(0, scales.feedback, true),
  pickUpRandomRange: new parameter.Parameter(0.5, scales.defaultScale),
  pullUpRandomRange: new parameter.Parameter(0.5, scales.defaultScale),
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
const detailWave = widget.details(divRight, "Wave");
const detailMisc = widget.details(divRight, "Misc.");

const ui = {
  renderDuration:
    new widget.NumberInput(detailRender, "Duration [s]", param.renderDuration, render),
  fadeIn: new widget.NumberInput(detailRender, "Fade-in [s]", param.fadeIn, render),
  fadeOut: new widget.NumberInput(detailRender, "Fade-out [s]", param.fadeOut, render),
  decayTo: new widget.NumberInput(detailRender, "Decay To [dB]", param.decayTo, render),
  overSample:
    new widget.ComboBoxLine(detailRender, "Over-sample", param.overSample, render),
  seed: new widget.NumberInput(detailRender, "Seed", param.seed, render),

  limiterActive: new widget.ToggleButtonLine(
    detailLimiter, menuitems.limiterOnOffItems, param.limiterActive, render),
  limiterThreshold: new widget.NumberInput(
    detailLimiter, "Threshold [dB]", param.limiterThreshold, render),

  nNode: new widget.NumberInput(detailWave, "nNode", param.nNode, render),
  lengthMeter:
    new widget.NumberInput(detailWave, "Wire Length [m]", param.lengthMeter, render),
  waveSpeed:
    new widget.NumberInput(detailWave, "Wave Speed [m/s]", param.waveSpeed, render),
  damping: new widget.NumberInput(detailWave, "Damping", param.damping, render),
  wallDistance:
    new widget.NumberInput(detailWave, "Distance [m]", param.wallDistance, render),
  restitution:
    new widget.NumberInput(detailWave, "Restitution", param.restitution, render),
  pickUpPoint:
    new widget.NumberInput(detailWave, "Pick-up Point", param.pickUpPoint, render),
  pullUpPoint:
    new widget.NumberInput(detailWave, "Pull-up Point", param.pullUpPoint, render),
  pullUpDistance: new widget.NumberInput(
    detailWave, "Pull-up Distance [m]", param.pullUpDistance, render),
  pullUpWidth:
    new widget.NumberInput(detailWave, "Pull-up Width", param.pullUpWidth, render),

  nWire: new widget.NumberInput(detailMisc, "nWire", param.nWire, render),
  feedback: new widget.NumberInput(detailMisc, "Feedback", param.feedback, render),
  pickUpRandomRange:
    new widget.NumberInput(detailMisc, "Pick-up Random", param.pickUpRandomRange, render),
  pullUpRandomRange:
    new widget.NumberInput(detailMisc, "Pull-up Random", param.pullUpRandomRange, render),
};

render();
