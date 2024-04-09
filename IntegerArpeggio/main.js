// Copyright 2023 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

/*
There's a bug that `sampleRateScaler` affects duration and octave.
*/

import {palette, uiSize} from "../common/gui/palette.js";
import * as widget from "../common/gui/widget.js";
import * as parameter from "../common/parameter.js";
import * as util from "../common/util.js";
import * as wave from "../common/wave.js";

import * as menuitems from "./menuitems.js";
import {constructIntJustScale, justIntonationTable} from "./shared.js"

const version = 0;

const localRecipeBook = {
  "Default": {
    octaveStart: () => {},
    octaveRange: () => {},
    basePeriod: () => {},
    overSample: () => {},
    sampleRateScaler: () => {},
    addSpace: () => {},
    oscSync: () => {},
    fmDecay: () => {},
    arpeggioDurationSeconds: () => {},
    arpeggioDecayTo: () => {},
    arpeggioNotes: () => {},
  },
};

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
      a: ui.waveform.coefficients(false),
    }),
    "perChannel",
    playControl.togglebuttonQuickSave.state === 1,
  );
}

const scales = {
  boolean: new parameter.IntScale(0, 1),

  octaveStart: new parameter.IntScale(-12, 0),
  octaveRange: new parameter.IntScale(1, 12),
  basePeriod: new parameter.MenuItemScale(menuitems.basePeriodItems),
  overSample: new parameter.MenuItemScale(menuitems.oversampleItems),
  sampleRateScaler: new parameter.MenuItemScale(menuitems.sampleRateScalerItems),

  seed: new parameter.IntScale(0, 2 ** 32),
  oscSync: new parameter.LinearScale(0, 1),
  fmIndex: new parameter.DecibelScale(-60, 40, true),
  fmDecay: new parameter.DecibelScale(-60, 0, false),
  fmUpdateCycle: new parameter.IntScale(2, 16),
  saturationGain: new parameter.DecibelScale(0, 40, true),

  arpeggioDurationSeconds: new parameter.DecibelScale(-40, 20, false),
  arpeggioDecayTo: new parameter.DecibelScale(-60, 0, false),
};

const param = {
  octaveStart: new parameter.Parameter(-8, scales.octaveStart, true),
  octaveRange: new parameter.Parameter(4, scales.octaveRange, true),
  basePeriod: new parameter.Parameter(0, scales.basePeriod),
  overSample: new parameter.Parameter(0, scales.overSample),
  sampleRateScaler: new parameter.Parameter(0, scales.sampleRateScaler),
  addSpace: new parameter.Parameter(1, scales.boolean),

  seed: new parameter.Parameter(0, scales.seed, true),
  oscSync: new parameter.Parameter(0, scales.oscSync, true),
  fmIndex: new parameter.Parameter(0, scales.fmIndex, true),
  fmDecay: new parameter.Parameter(1, scales.fmDecay, false),
  fmUpdateCycle: new parameter.Parameter(4, scales.fmUpdateCycle, false),
  saturationGain: new parameter.Parameter(0, scales.saturationGain, false),

  arpeggioDurationSeconds:
    new parameter.Parameter(0.3, scales.arpeggioDurationSeconds, true),
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

const recipeBook
  = parameter.addLocalRecipes(localRecipeBook, await parameter.loadJson(param, []));

function getSampleRateScaler() {
  return parseInt(menuitems.sampleRateScalerItems[param.sampleRateScaler.dsp]);
}

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

const recipeExportDialog = new widget.RecipeExportDialog(document.body, (ev) => {
  parameter.downloadJson(
    param, version, recipeExportDialog.author, recipeExportDialog.recipeName);
});
const recipeImportDialog = new widget.RecipeImportDialog(document.body, (ev, data) => {
  widget.option(playControl.selectRandom, parameter.addRecipe(param, recipeBook, data));
});

const playControl = widget.playControl(
  divLeft,
  (ev) => { audio.play(getSampleRateScaler()); },
  (ev) => { audio.stop(); },
  (ev) => {
    const notes = constructIntJustScale(
      parseInt(menuitems.basePeriodItems[param.basePeriod.dsp]), param.octaveStart.dsp,
      param.octaveRange.dsp, param.arpeggioNotes.map(element => element.dsp));
    const cue = new Array(notes.length);
    const bytesPerFrame = audio.wave.channels * 4; // 4 bytes for 32 bit float.
    const bufferLengthByte = bytesPerFrame * audio.wave.frames;
    const noteDuration = Math.floor(bufferLengthByte / cue.length);
    const lastFrameByte = bufferLengthByte - bytesPerFrame;
    for (let idx = 0; idx < cue.length; ++idx) {
      cue[idx] = {
        start: idx * noteDuration,
        end: Math.min((idx + 1) * noteDuration - bytesPerFrame, lastFrameByte),
      }
    }

    audio.save(false, cue, getSampleRateScaler());
  },
  (ev) => {},
  (ev) => {
    recipeBook.get(playControl.selectRandom.value).randomize(param);
    ui.waveform.randomize(); // Specific to this synth.
    render();
    widget.refresh(ui);
  },
  [...recipeBook.keys()],
  (ev) => {
    const recipeOptions = {author: "temp", recipeName: util.getTimeStamp()};
    const currentRecipe = parameter.dumpJsonObject(param, version, recipeOptions);
    const optionName = parameter.addRecipe(param, recipeBook, currentRecipe);
    widget.option(playControl.selectRandom, optionName);
  },
  (ev) => { recipeExportDialog.open(); },
  (ev) => { recipeImportDialog.open(); },
);

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
  sampleRateScaler: new widget.ComboBoxLine(
    detailRender, "Sample Rate Scale", param.sampleRateScaler, render),
  addSpace: new widget.ToggleButtonLine(
    detailRender, ["No Space Between Notes", "Add Space Between Notes"], param.addSpace,
    render),

  seed: new widget.NumberInput(detailOsc, "Seed", param.seed, render),
  oscSync: new widget.NumberInput(detailOsc, "Sync.", param.oscSync, render),
  fmIndex: new widget.NumberInput(detailOsc, "FM Index", param.fmIndex, render),
  fmDecay: new widget.NumberInput(detailOsc, "FM Decay To [dB]", param.fmDecay, render),
  fmUpdateCycle:
    new widget.NumberInput(detailOsc, "FM Update Cycle", param.fmUpdateCycle, render),
  saturationGain: new widget.NumberInput(
    detailOsc, "Saturation Gain [dB]", param.saturationGain, render),

  waveform: new widget.WaveformXYPad(
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
window.addEventListener("load", (ev) => { widget.refresh(ui); });
