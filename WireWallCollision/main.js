// Copyright 2022 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {palette, uiSize} from "../common/gui/palette.js";
import * as widget from "../common/gui/widget.js";
import * as parameter from "../common/parameter.js";
import * as util from "../common/util.js";
import * as wave from "../common/wave.js";

import * as menuitems from "./menuitems.js";

const version = 0;

const localRecipeBook = {
  "Default": {
    renderDuration: () => {},
    fadeIn: () => {},
    fadeOut: () => {},
    overSample: () => {},
    sampleRateScaler: () => {},
    noiseStereo: () => {},
  },
};

function applyLocalRecipe(param, recipe) {
  for (const key in param) {
    if (recipe.hasOwnProperty(key)) {
      recipe[key](param[key]);
    } else if (Array.isArray(param[key])) {
      param[key].forEach(e => { e.normalized = Math.random(); });
    } else if (param[key].scale instanceof parameter.MenuItemScale) {
      // Do nothing.
    } else {
      param[key].normalized = Math.random();
    }
  };
}

function addLocalRecipes(source, target) {
  let tgt = new Map(target); // Don't mutate original.
  for (const [key, recipe] of Object.entries(source)) {
    tgt.set(` - ${key}`, {randomize: (param) => applyLocalRecipe(param, recipe)});
  }
  return new Map([...tgt.entries()].sort()); // Sort by key.
}

function getSampleRateScaler() {
  return parseInt(menuitems.sampleRateScalerItems[param.sampleRateScaler.dsp]);
}

function render() {
  audio.render(
    parameter.toMessage(param, {
      sampleRate: audio.audioContext.sampleRate * getSampleRateScaler(),
    }),
    "perChannel",
    playControl.togglebuttonQuickSave.state === 1,
  );
}

const scales = {
  defaultScale: new parameter.LinearScale(0, 1),

  renderDuration: new parameter.DecibelScale(-40, 40, false),
  fade: new parameter.DecibelScale(-60, 40, true),
  decayTo: new parameter.DecibelScale(util.ampToDB(1 / 2 ** 24), 0, false),
  overSample: new parameter.MenuItemScale(menuitems.oversampleItems),
  sampleRateScaler: new parameter.MenuItemScale(menuitems.sampleRateScalerItems),
  seed: new parameter.IntScale(0, 2 ** 53),

  limiterActive: new parameter.MenuItemScale(menuitems.limiterOnOffItems),
  limiterThreshold: new parameter.DecibelScale(-60, 60, false),

  nNode: new parameter.IntScale(4, 1000),
  lengthMeter: new parameter.LinearScale(0.1, 1),
  waveSpeed: new parameter.DecibelScale(0, 80, false),
  damping: new parameter.DecibelScale(-40, 60, true),
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
  overSample: new parameter.Parameter(4, scales.overSample),
  sampleRateScaler: new parameter.Parameter(0, scales.sampleRateScaler),
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

const recipeBook = addLocalRecipes(localRecipeBook, await parameter.loadJson(param, [
  // "recipe/full.json",
  // "recipe/init.json",
]));

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
  (ev) => { audio.save(false, [], getSampleRateScaler()); },
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
  sampleRateScaler: new widget.ComboBoxLine(
    detailRender, "Sample Rate Scale", param.sampleRateScaler, render),
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
window.addEventListener("load", (ev) => { widget.refresh(ui); });
