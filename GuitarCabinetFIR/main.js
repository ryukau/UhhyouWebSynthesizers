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
    "link",
    togglebuttonQuickSave.state === 1,
  );
}

const scales = {
  renderDuration: new parameter.DecibelScale(-40, 40, false),
  fade: new parameter.DecibelScale(-60, 40, true),
  seed: new parameter.IntScale(0, 2 ** 32),
};

const param = {
  renderDuration: new parameter.Parameter(1, scales.renderDuration, true),
  fadeIn: new parameter.Parameter(0, scales.fade, true),
  fadeOut: new parameter.Parameter(0.001, scales.fade, true),

  seed: new parameter.Parameter(0, scales.seed),
};

// Add controls.
const audio = new wave.Audio(
  1,
  "./renderer.js",
  undefined,
  (wave) => {
    for (let i = 0; i < waveView.length; ++i) waveView[i].set(wave.data[i]);
  },
);

const pageTitle = widget.heading(document.body, 1, document.title, undefined, undefined);
const divMain = widget.div(document.body, "main", undefined);

const divLeft = widget.div(divMain, undefined, "controlBlock");
const divRight = widget.div(divMain, undefined, "controlBlock");

const headingWaveform = widget.heading(divLeft, 6, "Waveform");
const waveView = [
  new widget.WaveView(
    divLeft, 2 * uiSize.waveViewWidth, 2 * uiSize.waveViewHeight, audio.wave.data[0],
    false),
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
const detailGainResponse = widget.details(divRight, "Gain Response");

const ui = {
  renderDuration:
    new widget.NumberInput(detailRender, "Duration [s]", param.renderDuration, render),
  fadeIn: new widget.NumberInput(detailRender, "Fade-in [s]", param.fadeIn, render),
  fadeOut: new widget.NumberInput(detailRender, "Fade-out [s]", param.fadeOut, render),
  seed: new widget.NumberInput(detailRender, "Seed", param.seed, render),
};

render();
