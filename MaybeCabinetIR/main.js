// Copyright 2022 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {uiSize} from "../common/gui/palette.js";
import * as widget from "../common/gui/widget.js";
import * as parameter from "../common/parameter.js";
import {
  ampToDB,
  dbToAmp,
  exponentialMap,
  uniformDistributionMap
} from "../common/util.js";
import * as wave from "../common/wave.js";

import {EqualizerXYPad} from "./equalizerxypad.js";
import * as menuitems from "./menuitems.js";

function randomEq(prm, lowHz, highHz, lowQ, highQ, lowDB, highDB) {
  const cutoffHz = prm[0];
  cutoffHz.dsp = exponentialMap(Math.random(), lowHz, highHz);
  console.log(cutoffHz);

  const Q = prm[1];
  Q.dsp = exponentialMap(Math.random(), lowQ, highQ);

  const gain = prm[2];
  gain.ui = uniformDistributionMap(Math.random(), lowDB, highDB);
}

function randomize() {
  for (const key in param) {
    if (key === "renderSamples") continue;
    if (key === "fadeIn") continue;
    if (key === "fadeOut") continue;
    if (key === "sourceLowpassCutoffHz") {
      param[key].dsp = exponentialMap(Math.random(), 100, 12000);
      continue;
    }
    if (key === "sourceLowpassQ") {
      param[key].dsp = exponentialMap(Math.random(), Math.SQRT2 / 8, Math.SQRT2);
      continue;
    }
    if (key.includes("dcHighpass")) {
      randomEq(param[key], 10, 120, 0.5, 10, 0, 0);
      continue;
    }
    if (key.includes("nyquistLowpass")) {
      randomEq(param[key], 4000, 20000, 0.5, 4, 0, 0);
      continue;
    }
    if (key.includes("peak1")) {
      randomEq(param[key], 80, 200, 0.5, 4, 10, 30);
      continue;
    }
    if (key.includes("peak2")) {
      randomEq(param[key], 300, 1000, 0.1, 100, -60, 10);
      continue;
    }
    if (key.includes("peak3")) {
      randomEq(param[key], 1000, 3000, 0.5, 4, 0, 30);
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

function render() {
  audio.render(
    parameter.toMessage(param, {
      sampleRate: audio.audioContext.sampleRate,
    }),
    "link",
    togglebuttonQuickSave.state === 1,
  );
}

function createEqulizerParameters(cutoffHz, Q, gainDB) {
  return [
    new parameter.Parameter(cutoffHz, scales.cutoffHz, true),
    new parameter.Parameter(Q, scales.Q, true),
    new parameter.Parameter(dbToAmp(gainDB), scales.gain, false),
  ];
}

const audio = new wave.Audio(
  1,
  "./renderer.js",
  undefined,
  (wave) => {
    for (let i = 0; i < waveView.length; ++i) waveView[i].set(wave.data[i]);
  },
);

const scales = {
  renderSamples: new parameter.IntScale(0, 2 ** 16),
  seed: new parameter.IntScale(0, 2 ** 32),

  cutoffHz: new parameter.DecibelScale(ampToDB(10), ampToDB(30000), false),
  Q: new parameter.DecibelScale(ampToDB(0.01), ampToDB(100), false),
  gain: new parameter.DecibelScale(-60, 60, true),
};

const param = {
  renderSamples: new parameter.Parameter(2 ** 15, scales.renderSamples, true),
  fadeIn: new parameter.Parameter(0, scales.renderSamples, true),
  fadeOut: new parameter.Parameter(256, scales.renderSamples, true),

  sourceLowpassCutoffHz: new parameter.Parameter(4000, scales.cutoffHz, true),
  sourceLowpassQ: new parameter.Parameter(1, scales.Q, true),

  dcHighpass: createEqulizerParameters(20, Math.SQRT1_2, 0),
  nyquistLowpass: createEqulizerParameters(7000, Math.SQRT1_2, 0),

  peak1: createEqulizerParameters(120, Math.SQRT1_2, 30),
  peak2: createEqulizerParameters(500, 10, -60),
  peak3: createEqulizerParameters(1500, 3 * Math.SQRT1_2, 20),
  // peak4: createEqulizerParameters(200, Math.SQRT1_2, 0),
  // peak5: createEqulizerParameters(3000, Math.SQRT1_2, 0),

  seed: new parameter.Parameter(0, scales.seed),
};

// Add controls.
const pageTitle = widget.pageTitle(document.body);
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
const detailSource = widget.details(divLeft, "Source");
const detailGainPeak = widget.details(divRight, "Gain Peak");

const ui = {
  renderSamples: new widget.NumberInput(
    detailRender, "Duration [sample]", param.renderSamples, render),
  fadeIn: new widget.NumberInput(detailRender, "Fade-in [sample]", param.fadeIn, render),
  fadeOut:
    new widget.NumberInput(detailRender, "Fade-out [sample]", param.fadeOut, render),

  seed: new widget.NumberInput(detailSource, "Seed", param.seed, render),
  sourceLowpassCutoffHz: new widget.NumberInput(
    detailSource, "LP Cutoff [Hz]", param.sourceLowpassCutoffHz, render),
  sourceLowpassQ:
    new widget.NumberInput(detailSource, "LP Q", param.sourceLowpassQ, render),

  eq: new EqualizerXYPad(
    detailGainPeak, audio.audioContext.sampleRate, 4 * uiSize.waveViewWidth,
    4 * uiSize.waveViewHeight, "Peaking Filters", scales.cutoffHz, scales.Q, scales.gain,
    [
      param.dcHighpass, param.nyquistLowpass, param.peak1, param.peak2, param.peak3,
      // param.peak4, param.peak5,
    ],
    render),
};

render();
window.addEventListener("load", (ev) => { widget.refresh(ui); });
