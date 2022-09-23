import * as widget from "../common/gui/widget.js";
import * as parameter from "../common/parameter.js";
import * as wave from "../common/wave.js";

import * as menuitems from "./menuitems.js";

function randomize() {
  for (const key in param) {
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

function createArrayParameters(defaultDspValue, scale) {
  let arr = new Array(scales.matrixSize.max);
  for (let i = 0; i < arr.length; ++i) {
    arr[i] = new parameter.Parameter(defaultDspValue, scale, true);
  }
  return arr;
}

function render() {
  audio.render(
    parameter.toMessage(param, {
      sampleRate: audio.audioContext.sampleRate,
      maxDelayTime: scales.delayTime.maxDsp,
    }),
    "perChannel",
    togglebuttonQuickSave.state === 1,
  );
}

const scales = {
  renderDuration: new parameter.DecibelScale(-40, 40, false),
  fade: new parameter.DecibelScale(-60, 40, false),
  overSample: new parameter.MenuItemScale(menuitems.oversampleItems),

  seed: new parameter.IntScale(0, 2 ** 32),
  nDelay: new parameter.IntScale(1, 256),
  noiseDecay: new parameter.DecibelScale(-80, 40, true),
  noiseMix: new parameter.DecibelScale(-60, 0, true),
  delayTime: new parameter.DecibelScale(-60, -20, true),
  feedback: new parameter.LinearScale(-1, 1),
  highpassHz: new parameter.MidiPitchScale(-37.0, 136.0, false),
  highpassQ: new parameter.LinearScale(0.01, Math.SQRT1_2),
};

const param = {
  renderDuration: new parameter.Parameter(1, scales.renderDuration, true),
  fadeOut: new parameter.Parameter(0.002, scales.fade, true),
  overSample: new parameter.Parameter(1, scales.overSample),

  seed: new parameter.Parameter(0, scales.seed),
  nDelay: new parameter.Parameter(8, scales.nDelay),
  noiseDecay: new parameter.Parameter(1, scales.noiseDecay, true),
  noiseMix: new parameter.Parameter(0.05, scales.noiseMix),
  delayTime: new parameter.Parameter(0.01, scales.delayTime, true),
  feedback: new parameter.Parameter(0.98, scales.feedback, true),
  highpassHz: new parameter.Parameter(20, scales.highpassHz, true),
  highpassQ: new parameter.Parameter(Math.SQRT1_2, scales.highpassQ),
};

// Add controls.

const fontSize
  = parseFloat(getComputedStyle(document.body).getPropertyValue("font-size"));
const waveViewWidth = 15 * fontSize;
const waveViewHeight = 8 * fontSize;
const barboxWidth = 32 * fontSize;
const barboxHeight = 12 * fontSize;

const pageTitle = widget.heading(document.body, 1, document.title, undefined, undefined);
const divMain = widget.div(document.body, "main", undefined);
const divLeft = widget.div(divMain, undefined, "controlBlock");

const headingWaveform = widget.heading(divLeft, 6, "Waveform");
const waveView = [
  new widget.WaveView(divLeft, waveViewWidth, waveViewHeight, undefined, false),
  new widget.WaveView(divLeft, waveViewWidth, waveViewHeight, undefined, false),
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

const divPlayControl = widget.div(divLeft, "playControl", undefined);
const selectRandom = widget.select(
  divPlayControl, "Randomize Recipe", "randomRecipe", undefined, ["Default"], "Default",
  (ev) => { randomize(); });
const buttonRandom = widget.Button(divPlayControl, "Random", (ev) => { randomize(); });
buttonRandom.id = "randomRecipe";
const spanPlayControlFiller = widget.span(divPlayControl, "playControlFiller", undefined);
const buttonPlay = widget.Button(divPlayControl, "Play", (ev) => { audio.play(); });
const buttonStop = widget.Button(divPlayControl, "Stop", (ev) => { audio.stop(); });
const buttonSave = widget.Button(divPlayControl, "Save", (ev) => { audio.save(); });
const togglebuttonQuickSave = new widget.ToggleButton(
  divPlayControl, "QuickSave", undefined, undefined, 0, (ev) => {});

const detailRender = widget.details(divLeft, "Render");
const detailDelay = widget.details(divLeft, "Delay");

const ui = {
  renderDuration:
    new widget.NumberInput(detailRender, "Duration [s]", param.renderDuration, render),
  fadeOut: new widget.NumberInput(detailRender, "Fade-out [s]", param.fadeOut, render),
  overSample:
    new widget.ComboBoxLine(detailRender, "Over-sample", param.overSample, render),

  seed: new widget.NumberInput(detailDelay, "Seed", param.seed, render),
  nDelay: new widget.NumberInput(detailDelay, "nDelay", param.nDelay, render),
  noiseDecay:
    new widget.NumberInput(detailDelay, "Noise Decay [s]", param.noiseDecay, render),
  noiseMix: new widget.NumberInput(detailDelay, "Noise Mix [dB]", param.noiseMix, render),
  delayTime:
    new widget.NumberInput(detailDelay, "Delay Time [s]", param.delayTime, render),
  feedback: new widget.NumberInput(detailDelay, "Feedback", param.feedback, render),
  highpassHz:
    new widget.NumberInput(detailDelay, "Highpass Cutoff [Hz]", param.highpassHz, render),
  highpassQ: new widget.NumberInput(detailDelay, "Highpass Q", param.highpassQ, render),
};

render();
