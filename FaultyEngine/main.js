// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {uiSize} from "../common/gui/palette.js";
import * as widget from "../common/gui/widget.js";
import * as parameter from "../common/parameter.js";
import * as util from "../common/util.js";
import * as wave from "../common/wave.js";

import * as menuitems from "./menuitems.js";

const version = 5;

const randomUniform
  = (prm, low, high) => prm.randomize((p) => (p.dsp = util.randomUniformFloat(low, high)));
const randomInt
  = (prm, low, high) => prm.randomize((p) => (p.dsp = util.randomUniformInt(low, high)));
const randomLoguniform
  = (prm, low, high) => prm.randomize((p) => (p.dsp = util.randomLoguniform(low, high)));
const randomLogInt
  = (prm, low, high) => prm.randomize((p) => (p.dsp = util.randomLoguniformInt(low, high)));
const randomFull = (prm) => prm.randomize((p) => (p.normalized = Math.random()));

const localRecipeBook = {
  "Default": (param) => {
    randomLoguniform(param.excitationGain, 1.0, 10.0);
    randomFull(param.noiseSeed);
    randomLoguniform(param.noiseDecay, 0.001, 0.1);
    randomInt(param.noiseFilterType, 0, menuitems.noiseFilterItems.length - 1);
    randomUniform(param.noiseFilterQ, 0.5, 10.0);
    randomUniform(param.noiseFilterCutoffStart, 0, 96);
    randomUniform(param.noiseFilterCutoffEnd, -24, 48);

    randomUniform(param.fretAction, 0.001, 0.1);
    randomUniform(param.fretRestitution, 0.5, 0.9);
    randomInt(param.segments, 16, 24);
    randomInt(param.segmentInterval, 0, menuitems.segmentIntervalItems.length - 1);
    randomUniform(param.slapPosition, 0.65, 0.85);
    randomUniform(param.pickupPosition, 0.7, 0.95);
    randomUniform(param.tensionMod, 0.01, 0.1);

    randomUniform(param.buzzBiasedAdaaGain, 1.0, 10.0);
    randomUniform(param.buzzBiasedAdaaBias, -4.0, 4.0);
    randomUniform(param.buzzBiasedAdaaDryMix, 0.0, 0.8);
    randomUniform(param.buzzBiasedAdaaScale, 0.1, 1.0);

    randomInt(param.nDelay, 1, scales.nDelay.maxDsp);
    randomUniform(param.buzzerGain, 0.8, 0.99);
    randomUniform(param.buzzerFeedback, -0.8, 0.8);
    randomInt(param.buzzerFeedbackSign, 0, menuitems.buzzerFeedbackSignItems.length - 1);
    randomLoguniform(param.buzzFeedbackCutoffHz, 400, param.buzzFeedbackCutoffHz.scale.maxDsp);
    for (const p of param.buzzerDelaySeconds) randomFull(p);

    if (Math.random() < 0.5) param.feedback.dsp = -param.feedback.dsp;
    randomLoguniform(param.frequency, 1, 200);
    randomLoguniform(param.lpCutoffHz, 400, param.lpCutoffHz.scale.maxDsp);

    randomUniform(param.stereoPickupSpread, 0.0, 0.08);
    randomUniform(param.stereoBuzzerDetune, 0.0, 0.1);
    randomInt(param.stereoSeedOffset, 0, 10000);
  },
};

const scales = {
  renderDuration: new parameter.DecibelScale(-40, 30, false),
  fade: new parameter.DecibelScale(-60, 40, true),
  decayTo: new parameter.DecibelScale(util.ampToDB(1 / 2 ** 24), 0, false),
  overSample: new parameter.MenuItemScale(menuitems.oversampleItems),
  sampleRateScaler: new parameter.MenuItemScale(menuitems.sampleRateScalerItems),
  boolean: new parameter.IntScale(0, 1),

  excitationGain: new parameter.DecibelScale(-40, 40, false),
  noiseSeed: new parameter.IntScale(0, 2 ** 32 - 1),
  noiseDecay: new parameter.DecibelScale(-80, 0, false),
  noiseFilterType: new parameter.MenuItemScale(menuitems.noiseFilterItems),
  noiseFilterQ: new parameter.DecibelScale(-20, 40, false),
  noiseFilterCutoffRelative: new parameter.LinearScale(-48, 96),

  fretAction: new parameter.DecibelScale(util.ampToDB(0.0002), util.ampToDB(2.0), false),
  fretRestitution: new parameter.LinearScale(0.0, 1.0),
  segments: new parameter.IntScale(0, 24),
  segmentInterval: new parameter.MenuItemScale(menuitems.segmentIntervalItems),
  slapPosition: new parameter.LinearScale(0.5, 0.95),
  pickupPosition: new parameter.LinearScale(0.05, 0.98),

  buzzBiasedAdaaGain: new parameter.LinearScale(0.0, 20.0),
  buzzBiasedAdaaBias: new parameter.LinearScale(-10.0, 10.0),
  buzzBiasedAdaaDryMix: new parameter.LinearScale(0.0, 1.0),
  buzzBiasedAdaaScale: new parameter.LinearScale(0.0, 2.0),

  buzzerGain: new parameter.LinearScale(-0.99, 0.99),
  buzzerFeedback: new parameter.LinearScale(-0.99, 0.99),
  buzzerFeedbackSign: new parameter.MenuItemScale(menuitems.buzzerFeedbackSignItems),
  buzzFeedbackCutoffHz: new parameter.LogScale(1, 100000),
  nDelay: new parameter.IntScale(1, 16),
  buzzerDelaySeconds: new parameter.DecibelScale(-80, 0, false),

  frequency: new parameter.LogScale(0.1, 10000),
  feedback: new parameter.SymmetricLogScale(1e-3, 1),
  dcHighpassCutoffHz: new parameter.LogScale(1, 100000),
  lpCutoffHz: new parameter.LogScale(1, 100000),
  tensionMod: new parameter.LinearScale(0.0, 1.0),

  stereoPickupSpread: new parameter.LinearScale(0.0, 0.4),
  stereoBuzzerDetune: new parameter.LinearScale(0.0, 0.5),
  stereoSeedOffset: new parameter.IntScale(0, 100000),
};

const param = {
  renderDuration: new parameter.Parameter(4, scales.renderDuration, true),
  fadeIn: new parameter.Parameter(0.002, scales.fade, true),
  fadeOut: new parameter.Parameter(0.05, scales.fade, true),
  decayTo: new parameter.Parameter(1, scales.decayTo, false),
  overSample: new parameter.Parameter(0, scales.overSample),
  sampleRateScaler: new parameter.Parameter(2, scales.sampleRateScaler),
  normalize: new parameter.Parameter(1, scales.boolean),

  excitationGain: new parameter.Parameter(1, scales.excitationGain, false),

  noiseSeed: new parameter.Parameter(0, scales.noiseSeed),
  noiseDecay: new parameter.Parameter(0.01, scales.noiseDecay, true),
  noiseFilterType: new parameter.Parameter(0, scales.noiseFilterType),
  noiseFilterQ: new parameter.Parameter(Math.SQRT1_2, scales.noiseFilterQ, true),
  noiseFilterCutoffStart: new parameter.Parameter(96, scales.noiseFilterCutoffRelative, false),
  noiseFilterCutoffEnd: new parameter.Parameter(0, scales.noiseFilterCutoffRelative, false),

  fretAction: new parameter.Parameter(0.1, scales.fretAction, false),
  fretRestitution: new parameter.Parameter(0.75, scales.fretRestitution, false),
  segments: new parameter.Parameter(8, scales.segments),
  segmentInterval: new parameter.Parameter(0, scales.segmentInterval),
  slapPosition: new parameter.Parameter(0.85, scales.slapPosition, false),
  pickupPosition: new parameter.Parameter(0.88, scales.pickupPosition, false),

  buzzBiasedAdaaGain: new parameter.Parameter(4, scales.buzzBiasedAdaaGain, false),
  buzzBiasedAdaaBias: new parameter.Parameter(2, scales.buzzBiasedAdaaBias, false),
  buzzBiasedAdaaDryMix: new parameter.Parameter(0.4, scales.buzzBiasedAdaaDryMix, false),
  buzzBiasedAdaaScale: new parameter.Parameter(0.37, scales.buzzBiasedAdaaScale, false),

  buzzerGain: new parameter.Parameter(0.99, scales.buzzerGain, false),
  buzzerFeedback: new parameter.Parameter(0.99, scales.buzzerFeedback, false),
  buzzerFeedbackSign: new parameter.Parameter(0, scales.buzzerFeedbackSign),
  buzzFeedbackCutoffHz: new parameter.Parameter(80000.0, scales.buzzFeedbackCutoffHz, true),
  nDelay: new parameter.Parameter(4, scales.nDelay),
  buzzerDelaySeconds: Array.from(
    {length: scales.nDelay.max},
    (_, i) => {
      const buzzerDelayDefaults = [
        0.001, 0.007, 0.019, 0.029, 0.041, 0.053, 0.067, 0.079, 0.097, 0.113, 0.131, 0.151, 0.173,
        0.197, 0.223, 0.251
      ];
      return new parameter.Parameter(buzzerDelayDefaults[i], scales.buzzerDelaySeconds, true);
    }),

  frequency: new parameter.Parameter(20, scales.frequency, true),
  feedback: new parameter.Parameter(0.95, scales.feedback, true),
  dcHighpassCutoffHz: new parameter.Parameter(5, scales.dcHighpassCutoffHz, true),
  lpCutoffHz: new parameter.Parameter(80000.0, scales.lpCutoffHz, true),
  tensionMod: new parameter.Parameter(0.5, scales.tensionMod, false),

  stereoPickupSpread: new parameter.Parameter(0, scales.stereoPickupSpread, false),
  stereoBuzzerDetune: new parameter.Parameter(0, scales.stereoBuzzerDetune, false),
  stereoSeedOffset: new parameter.Parameter(0, scales.stereoSeedOffset),
};

const recipeBook = parameter.addLocalRecipes(localRecipeBook);
await parameter.loadJson(param, recipeBook, []);

function getSampleRateScaler() {
  return parseInt(menuitems.sampleRateScalerItems[param.sampleRateScaler.dsp]);
}

function onNDelayChanged() {
  ui.buzzerDelaySeconds.setViewRange(0, param.nDelay.dsp);
  render();
}

function render() {
  audio.render(
    parameter.toMessage(param, {
      sampleRate: audio.audioContext.sampleRate * getSampleRateScaler(),
    }),
    param.normalize.dsp ? "link" : "bypass",
    playControl.togglebuttonQuickSave.state === 1,
  );
}

const audio = new wave.Audio(2, "./renderer.js");

const pageTitle = widget.pageTitle(document.body);
const divMain = widget.div(document.body, "main", undefined);

const divLeft = widget.div(divMain, undefined, "controlBlock");
const divMid = widget.div(divMain, undefined, "controlBlock");
const divRight = widget.div(divMain, undefined, "controlBlock");

const headingWaveform = widget.heading(divLeft, 6, "Waveform");
const divWaveRow = widget.div(divLeft, undefined, "viewRow");
const waveView = [
  new widget.WaveView(
    divWaveRow, uiSize.waveViewWidth, uiSize.waveViewHeight, audio.wave.data[0], false),
  new widget.WaveView(
    divWaveRow, uiSize.waveViewWidth, uiSize.waveViewHeight, audio.wave.data[1], false),
];

audio.addEventListener("renderfinish", (event) => {
  {
    const wave = event.detail;
    for (let i = 0; i < waveView.length; ++i) {
      { waveView[i].set(wave.data[i], wave.peakValue); }
    }
  }
});

const pRenderStatus = widget.paragraph(divLeft, "renderStatus", undefined);
audio.renderStatusElement = pRenderStatus;

const recipeExportDialog = new widget.RecipeExportDialog(document.body, (ev) => {
  parameter.downloadJson(param, version, recipeExportDialog.author, recipeExportDialog.recipeName);
});
const recipeImportDialog = new widget.RecipeImportDialog(document.body, (ev, data) => {
  const recipeName = parameter.addRecipe(param, recipeBook, data);
  if (recipeName) {
    widget.option(playControl.selectRandom, recipeName);
    playControl.selectRandom.value = recipeName;
    const runImport = () => {
      recipeBook.get(recipeName).setParameters(param);
      onNDelayChanged();
      widget.refresh(ui);
    };
    if (playControl.historyManager) {
      playControl.historyManager.transaction(`Import: ${recipeName}`, runImport);
    } else {
      runImport();
    }
  }
});

const playControl = widget.playControl(
  divLeft,
  (ev) => { audio.play(getSampleRateScaler()); },
  (ev) => { audio.stop(); },
  (ev) => {
    audio.save(
      false, [], getSampleRateScaler(),
      parameter.dumpJsonString(param, version, {recipeName: util.getTimeStamp()}));
  },
  (ev) => {},
  (ev) => {
    recipeBook.get(playControl.selectRandom.value).randomize(param);
    onNDelayChanged();
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
  param,
  () => {
    onNDelayChanged();
    widget.refresh(ui);
    render();
  },
);

const detailRender = widget.details(divLeft, "Render");
const detailExcitation = widget.details(divLeft, "Excitation");
const detailCollision = widget.details(divMid, "Collision");
const detailBuzzer = widget.details(divMid, "Buzz");
const detailMainPath = widget.details(divMid, "Main Path");
const detailBuzzSaturator = widget.details(divRight, "Saturator");
const detailStereo = widget.details(divRight, "Stereo");

const ui = {
  renderDuration: new widget.NumberInput(detailRender, "Length [s]", param.renderDuration, render),
  fadeIn: new widget.NumberInput(detailRender, "Declick In [s]", param.fadeIn, render),
  fadeOut: new widget.NumberInput(detailRender, "Declick Out [s]", param.fadeOut, render),
  decayTo: new widget.NumberInput(detailRender, "Decay To [dB]", param.decayTo, render),
  overSample: new widget.ComboBoxLine(detailRender, "Oversampling", param.overSample, render),
  sampleRateScaler:
    new widget.ComboBoxLine(detailRender, "Sample Rate Scale", param.sampleRateScaler, render),
  normalize: new widget.ToggleButtonLine(
    detailRender, ["Normalize Off", "Normalize On"], param.normalize, render),

  excitationGain:
    new widget.NumberInput(detailExcitation, "Gain [dB]", param.excitationGain, render),

  noiseSeed: new widget.NumberInput(detailExcitation, "Noise Seed", param.noiseSeed, render),
  noiseDecay: new widget.NumberInput(detailExcitation, "Noise Decay [s]", param.noiseDecay, render),
  noiseFilterType:
    new widget.ComboBoxLine(detailExcitation, "Noise Filter Type", param.noiseFilterType, render),
  noiseFilterQ:
    new widget.NumberInput(detailExcitation, "Noise Filter Q", param.noiseFilterQ, render),
  noiseFilterCutoffStart: new widget.NumberInput(
    detailExcitation, "Filter Cutoff Start [st.]", param.noiseFilterCutoffStart, render),
  noiseFilterCutoffEnd: new widget.NumberInput(
    detailExcitation, "Filter Cutoff End [st.]", param.noiseFilterCutoffEnd, render),

  fretAction: new widget.NumberInput(detailCollision, "Action", param.fretAction, render),
  fretRestitution:
    new widget.NumberInput(detailCollision, "Restitution", param.fretRestitution, render),
  segments: new widget.NumberInput(detailCollision, "Segments", param.segments, render),
  segmentInterval:
    new widget.ComboBoxLine(detailCollision, "Interval", param.segmentInterval, render),
  slapPosition: new widget.NumberInput(detailCollision, "Strike Point", param.slapPosition, render),
  pickupPosition:
    new widget.NumberInput(detailCollision, "Pickup Position", param.pickupPosition, render),

  buzzerGain: new widget.NumberInput(detailBuzzer, "Gain", param.buzzerGain, render),
  buzzerFeedback: new widget.NumberInput(detailBuzzer, "Feedback", param.buzzerFeedback, render),
  buzzerFeedbackSign:
    new widget.ComboBoxLine(detailBuzzer, "Feedback Signs", param.buzzerFeedbackSign, render),
  buzzFeedbackCutoffHz: new widget.NumberInput(
    detailBuzzer, "Feedback Lowpass [Hz]", param.buzzFeedbackCutoffHz, render),
  nDelay: new widget.NumberInput(detailBuzzer, "Delay Count", param.nDelay, onNDelayChanged),
  buzzerDelaySeconds: new widget.BarBox(
    detailBuzzer, "Delay [s]", uiSize.barboxWidth, uiSize.barboxHeight, param.buzzerDelaySeconds,
    render),

  frequency: new widget.NumberInput(detailMainPath, "Frequency [Hz]", param.frequency, render),
  feedback: new widget.NumberInput(detailMainPath, "Feedback", param.feedback, render),
  dcHighpassCutoffHz:
    new widget.NumberInput(detailMainPath, "DC Highpass [Hz]", param.dcHighpassCutoffHz, render),
  lpCutoffHz: new widget.NumberInput(detailMainPath, "LP Cutoff [Hz]", param.lpCutoffHz, render),
  tensionMod: new widget.NumberInput(detailMainPath, "Tension Mod", param.tensionMod, render),

  buzzBiasedAdaaGain:
    new widget.NumberInput(detailBuzzSaturator, "Gain", param.buzzBiasedAdaaGain, render),
  buzzBiasedAdaaBias:
    new widget.NumberInput(detailBuzzSaturator, "Bias", param.buzzBiasedAdaaBias, render),
  buzzBiasedAdaaDryMix:
    new widget.NumberInput(detailBuzzSaturator, "Dry Mix", param.buzzBiasedAdaaDryMix, render),
  buzzBiasedAdaaScale:
    new widget.NumberInput(detailBuzzSaturator, "Scale", param.buzzBiasedAdaaScale, render),

  stereoPickupSpread:
    new widget.NumberInput(detailStereo, "Pickup Spread", param.stereoPickupSpread, render),
  stereoBuzzerDetune:
    new widget.NumberInput(detailStereo, "Buzzer Detune", param.stereoBuzzerDetune, render),
  stereoSeedOffset:
    new widget.NumberInput(detailStereo, "Excitation Seed Offset", param.stereoSeedOffset, render),
};

onNDelayChanged();
window.addEventListener("load", (ev) => { widget.refresh(ui); });
