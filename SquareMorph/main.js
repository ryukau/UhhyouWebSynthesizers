// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {uiSize} from "../common/gui/palette.js";
import * as widget from "../common/gui/widget.js";
import * as parameter from "../common/parameter.js";
import * as util from "../common/util.js";
import * as wave from "../common/wave.js";

import * as menuitems from "./menuitems.js";

const version = 0;

const localRecipeBook = {
  "Default": {
    samplesPerCycleLog2: () => {},
    nCycle: () => {},
    stereoMerge: () => {},
    sampleRateScaler: () => {},
    normalizeSection: () => {},

    firstWaveform: (prm) => { prm.normalized = Math.random(); },

    lastWaveform: (prm) => { prm.normalized = Math.random(); },

    transformType: (prm) => { prm.normalized = Math.random(); },
    indexingType: (prm) => { prm.normalized = Math.random(); },

    stereoReverseIndexing: () => {},
    stereoSwapWaveform: () => {},
  },
};

function getSampleRateScaler() {
  return parseInt(menuitems.sampleRateScalerItems[param.sampleRateScaler.dsp]);
}

function render() {
  audio.render(
    parameter.toMessage(param, {
      sampleRate: audio.audioContext.sampleRate,
    }),
    "perChannel",
    playControl.togglebuttonQuickSave.state === 1,
  );
}

const scales = {
  boolean: new parameter.IntScale(0, 1),

  samplesPerCycleLog2: new parameter.IntScale(1, 16),
  nCycle: new parameter.IntScale(1, 1024),
  fade: new parameter.DecibelScale(-60, 40, true),
  decayTo: new parameter.DecibelScale(util.ampToDB(1 / 2 ** 24), 0, false),
  stereoMerge: new parameter.LinearScale(0, 1),
  sampleRateScaler: new parameter.MenuItemScale(menuitems.sampleRateScalerItems),

  waveform: new parameter.MenuItemScale(menuitems.czOscillatorTypeItems),
  phaseOffset: new parameter.LinearScale(0, 1),
  oscMod: new parameter.LinearScale(0, 1),
  fmIndex: new parameter.DecibelScale(-60, 40, true),

  transformType: new parameter.MenuItemScale(menuitems.transformTypeItems),
  indexingType: new parameter.MenuItemScale(menuitems.indexingTypeItems),
  seed: new parameter.IntScale(0, 2 ** 32),
  morphingCurve: new parameter.LinearScale(0, 1),
};

const param = {
  samplesPerCycleLog2: new parameter.Parameter(12, scales.samplesPerCycleLog2),
  nCycle: new parameter.Parameter(64, scales.nCycle, true),
  stereoMerge: new parameter.Parameter(0, scales.stereoMerge),
  sampleRateScaler: new parameter.Parameter(2, scales.sampleRateScaler),
  normalizeSection: new parameter.Parameter(0, scales.boolean),

  firstWaveform: new parameter.Parameter(0, scales.waveform, true),
  firstPhaseOffset: new parameter.Parameter(0, scales.phaseOffset, true),
  firstOscMod: new parameter.Parameter(0, scales.oscMod, true),
  firstFmIndex: new parameter.Parameter(0, scales.fmIndex, true),

  lastWaveform: new parameter.Parameter(0, scales.waveform, true),
  lastPhaseOffset: new parameter.Parameter(0, scales.phaseOffset, true),
  lastOscMod: new parameter.Parameter(1, scales.oscMod, true),
  lastFmIndex: new parameter.Parameter(0, scales.fmIndex, true),

  transformType: new parameter.Parameter(0, scales.transformType),
  indexingType: new parameter.Parameter(3, scales.indexingType),
  seed: new parameter.Parameter(0, scales.seed, true),
  morphingCurve: new parameter.Parameter(0.5, scales.morphingCurve, true),

  stereoReverseIndexing: new parameter.Parameter(0, scales.boolean),
  stereoSwapWaveform: new parameter.Parameter(0, scales.boolean),
};

const recipeBook
  = parameter.addLocalRecipes(localRecipeBook, await parameter.loadJson(param, []));

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
    divLeft, uiSize.controlWidth, uiSize.waveViewHeight, audio.wave.data[0], false),
  new widget.WaveView(
    divLeft, uiSize.controlWidth, uiSize.waveViewHeight, audio.wave.data[1], false),
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
  (ev) => { audio.save(true, [], getSampleRateScaler()); },
  (ev) => {},
  (ev) => {
    recipeBook.get(playControl.selectRandom.value).randomize(param);
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

const detailTips = widget.details(divLeft, "Tips");
const paragraphTip1 = widget.paragraph(detailTips, undefined, undefined);
paragraphTip1.textContent = "`Seed` is used only when `Indexing` is `Random`.";

const detailRender = widget.details(divLeft, "Render");
const detailFirstWaveform = widget.details(divRight, "First Waveform");
const detailLastWaveform = widget.details(divRight, "Last Waveform");
const detailTransform = widget.details(divRight, "Transform");
const detailStereo = widget.details(divRight, "Stereo");

const ui = {
  samplesPerCycleLog2: new widget.NumberInput(
    detailRender, "Duration [2^n sample/cycle]", param.samplesPerCycleLog2, render),
  nCycle: new widget.NumberInput(detailRender, "nCycle", param.nCycle, render),
  stereoMerge:
    new widget.NumberInput(detailRender, "Stereo Merge", param.stereoMerge, render),
  sampleRateScaler: new widget.ComboBoxLine(
    detailRender, "Sample Rate Scale", param.sampleRateScaler, render),
  normalizeSection: new widget.ToggleButtonLine(
    detailRender, ["Normalize - Off", "Normalize - On"], param.normalizeSection, render),

  firstWaveform:
    new widget.ComboBoxLine(detailFirstWaveform, "Waveform", param.firstWaveform, render),
  firstPhaseOffset: new widget.NumberInput(
    detailFirstWaveform, "Phase Offset", param.firstPhaseOffset, render),
  firstOscMod:
    new widget.NumberInput(detailFirstWaveform, "Modulation", param.firstOscMod, render),
  firstFmIndex:
    new widget.NumberInput(detailFirstWaveform, "FM Index", param.firstFmIndex, render),

  lastWaveform:
    new widget.ComboBoxLine(detailLastWaveform, "Waveform", param.lastWaveform, render),
  lastPhaseOffset: new widget.NumberInput(
    detailLastWaveform, "Phase Offset", param.lastPhaseOffset, render),
  lastOscMod:
    new widget.NumberInput(detailLastWaveform, "Modulation", param.lastOscMod, render),
  lastFmIndex:
    new widget.NumberInput(detailLastWaveform, "FM Index", param.lastFmIndex, render),

  transformType:
    new widget.ComboBoxLine(detailTransform, "Transform", param.transformType, render),
  indexingType:
    new widget.ComboBoxLine(detailTransform, "Indexing", param.indexingType, render),
  seed: new widget.NumberInput(detailTransform, "Seed", param.seed, render),
  morphingCurve: new widget.NumberInput(
    detailTransform, "Morphing Curve", param.morphingCurve, render),

  stereoReverseIndexing: new widget.ToggleButtonLine(
    detailStereo, ["Reverse Indexing - Off", "Reverse Indexing - On"],
    param.stereoReverseIndexing, render),
  stereoSwapWaveform: new widget.ToggleButtonLine(
    detailStereo, ["Swap Waveform - Off", "Swap Waveform - On"], param.stereoSwapWaveform,
    render),
};

render();
window.addEventListener("load", (ev) => { widget.refresh(ui); });
