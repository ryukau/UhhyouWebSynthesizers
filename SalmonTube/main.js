// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {uiSize} from "../common/gui/palette.js";
import * as widget from "../common/gui/widget.js";
import * as parameter from "../common/parameter.js";
import * as util from "../common/util.js";
import * as wave from "../common/wave.js";

import * as menuitems from "./menuitems.js";
import {TongueXYPad} from "./tonguexypad.js";

const version = 0;

const localRecipeBook = {
  "Default": {
    renderDuration: () => {},
    fadeIn: () => {},
    fadeOut: () => {},
    expDecayTo: () => {},
    overSample: () => {},
  },
};

function createVocalTractParameters(scale) {
  let arr = new Array(44);

  let diameter = i => {
    if (i < 7) {
      return 0.6;
    } else if (i < 12) {
      return 1.1;
    }
    return 1.5;
  };

  for (let i = 0; i < arr.length; ++i) {
    arr[i] = new parameter.Parameter(diameter(i), scale, true);
  }
  return arr;
}

function createNoseParameters(scale) {
  let arr = new Array(28);
  for (let idx = 0; idx < arr.length; ++idx) {
    const dd = 2 * (idx / arr.length);
    const diameter = dd < 1 ? 0.4 + 1.6 * dd : 0.5 + 1.5 * (2 - dd);
    arr[idx] = new parameter.Parameter(Math.min(diameter, 1.9), scale, true);
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

function updateTongueWidth() {
  ui.tongue.refresh();
  render();
}

const scales = {
  defaultScale: new parameter.LinearScale(0, 1),

  renderDuration: new parameter.DecibelScale(-40, 40, false),
  fade: new parameter.DecibelScale(-60, 40, true),
  expDecayTo: new parameter.DecibelScale(util.ampToDB(1 / 2 ** 24), 0, false),
  overSample: new parameter.MenuItemScale(menuitems.oversampleItems),
  seed: new parameter.IntScale(0, 2 ** 53),

  glottisFrequency: new parameter.MidiPitchScale(0, 100, false),
  sigma2: new parameter.DecibelScale(-40, 0, false),
  noiseMix: new parameter.DecibelScale(-30, 0, true),
  vibratoAmount: new parameter.LinearScale(0, 1200),
  vibratoPeriod: new parameter.DecibelScale(-40, 0, false),

  tubeDiameter: new parameter.LinearScale(0.001, 3),
  tubeDiameterMultiplier: new parameter.DecibelScale(-20, 20, false),

  nVoice: new parameter.IntScale(1, 32),
  randomDetune: new parameter.LinearScale(0, 1200),
};

const param = {
  renderDuration: new parameter.Parameter(1, scales.renderDuration, true),
  fadeIn: new parameter.Parameter(0.001, scales.fade, true),
  fadeOut: new parameter.Parameter(0.002, scales.fade, true),
  expDecayTo: new parameter.Parameter(1, scales.expDecayTo, false),
  overSample: new parameter.Parameter(1, scales.overSample),
  seed: new parameter.Parameter(0, scales.seed),

  frequency: new parameter.Parameter(150, scales.glottisFrequency, true),
  sigma2: new parameter.Parameter(0.03, scales.sigma2, true),
  noiseMix: new parameter.Parameter(0.05, scales.noiseMix, true),
  vibratoAmount: new parameter.Parameter(100, scales.vibratoAmount, true),
  vibratoPeriod: new parameter.Parameter(0.05, scales.vibratoPeriod, true),

  noseDiameter: createNoseParameters(scales.tubeDiameter),
  vocalTractDiameter: createVocalTractParameters(scales.tubeDiameter),
  tubeDiameterMultiplier: new parameter.Parameter(1, scales.tubeDiameterMultiplier, true),
  tongue0X: new parameter.Parameter(0.25, scales.defaultScale, true),
  tongue0Y: new parameter.Parameter(0.7, scales.defaultScale, true),
  tongue0W: new parameter.Parameter(0.4, scales.defaultScale, true),
  tongue1X: new parameter.Parameter(0.9, scales.defaultScale, true),
  tongue1Y: new parameter.Parameter(0.6, scales.defaultScale, true),
  tongue1W: new parameter.Parameter(0.1, scales.defaultScale, true),
  tubeMod: new parameter.Parameter(0, scales.defaultScale, true),

  nVoice: new parameter.Parameter(8, scales.nVoice, true),
  randomDetune: new parameter.Parameter(10, scales.randomDetune, true),
  randomPulseWidth: new parameter.Parameter(0.01, scales.defaultScale, true),
  randomTongue0X: new parameter.Parameter(0.1, scales.defaultScale, true),
  randomTongue0Y: new parameter.Parameter(0.2, scales.defaultScale, true),
  randomTongue0W: new parameter.Parameter(0.05, scales.defaultScale, true),
  randomTongue1X: new parameter.Parameter(0.1, scales.defaultScale, true),
  randomTongue1Y: new parameter.Parameter(0.2, scales.defaultScale, true),
  randomTongue1W: new parameter.Parameter(0.05, scales.defaultScale, true),
};

const recipeBook
  = parameter.addLocalRecipes(localRecipeBook, await parameter.loadJson(param, []));

// Add controls.
const pageTitle = widget.pageTitle(document.body);
const divMain = widget.div(document.body, "main", undefined);

const divLeft = widget.div(divMain, undefined, "controlBlock");
const divMid = widget.div(divMain, undefined, "controlBlock");
const divRight = widget.div(divMain, undefined, "controlBlock");

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
  (ev) => { audio.save(); },
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
const detailGlottis = widget.details(divLeft, "Glottis");
const detailVocalTract = widget.details(divMid, "Vocal Tract");
const detailChorus = widget.details(divRight, "Chorus");

const ui = {
  renderDuration:
    new widget.NumberInput(detailRender, "Duration [s]", param.renderDuration, render),
  fadeIn: new widget.NumberInput(detailRender, "Fade-in [s]", param.fadeIn, render),
  fadeOut: new widget.NumberInput(detailRender, "Fade-out [s]", param.fadeOut, render),
  expDecayTo:
    new widget.NumberInput(detailRender, "Decay To [dB]", param.expDecayTo, render),
  overSample:
    new widget.ComboBoxLine(detailRender, "Over-sample", param.overSample, render),
  seed: new widget.NumberInput(detailRender, "Seed", param.seed, render),

  frequency:
    new widget.NumberInput(detailGlottis, "Frequency [Hz]", param.frequency, render),
  sigma2: new widget.NumberInput(detailGlottis, "Pulse Width", param.sigma2, render),
  noiseMix: new widget.NumberInput(detailGlottis, "Noise Mix", param.noiseMix, render),
  vibratoAmount: new widget.NumberInput(
    detailGlottis, "Vibrato Amount [cent]", param.vibratoAmount, render),
  vibratoPeriod: new widget.NumberInput(
    detailGlottis, "Vibrato Period [s]", param.vibratoPeriod, render),

  // noseDiameter: new widget.BarBox(
  //   detailVocalTract, "Nose Diameter", uiSize.barboxWidth, uiSize.barboxHeight,
  //   param.noseDiameter, render),
  vocalTractDiameter: new widget.BarBox(
    detailVocalTract, "Vocal Tract Diameter", uiSize.barboxWidth, uiSize.barboxHeight,
    param.vocalTractDiameter, render),
  tubeDiameterMultiplier: new widget.NumberInput(
    detailVocalTract, "Diameter Multiplier", param.tubeDiameterMultiplier, render),
  tongue: new TongueXYPad(
    detailVocalTract, uiSize.barboxWidth, uiSize.barboxHeight, "Tongue", param.tongue0X,
    param.tongue0Y, param.tongue0W, param.tongue1X, param.tongue1Y, param.tongue1W,
    render),
  tongue0W: new widget.NumberInput(
    detailVocalTract, "Tongue 0 Width", param.tongue0W, updateTongueWidth),
  tongue1W: new widget.NumberInput(
    detailVocalTract, "Tongue 1 Width", param.tongue1W, updateTongueWidth),
  tubeMod: new widget.NumberInput(detailVocalTract, "Modulation", param.tubeMod, render),

  nVoice: new widget.NumberInput(detailChorus, "nVoice", param.nVoice, render),
  randomDetune:
    new widget.NumberInput(detailChorus, "Detune [cent]", param.randomDetune, render),
  randomPulseWidth:
    new widget.NumberInput(detailChorus, "Pulse Width", param.randomPulseWidth, render),
  randomTongue0X:
    new widget.NumberInput(detailChorus, "Tongue 0 X", param.randomTongue0X, render),
  randomTongue0Y:
    new widget.NumberInput(detailChorus, "Tongue 0 Y", param.randomTongue0Y, render),
  randomTongue0W:
    new widget.NumberInput(detailChorus, "Tongue 0 Width", param.randomTongue0W, render),
  randomTongue1X:
    new widget.NumberInput(detailChorus, "Tongue 1 X", param.randomTongue1X, render),
  randomTongue1Y:
    new widget.NumberInput(detailChorus, "Tongue 1 Y", param.randomTongue1Y, render),
  randomTongue1W:
    new widget.NumberInput(detailChorus, "Tongue 1 Width", param.randomTongue1W, render),
};

render();
window.addEventListener("load", (ev) => { widget.refresh(ui); });
