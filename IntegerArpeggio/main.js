// Copyright 2023 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {palette, uiSize} from "../common/gui/palette.js";
import * as widget from "../common/gui/widget.js";
import * as parameter from "../common/parameter.js";
import * as util from "../common/util.js";
import * as wave from "../common/wave.js";

import * as menuitems from "./menuitems.js";
import {justIntonationTable} from "./shared.js"
import {WaveformXYPad} from "./waveformxypad.js";

function randomize() {
  for (const key in param) {
    if (key === "octaveStart") continue;
    if (key === "octaveRange") continue;
    if (key === "basePeriod") {
      // param[key].normalized = Math.random();
      continue;
    }
    if (key === "decayTo") continue;
    if (key === "oscSync") continue;
    if (key === "arpeggioDurationSeconds") continue;
    if (key === "arpeggioDecayTo") continue;
    if (key === "arpeggioNotes") continue;
    if (Array.isArray(param[key])) {
      param[key].forEach(e => { e.normalized = Math.random(); });
    } else if (param[key].scale instanceof parameter.MenuItemScale) {
      // Do nothing for now.
    } else {
      param[key].normalized = Math.random();
    }
  }

  ui.waveform.randomize();

  render();
  widget.refresh(ui);
}

function createArrayParameters(defaultDspValues, size, scale) {
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
      a: ui.waveform.coefficients(),
    }),
    "perChannel",
    togglebuttonQuickSave.state === 1,
  );
}

const scales = {
  boolean: new parameter.IntScale(0, 1),

  octaveStart: new parameter.IntScale(-12, 0),
  octaveRange: new parameter.IntScale(1, 12),
  basePeriod: new parameter.MenuItemScale(menuitems.basePeriodItems),
  overSample: new parameter.MenuItemScale(menuitems.oversampleItems),

  seed: new parameter.IntScale(0, 2 ** 32),
  oscSync: new parameter.LinearScale(0, 1),
  fmIndex: new parameter.DecibelScale(-60, 40, true),

  arpeggioDurationSeconds: new parameter.DecibelScale(-40, 0, false),
  arpeggioDecayTo: new parameter.DecibelScale(-60, 0, false),
};

const param = {
  octaveStart: new parameter.Parameter(-8, scales.octaveStart, true),
  octaveRange: new parameter.Parameter(4, scales.octaveRange, true),
  basePeriod: new parameter.Parameter(0, scales.basePeriod),
  overSample: new parameter.Parameter(0, scales.overSample),

  seed: new parameter.Parameter(0, scales.seed, true),
  oscSync: new parameter.Parameter(1, scales.oscSync, true),
  fmIndex: new parameter.Parameter(0, scales.fmIndex, true),

  arpeggioDurationSeconds:
    new parameter.Parameter(0.1, scales.arpeggioDurationSeconds, true),
  arpeggioDecayTo:
    new parameter.Parameter(util.dbToAmp(-6), scales.arpeggioDecayTo, false),
  arpeggioNotes: createArrayParameters(
    [
      1, // 0
      0, // 1
      0, // 1 (7-limit)
      0, // 1 (17-limit)
      0, // 2 (5-limit, less just)
      0, // 2
      1, // 2 (7 or 17-limit)
      0, // 3
      1, // 4
      1, // 5
      0, // 6 aug. (5-limit, less just)
      0, // 6 aug. Pairs with 11.
      0, // 6 aug. (7-limit)
      0, // 6 aug. (17-limit)
      0, // 6 dim. (5-limit, less just)
      0, // 6 dim. Pairs with 1.
      0, // 6 dim. (7-limit)
      0, // 6 dim. (17-limit)
      1, // 7
      0, // 8
      1, // 9
      0, // 10 (5-limit, less just)
      0, // 10
      0, // 10 (7 or 17-limit)
      0, // 11
      1, // 11 (17-limit)
    ],
    justIntonationTable.length, scales.boolean),
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
const detailOsc = widget.details(divRightA, "Oscillator");
const detailWaveform = widget.details(divRightA, "Waveform");
const detailArpeggio = widget.details(divRightB, "Arpeggio");

const ui = {
  octaveStart:
    new widget.NumberInput(detailRender, "Octave Start", param.octaveStart, render),
  octaveRange:
    new widget.NumberInput(detailRender, "Octave Range", param.octaveRange, render),
  basePeriod: new widget.ComboBoxLine(
    detailRender, "Base Period [sample]", param.basePeriod, render),
  overSample:
    new widget.ComboBoxLine(detailRender, "Over-sample", param.overSample, render),

  seed: new widget.NumberInput(detailOsc, "Seed", param.seed, render),
  oscSync: new widget.NumberInput(detailOsc, "Sync.", param.oscSync, render),
  fmIndex: new widget.NumberInput(detailOsc, "FM Index", param.fmIndex, render),

  waveform: new WaveformXYPad(
    detailWaveform, 2 * uiSize.waveViewWidth, 2 * uiSize.waveViewHeight, "Waveform", 13,
    render),

  arpeggioDurationSeconds: new widget.NumberInput(
    detailArpeggio, "Duration [s]", param.arpeggioDurationSeconds, render),
  arpeggioDecayTo: new widget.NumberInput(
    detailArpeggio, "Decay To [dB]", param.arpeggioDecayTo, render),

  arpeggioNotes: new widget.MultiCheckBoxVertical(
    detailArpeggio, "Notes in Scale (Just Intonation, Semitone)",
    [
      " 1 / 1  ,  0",
      "16 / 15 ,  1",
      "15 / 14 ,  1 (7-limit)",
      "14 / 13 ,  1 (17-limit)",
      "10 / 9  ,  2 (5-limit, less just)",
      " 9 / 8  ,  2",
      " 8 / 7  ,  2 (7 or 17-limit)",
      " 6 / 5  ,  3",
      " 5 / 4  ,  4",
      " 4 / 3  ,  5",
      "45 / 32 ,  6 aug. (5-limit, less just)",
      "25 / 18 ,  6 aug. Pairs with 11.",
      " 7 / 5  ,  6 aug. (7-limit)",
      "17 / 12 ,  6 aug. (17-limit)",
      "64 / 45 ,  6 dim. (5-limit, less just)",
      "36 / 25 ,  6 dim. Pairs with 1.",
      "10 / 7  ,  6 dim. (7-limit)",
      "24 / 17 ,  6 dim. (17-limit)",
      " 3 / 2  ,  7",
      " 8 / 5  ,  8",
      " 5 / 3  ,  9",
      "16 / 9  ,  10 (5-limit, less just)",
      " 9 / 5  ,  10",
      " 7 / 4  ,  10 (7 or 17-limit)",
      "15 / 8  ,  11",
      "13 / 7  ,  11 (17-limit)",
    ],
    2 * uiSize.waveViewWidth, param.arpeggioNotes, render),
};

render();
