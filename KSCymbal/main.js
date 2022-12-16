// Copyright 2022 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {uiSize} from "../common/gui/palette.js";
import * as widget from "../common/gui/widget.js";
import * as parameter from "../common/parameter.js";
import * as util from "../common/util.js";
import * as wave from "../common/wave.js";

import * as menuitems from "./menuitems.js";

function randomize() {
  if (selectRandom.value === "Seed") {
    param.seed.normalized = Math.random();
  } else { // selectRandom.value  === "Default"
    for (const key in param) {
      if (key === "renderDuration") continue;
      if (key === "overSample") continue;
      if (key === "fadeOut") continue;
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
  bipolarScale: new parameter.LinearScale(-1, 1),

  renderDuration: new parameter.DecibelScale(-40, 40, false),
  overSample: new parameter.MenuItemScale(menuitems.oversampleItems),
  seed: new parameter.IntScale(0, Number.MAX_SAFE_INTEGER),

  stack: new parameter.IntScale(2, 64),
  maxFrequency: new parameter.DecibelScale(20, 60, false),
  pickCombFB: new parameter.NegativeDecibelScale(-60, 0, 1, true),
  pickCombTime:
    new parameter.DecibelScale(util.ampToDB(2 ** -2), util.ampToDB(2 ** 6), false),
  distance: new parameter.DecibelScale(util.ampToDB(0.004), util.ampToDB(0.2), true),
};

const param = {
  renderDuration: new parameter.Parameter(1, scales.renderDuration, true),
  overSample: new parameter.Parameter(0, scales.overSample),
  fadeOutRatio: new parameter.Parameter(0.6, scales.defaultScale, true),
  seed: new parameter.Parameter(0, scales.seed),

  stack: new parameter.Parameter(24, scales.stack),
  maxFrequency: new parameter.Parameter(200, scales.maxFrequency, true),
  pickCombFB: new parameter.Parameter(0.3, scales.pickCombFB, true),
  pickCombTime: new parameter.Parameter(1, scales.pickCombTime, true),
  distance: new parameter.Parameter(0.02, scales.distance, true),
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
  divPlayControl, "Randomize Recipe", "randomRecipe", undefined, ["Default", "Seed"],
  "Seed", (ev) => { randomize(); });
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

const ui = {
  renderDuration:
    new widget.NumberInput(detailRender, "Duration [s]", param.renderDuration, render),
  overSample:
    new widget.ComboBoxLine(detailRender, "Over-sample", param.overSample, render),
  fadeOutRatio:
    new widget.NumberInput(detailRender, "Fade-out Ratio", param.fadeOutRatio, render),
  seed: new widget.NumberInput(detailRender, "Seed", param.seed, render),

  stack: new widget.NumberInput(detailRender, "Stack", param.stack, render),
  maxFrequency:
    new widget.NumberInput(detailRender, "Max Frequency", param.maxFrequency, render),
  pickCombFB:
    new widget.NumberInput(detailRender, "PickCombFB", param.pickCombFB, render),
  pickCombTime:
    new widget.NumberInput(detailRender, "PickCombTime", param.pickCombTime, render),
  distance: new widget.NumberInput(detailRender, "Distance", param.distance, render),
};

render();
