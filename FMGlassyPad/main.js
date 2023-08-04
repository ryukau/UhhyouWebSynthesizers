// Copyright 2023 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {uiSize} from "../common/gui/palette.js";
import * as widget from "../common/gui/widget.js";
import * as parameter from "../common/parameter.js";
import * as util from "../common/util.js";
import * as wave from "../common/wave.js";

import * as menuitems from "./menuitems.js";
import {justIntonationTable, maxReverbTimeSeconds} from "./shared.js"

function randomize() {
  if (selectRandom.value === "Default") {
    for (const key in param) {
      if (key === "renderDuration") continue;
      if (key === "fadeIn") continue;
      if (key === "fadeOut") continue;
      if (key === "decayTo") continue;
      if (key === "stereoMerge") continue;
      if (key === "dcHighpassHz") continue;
      if (key === "toneSlope") continue;

      if (key === "frequencyHz") continue;
      if (key === "nUnison") continue;
      if (key === "chord1Ratio") continue;
      if (key === "unisonPitchSpreadCents") continue;
      if (key === "chord2Notes") continue;

      if (key === "lfoFreqHz") {
        param[key].dsp = util.exponentialMap(Math.random(), 0.01, 4);
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
  }

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
    }),
    "perChannel",
    togglebuttonQuickSave.state === 1,
  );
}

const scales = {
  boolean: new parameter.IntScale(0, 1),

  renderDuration: new parameter.DecibelScale(-40, 40, false),
  fade: new parameter.DecibelScale(-60, 40, true),
  decayTo: new parameter.DecibelScale(util.ampToDB(1 / 2 ** 24), 0, false),
  stereoMerge: new parameter.LinearScale(0, 1),
  overSample: new parameter.MenuItemScale(menuitems.oversampleItems),
  toneSlope: new parameter.DecibelScale(-12, 0, false),

  seed: new parameter.IntScale(0, 2 ** 32),
  gainAttackSeconds: new parameter.DecibelScale(-80, 40, false),

  frequencyHz: new parameter.DecibelScale(0, 100, false),
  octaveRandomize: new parameter.IntScale(0, 8),
  chord1NoteCount: new parameter.IntScale(1, 8),
  chord1Ratio: new parameter.LinearScale(1, 2),
  chord1OctaveWrap: new parameter.IntScale(1, 8),
  modAttackSeconds: new parameter.DecibelScale(-40, 0, false),
  modDecaySeconds: new parameter.DecibelScale(-60, 60, false),
  nUnison: new parameter.IntScale(1, 128),
  unisonPitchSpreadCents: new parameter.LinearScale(0, 500),
  fmIndex: new parameter.DecibelScale(util.ampToDB(1 / 4), util.ampToDB(16), true),

  reverbMix: new parameter.DecibelScale(-60, 0, true),
  reverbSeconds:
    new parameter.DecibelScale(-60, util.ampToDB(maxReverbTimeSeconds), true),
  reverbFeedback: new parameter.NegativeDecibelScale(-60, 0, 1, true),
  reverbHighpassHz: new parameter.DecibelScale(0, 60, true),

  nTap: new parameter.IntScale(1, 128),
  mix: new parameter.LinearScale(0, 1),
  delayBaseHz: new parameter.DecibelScale(util.ampToDB(100), 100, false),
  delayRandomRatio: new parameter.DecibelScale(0, util.ampToDB(16), false),
  lfoFreqHz: new parameter.DecibelScale(-40, 20, true),
  lfoAmount: new parameter.DecibelScale(-40, util.ampToDB(16), true),
  phase: new parameter.LinearScale(0, 1),
};

const param = {
  renderDuration: new parameter.Parameter(2, scales.renderDuration, true),
  fadeIn: new parameter.Parameter(0.01, scales.fade, true),
  fadeOut: new parameter.Parameter(0.002, scales.fade, true),
  decayTo: new parameter.Parameter(0.01, scales.decayTo, false),
  stereoMerge: new parameter.Parameter(0, scales.stereoMerge),
  overSample: new parameter.Parameter(1, scales.overSample),
  toneSlope: new parameter.Parameter(1, scales.toneSlope, false),

  seed: new parameter.Parameter(0, scales.seed, true),
  gainAttackSeconds: new parameter.Parameter(0.002, scales.gainAttackSeconds, true),

  frequencyHz:
    new parameter.Parameter(util.midiPitchToFreq(72), scales.frequencyHz, true),
  centsRandomize: new parameter.Parameter(
    1200 * Math.log2(81 / 80), // Syntonic comma.
    scales.unisonPitchSpreadCents, true),
  octaveRandomize: new parameter.Parameter(0, scales.octaveRandomize, true),
  nUnison: new parameter.Parameter(4, scales.nUnison, true),
  unisonPitchSpreadCents: new parameter.Parameter(
    1200 * Math.log2(81 / 80), // Syntonic comma.
    scales.unisonPitchSpreadCents, true),
  chord1NoteCount: new parameter.Parameter(3, scales.chord1NoteCount, true),
  chord1Ratio: new parameter.Parameter(1.5, scales.chord1Ratio, true),
  chord1OctaveWrap: new parameter.Parameter(3, scales.chord1OctaveWrap, true),
  modAttackSeconds: new parameter.Parameter(0.1, scales.modAttackSeconds, true),
  modDecaySeconds: new parameter.Parameter(4, scales.modDecaySeconds, true),
  fmIndex: new parameter.Parameter(1, scales.fmIndex, true),

  reverbMix: new parameter.Parameter(0.1, scales.reverbMix, false),
  reverbSeconds: new parameter.Parameter(0.01, scales.reverbSeconds, true),
  reverbFeedback: new parameter.Parameter(0.98, scales.reverbFeedback, true),
  reverbHighpassHz: new parameter.Parameter(4, scales.reverbHighpassHz, true),

  flangerMix: new parameter.Parameter(0.5, scales.mix, true),
  nTap: new parameter.Parameter(16, scales.nTap, true),
  delayBaseHz: new parameter.Parameter(1000, scales.delayBaseHz, true),
  delayRandomRatio: new parameter.Parameter(2, scales.delayRandomRatio, true),
  lfoFreqHz: new parameter.Parameter(1, scales.lfoFreqHz, true),
  lfoAmount: new parameter.Parameter(1, scales.lfoAmount, true),
  lfoInitialPhase: new parameter.Parameter(0, scales.phase, true),

  chord2Notes: createArrayParameters(
    [
      1, // 0
      0, // 1
      1, // 2
      0, // 3
      0, // 4
      0, // 5
      0, // 6 aug. Pairs with 11.
      0, // 6 aug. (7-limit)
      0, // 6 dim. Pairs with 1.
      1, // 7
      0, // 8
      1, // 9
      0, // 10
      0, // 10 (7 or 17-limit)
      0, // 11
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
  divPlayControl, "Randomize Recipe", "randomRecipe", undefined,
  ["Default", "Snare1", "Snare2", "Body", "Noise", "Full"], "Default", (ev) => {
    if (ev.currentTarget.value === "Snare1" || ev.currentTarget.value === "Snare2") {
      param["hightoneGain"].dsp = util.dbToAmp(-40);
    }
    randomize();
  });
const buttonRandom = widget.Button(divPlayControl, "Random", (ev) => { randomize(); });
buttonRandom.id = "randomRecipe";
const spanPlayControlFiller = widget.span(divPlayControl, "playControlFiller", undefined);
const buttonPlay = widget.Button(divPlayControl, "Play", (ev) => { audio.play(); });
const buttonStop = widget.Button(divPlayControl, "Stop", (ev) => { audio.stop(); });
const buttonSave = widget.Button(divPlayControl, "Save", (ev) => { audio.save(); });
const togglebuttonQuickSave = new widget.ToggleButton(
  divPlayControl, "QuickSave", undefined, undefined, 0, (ev) => {});

const detailRender = widget.details(divLeft, "Render");
const detailMisc = widget.details(divLeft, "Misc.");
const detailReverb = widget.details(divLeft, "Reverb");
const detailFM = widget.details(divRightA, "FM");
const detailFlanger = widget.details(divRightA, "Flanger");
const detailFMChord2 = widget.details(divRightB, "FM - Chord2");

const ui = {
  renderDuration:
    new widget.NumberInput(detailRender, "Duration [s]", param.renderDuration, render),
  fadeIn: new widget.NumberInput(detailRender, "Fade-in [s]", param.fadeIn, render),
  fadeOut: new widget.NumberInput(detailRender, "Fade-out [s]", param.fadeOut, render),
  decayTo: new widget.NumberInput(detailRender, "Decay To [dB]", param.decayTo, render),
  stereoMerge:
    new widget.NumberInput(detailRender, "Stereo Merge", param.stereoMerge, render),
  overSample:
    new widget.ComboBoxLine(detailRender, "Over-sample", param.overSample, render),
  toneSlope:
    new widget.NumberInput(detailRender, "Tone Slope [dB/oct]", param.toneSlope, render),

  seed: new widget.NumberInput(detailMisc, "Seed", param.seed, render),
  gainAttackSeconds: new widget.NumberInput(
    detailMisc, "Gain Attack [s]", param.gainAttackSeconds, render),

  frequencyHz:
    new widget.NumberInput(detailFM, "Frequency [Hz]", param.frequencyHz, render),
  centsRandomize:
    new widget.NumberInput(detailFM, "Pitch Random [cent]", param.centsRandomize, render),
  octaveRandomize:
    new widget.NumberInput(detailFM, "Pitch Random [oct]", param.octaveRandomize, render),
  nUnison: new widget.NumberInput(detailFM, "Unison Note Count", param.nUnison, render),
  unisonPitchSpreadCents: new widget.NumberInput(
    detailFM, "Unison Pitch Spread [cent]", param.unisonPitchSpreadCents, render),
  chord1NoteCount:
    new widget.NumberInput(detailFM, "Chord 1 Note Count", param.chord1NoteCount, render),
  chord1Ratio:
    new widget.NumberInput(detailFM, "Chord 1 Pitch Ratio", param.chord1Ratio, render),
  chord1OctaveWrap: new widget.NumberInput(
    detailFM, "Chord 1 Pitch Wrap [oct]", param.chord1OctaveWrap, render),
  modAttackSeconds:
    new widget.NumberInput(detailFM, "Mod Attack [s]", param.modAttackSeconds, render),
  modDecaySeconds:
    new widget.NumberInput(detailFM, "Mod Decay [s]", param.modDecaySeconds, render),
  fmIndex: new widget.NumberInput(detailFM, "FM Index", param.fmIndex, render),

  reverbMix: new widget.NumberInput(detailReverb, "Mix [dB]", param.reverbMix, render),
  reverbSeconds:
    new widget.NumberInput(detailReverb, "Max Delay [s]", param.reverbSeconds, render),
  reverbFeedback:
    new widget.NumberInput(detailReverb, "Feedback", param.reverbFeedback, render),
  reverbHighpassHz:
    new widget.NumberInput(detailReverb, "Highpass [Hz]", param.reverbHighpassHz, render),

  flangerMix:
    new widget.NumberInput(detailFlanger, "Mix [ratio]", param.flangerMix, render),
  nTap: new widget.NumberInput(detailFlanger, "nTap", param.nTap, render),
  delayBaseHz:
    new widget.NumberInput(detailFlanger, "Delay Base [Hz]", param.delayBaseHz, render),
  delayRandomRatio:
    new widget.NumberInput(detailFlanger, "Delay Random", param.delayRandomRatio, render),
  lfoFreqHz:
    new widget.NumberInput(detailFlanger, "LFO Frequency [Hz]", param.lfoFreqHz, render),
  lfoAmount: new widget.NumberInput(detailFlanger, "LFO Amount", param.lfoAmount, render),
  lfoInitialPhase: new widget.NumberInput(
    detailFlanger, "LFO Phase [rad/2π]", param.lfoInitialPhase, render),

  chord2Notes: new widget.MultiCheckBoxVertical(
    detailFMChord2, "Notes in Chord 2 (Just Intonation, Semitone)",
    [
      " 1 / 1  ,  0",
      "16 / 15 ,  1",
      " 9 / 8  ,  2",
      " 6 / 5  ,  3",
      " 5 / 4  ,  4",
      " 4 / 3  ,  5",
      "25 / 18 ,  6 aug. Pairs with 11.",
      " 7 / 5  ,  6 aug. (7-limit)",
      "36 / 25 ,  6 dim. Pairs with 1.",
      " 3 / 2  ,  7",
      " 8 / 5  ,  8",
      " 5 / 3  ,  9",
      " 9 / 5  ,  10",
      " 7 / 4  ,  10 (7 or 17-limit)",
      "15 / 8  ,  11",
    ],
    2 * uiSize.waveViewWidth, param.chord2Notes, render),
};

render();
window.addEventListener("load", (ev) => { widget.refresh(ui); });
