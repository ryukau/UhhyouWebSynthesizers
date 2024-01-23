// Copyright 2022 Takamitsu Endo
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
    renderSamples: () => {},
    nWaveform: () => {},
    randomAmount: () => {},
    reduceGlitch: () => {},
    automationScaling: () => {},
    powerOf: (prm) => { prm.ui = util.uniformDistributionMap(Math.random(), -40, 20); },
    skew: (prm) => { prm.ui = util.uniformDistributionMap(Math.random(), -40, 20); },
    spectralSpread:
      (prm) => { prm.ui = util.uniformDistributionMap(Math.random(), -20, 20); },
    highpass: () => {},
    lowpass: () => {},
    notchRange: (prm) => {
      prm.ui = util.uniformDistributionMap(Math.random(), -60, util.ampToDB(0.04));
    },
  },
  "Full": {
    renderSamples: () => {},
    nWaveform: () => {},
    randomAmount: () => {},
    reduceGlitch: () => {},
    automationScaling: () => {},
    highpass: () => {},
    lowpass: () => {},
  },
};

function randomize() {
  if (selectRandom.value === "Full") {
  } else { // selectRandom.value  === "Default"
    for (const key in param) {
      if (key === "renderSamples") continue;
      if (key === "nWaveform") continue;
      if (key === "randomAmount") continue;
      if (key === "reduceGlitch") continue;
      if (key === "automationScaling") continue;
      if (key === "powerOf") {
        param[key].ui = util.uniformDistributionMap(Math.random(), -40, 20);
        continue;
      }
      if (key === "skew") {
        param[key].ui = util.uniformDistributionMap(Math.random(), -40, 20);
        continue;
      }
      if (key === "spectralSpread") {
        param[key].ui = util.uniformDistributionMap(Math.random(), -20, 20);
        continue;
      }
      if (key === "highpass") continue;
      if (key === "lowpass") continue;
      if (key === "notchRange") {
        param[key].ui
          = util.uniformDistributionMap(Math.random(), -60, util.ampToDB(0.04));
        continue;
      }
      if (Array.isArray(param[key])) {
        param[key].forEach(e => { e.normalized = Math.random(); });
      } else if (param[key].scale instanceof parameter.MenuItemScale) {
        param[key].normalized = Math.random();
      } else {
        param[key].normalized = Math.random();
      }
    }
  }

  widget.refresh(ui);
  render();
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
    }),
    "perChannel",
    playControl.togglebuttonQuickSave.state === 1,
  );
}

const scales = {
  boolScale: new parameter.IntScale(0, 1),
  defaultScale: new parameter.LinearScale(0, 1),
  bipolarScale: new parameter.LinearScale(-1, 1),

  renderSamples: new parameter.IntScale(1, 2 ** 16),
  automationScaling: new parameter.MenuItemScale(menuitems.automationScalingItems),
  nWaveform: new parameter.IntScale(1, 1024),
  seed: new parameter.IntScale(0, 2 ** 32),

  waveform: new parameter.LinearScale(0, 3),
  powerOf: new parameter.DecibelScale(-40, 40, false),
  skew: new parameter.DecibelScale(-40, 40, false),
  sineRatio: new parameter.IntScale(1, 1024),
  hardSync: new parameter.DecibelScale(-20, 20, false),
  spectralSpread: new parameter.DecibelScale(-40, 40, true),
  phaseSlope: new parameter.DecibelScale(-60, 60, true),

  cutoff: new parameter.DecibelScale(-60, 0, true),
  gain: new parameter.DecibelScale(-40, 40, true),

  startFromDefault: new parameter.MenuItemScale(menuitems.startFromDefaultItems),
};

const param = {
  renderSamples: new parameter.Parameter(2048, scales.renderSamples),

  automationScaling: new parameter.Parameter(2, scales.automationScaling),
  nWaveform: new parameter.Parameter(1, scales.nWaveform),
  seed: new parameter.Parameter(0, scales.seed),
  randomAmount: new parameter.Parameter(0, scales.defaultScale),
  reduceGlitch: new parameter.Parameter(1, scales.boolScale),

  waveform: new parameter.Parameter(0, scales.waveform, true),
  powerOf: new parameter.Parameter(1, scales.powerOf, true),
  skew: new parameter.Parameter(1, scales.skew, true),
  sineShaper: new parameter.Parameter(0, scales.defaultScale, true),
  sineRatio: new parameter.Parameter(1, scales.sineRatio, true),
  hardSync: new parameter.Parameter(1, scales.hardSync, true),
  mirrorRange: new parameter.Parameter(1, scales.defaultScale, true),
  mirrorRepeat: new parameter.Parameter(0, scales.defaultScale, true),
  flip: new parameter.Parameter(-1, scales.bipolarScale, true),
  spectralSpread: new parameter.Parameter(1, scales.spectralSpread, true),
  phaseSlope: new parameter.Parameter(0, scales.phaseSlope, true),

  highpass: new parameter.Parameter(0, scales.cutoff, true),
  lowpass: new parameter.Parameter(1, scales.cutoff, true),
  notchStart: new parameter.Parameter(1, scales.cutoff, true),
  notchRange: new parameter.Parameter(0.01, scales.cutoff, true),

  lowshelfEnd: new parameter.Parameter(0, scales.cutoff, true),
  lowshelfGain: new parameter.Parameter(1, scales.gain, true),

  startFromDefault: createArrayParameters(
    [
      0, // "Sine-Saw-Pulse"
      0, // "Power"
      0, // "Skew"
      0, // "Sine Shaper"
      0, // "Sine Ratio"
      0, // "Hard Sync."
      0, // "Mirror Range"
      0, // "Mirror/Repeat"
      0, // "Flip"
      0, // "Spectral Spread"
      0, // "Phase Slope"
      0, // "Highpass"
      0, // "Lowpass"
      0, // "Notch Start"
      0, // "Notch Range"
      0, // "Lowshelf End"
      0, // "Lowshelf Gain"
    ],
    menuitems.startFromDefaultItems.length, scales.boolScale),
};

const recipeBook
  = parameter.addLocalRecipes(localRecipeBook, await parameter.loadJson(param, []));

// Add controls.
const pageTitle = widget.pageTitle(document.body);
const divMain = widget.div(document.body, "main", undefined);

const divLeft = widget.div(divMain, undefined, "controlBlock");
const divRightA = widget.div(divMain, undefined, "controlBlock");
const divRightB = widget.div(divMain, undefined, "controlBlock");

const headingWaveform = widget.heading(divLeft, 6, "Waveform");
const waveView = [
  new widget.WaveView(
    divLeft, uiSize.controlWidth, 2 * uiSize.waveViewHeight, undefined, false),
];

const audio = new wave.Audio(
  1,
  "./renderer.js",
  undefined,
  (wave) => {
    for (let i = 0; i < waveView.length; ++i) waveView[i].set(wave.data[i]);
  },
);

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
  (ev) => { audio.play(); },
  (ev) => { audio.stop(); },
  (ev) => { audio.save(true); },
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

const createDetailInBlock = (name) => {
  const div = widget.div(divMain, undefined, "controlBlock");
  return widget.details(div, name);
};

const detailTips = widget.details(divLeft, "Tips");
const paragraphTip1 = widget.paragraph(detailTips, undefined, undefined);
paragraphTip1.textContent = "Automation only works when `nWaveform` is 2 or more."
const paragraphTip2 = widget.paragraph(detailTips, undefined, undefined);
paragraphTip2.textContent
  = "`Reduce Glitch` tries to reduce discontinuity between adjacent waveforms, but it may not work in some cases. When in doubt, recommend to flip it."

const detailRender = widget.details(divLeft, "Render");
const detailMultiTable = widget.details(divLeft, "Multiple Waveforms");
const detailShape = widget.details(divRightA, "Shape");
const detailSpectral = widget.details(divRightA, "Spectral");
const detailFilter = widget.details(divRightA, "Filter");
const detailAutomation = widget.details(divRightB, "Automation");

const ui = {
  renderSamples: new widget.NumberInput(
    detailRender, "Duration [sample]", param.renderSamples, render),

  nWaveform:
    new widget.NumberInput(detailMultiTable, "nWaveform", param.nWaveform, render),
  seed: new widget.NumberInput(detailMultiTable, "Seed", param.seed, render),
  randomAmount:
    new widget.NumberInput(detailMultiTable, "Random Amount", param.randomAmount, render),
  reduceGlitch: new widget.CheckBoxLine(
    detailMultiTable, "Reduce Glitch", ["☉ Off", "☀︎ On"], param.reduceGlitch, render),

  waveform: new widget.NumberInput(detailShape, "Sine-Saw-Pulse", param.waveform, render),
  powerOf: new widget.NumberInput(detailShape, "Power", param.powerOf, render),
  skew: new widget.NumberInput(detailShape, "Skew", param.skew, render),
  sineShaper:
    new widget.NumberInput(detailShape, "Sine Shaper", param.sineShaper, render),
  sineRatio: new widget.NumberInput(detailShape, "Sine Ratio", param.sineRatio, render),
  hardSync: new widget.NumberInput(detailShape, "Hard Sync.", param.hardSync, render),
  mirrorRange:
    new widget.NumberInput(detailShape, "Mirror Range", param.mirrorRange, render),
  mirrorRepeat:
    new widget.NumberInput(detailShape, "Mirror/Repeat", param.mirrorRepeat, render),
  flip: new widget.NumberInput(detailShape, "Flip", param.flip, render),

  spectralSpread: new widget.NumberInput(
    detailSpectral, "Spectral Spread", param.spectralSpread, render),
  phaseSlope:
    new widget.NumberInput(detailSpectral, "Phase Slope", param.phaseSlope, render),

  highpass: new widget.NumberInput(detailFilter, "Highpass", param.highpass, render),
  lowpass: new widget.NumberInput(detailFilter, "Lowpass", param.lowpass, render),
  notchStart:
    new widget.NumberInput(detailFilter, "Notch Start", param.notchStart, render),
  notchRange:
    new widget.NumberInput(detailFilter, "Notch Range", param.notchRange, render),
  lowshelfEnd:
    new widget.NumberInput(detailFilter, "Lowshelf End", param.lowshelfEnd, render),
  lowshelfGain:
    new widget.NumberInput(detailFilter, "Lowshelf Gain", param.lowshelfGain, render),

  automationScaling: new widget.ComboBoxLine(
    detailAutomation, "Automation Scaling", param.automationScaling, render),
  startFromDefault: new widget.MultiCheckBoxVertical(
    detailAutomation, "Parameters to Start from Default", menuitems.startFromDefaultItems,
    2 * uiSize.waveViewWidth, param.startFromDefault, render),
};

render();
window.addEventListener("load", (ev) => { widget.refresh(ui); });
