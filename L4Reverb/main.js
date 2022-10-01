// Copyright 2022 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {uiSize} from "../common/gui/palette.js";
import * as widget from "../common/gui/widget.js";
import * as parameter from "../common/parameter.js";
import * as wave from "../common/wave.js";

import * as menuitems from "./menuitems.js";

function randomize() {
  for (const key in param) {
    if (key === "renderDuration") continue;
    if (key === "fadeIn") continue;
    if (key === "fadeOut") continue;
    if (key === "latticeSize") continue;
    if (key === "delayTime") {
      param[key].forEach(e => { e.dsp = 0.01 + 0.01 * Math.random() - 0.005; });
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
      maxDelayTime: scales.delayTime.maxDsp,
    }),
    "link",
    togglebuttonQuickSave.state === 1,
  );
}

function onMatrixSizeChanged(value) {
  ui.delayTime.setViewRange(0, value);
  ui.lowpassCutoffHz.setViewRange(0, value);
  ui.highpassCutoffHz.setViewRange(0, value);
  render();
}

const scales = {
  renderDuration: new parameter.DecibelScale(-40, 40, false),
  fade: new parameter.DecibelScale(-60, 40, true),
  overSample: new parameter.MenuItemScale(menuitems.oversampleItems),

  latticeSize: new parameter.IntScale(2, 4),
  seed: new parameter.IntScale(0, 2 ** 32),

  delayTime: new parameter.DecibelScale(-60, 0, true),
  feed: new parameter.LinearScale(-1, 1),
  randomAmount: new parameter.LinearScale(0, 1),
};

const param = {
  renderDuration: new parameter.Parameter(1, scales.renderDuration, true),
  fadeIn: new parameter.Parameter(0.001, scales.fade, true),
  fadeOut: new parameter.Parameter(0.002, scales.fade, true),
  overSample: new parameter.Parameter(0, scales.overSample),

  latticeSize: new parameter.Parameter(3, scales.latticeSize),
  seed: new parameter.Parameter(0, scales.seed),

  delayTime: createArrayParameters(0.01, 1, scales.delayTime),
  delayRandom: new parameter.Parameter(0.5, scales.randomAmount, true),

  innerFeedRandom: new parameter.Parameter(0.05, scales.randomAmount, true),
  l1FeedRandom: new parameter.Parameter(0, scales.randomAmount, true),
  l2FeedRandom: new parameter.Parameter(0, scales.randomAmount, true),
  l3FeedRandom: new parameter.Parameter(0, scales.randomAmount, true),
  l4FeedRandom: new parameter.Parameter(0, scales.randomAmount, true),

  innerFeed: createArrayParameters(0, 1, scales.feed),
  l1Feed: createArrayParameters(0, 1, scales.feed),
  l2Feed: createArrayParameters(0, 2, scales.feed),
  l3Feed: createArrayParameters(0, 3, scales.feed),
  l4Feed: createArrayParameters(0, 4, scales.feed),
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
const detailReverb = widget.details(divLeft, "Reverb");
const detailOffset = widget.details(divLeft, "Stereo Random Amount");
const detailBaseA = widget.details(divRightA, "Base Value A");
const detailBaseB = widget.details(divRightB, "Base Value B");

const ui = {
  renderDuration:
    new widget.NumberInput(detailRender, "Duration [s]", param.renderDuration, render),
  fadeIn: new widget.NumberInput(detailRender, "Fade-in [s]", param.fadeIn, render),
  fadeOut: new widget.NumberInput(detailRender, "Fade-out [s]", param.fadeOut, render),
  overSample:
    new widget.ComboBoxLine(detailRender, "Over-sample", param.overSample, render),

  latticeSize:
    new widget.NumberInput(detailReverb, "Lattice Size", param.latticeSize, render),
  seed: new widget.NumberInput(detailReverb, "Seed", param.seed, render),

  delayRandom:
    new widget.NumberInput(detailOffset, "Delay Time [s]", param.delayRandom, render),
  innerFeedRandom:
    new widget.NumberInput(detailOffset, "Inner Feed", param.innerFeedRandom, render),
  l1FeedRandom:
    new widget.NumberInput(detailOffset, "L1 Feed", param.l1FeedRandom, render),
  l2FeedRandom:
    new widget.NumberInput(detailOffset, "L2 Feed", param.l2FeedRandom, render),
  l3FeedRandom:
    new widget.NumberInput(detailOffset, "L3 Feed", param.l3FeedRandom, render),
  l4FeedRandom:
    new widget.NumberInput(detailOffset, "L4 Feed", param.l4FeedRandom, render),

  delayTime: new widget.BarBox(
    detailBaseA, "Delay Time [s]", uiSize.barboxWidth, uiSize.barboxHeight,
    param.delayTime, render),
  innerFeed: new widget.BarBox(
    detailBaseA, "Inner Feed", uiSize.barboxWidth, uiSize.barboxHeight, param.innerFeed,
    render),
  l1Feed: new widget.BarBox(
    detailBaseA, "L1 Feed", uiSize.barboxWidth, uiSize.barboxHeight, param.l1Feed,
    render),
  l2Feed: new widget.BarBox(
    detailBaseB, "L2 Feed", uiSize.barboxWidth, uiSize.barboxHeight, param.l2Feed,
    render),
  l3Feed: new widget.BarBox(
    detailBaseB, "L3 Feed", uiSize.barboxWidth, uiSize.barboxHeight, param.l3Feed,
    render),
  l4Feed: new widget.BarBox(
    detailBaseB, "L4 Feed", uiSize.barboxWidth, uiSize.barboxHeight, param.l4Feed,
    render),
};

ui.innerFeed.sliderZero = 0.5;
ui.l1Feed.sliderZero = 0.5;
ui.l2Feed.sliderZero = 0.5;
ui.l3Feed.sliderZero = 0.5;
ui.l4Feed.sliderZero = 0.5;

render();
// onMatrixSizeChanged(param.latticeSize.defaultDsp);
