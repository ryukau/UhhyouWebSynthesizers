import * as widget from "../common/gui/widget.js";
import * as parameter from "../common/parameter.js";
import * as wave from "../common/wave.js";

function createArrayParameters(defaultDspValue, scale) {
  let arr = new Array(scales.matrixSize.max);
  for (let i = 0; i < arr.length; ++i) {
    arr[i] = new parameter.Parameter(defaultDspValue, scale, true);
  }
  return arr;
}

function render(value) {
  audio.render(parameter.toMessage(param, {
    sampleRate: audio.audioContext.sampleRate,
    maxDelayTime: scales.delayTime.maxDsp,
    overSample: ui.overSample.value,
    matrixType: ui.matrixType.value,
  }));
}

function onMatrixSizeChanged(value) {
  ui.delayTime.setViewRange(0, value);
  ui.lowpassCutoffHz.setViewRange(0, value);
  ui.highpassCutoffHz.setViewRange(0, value);
  render(value);
}

const scales = {
  renderDuration: new parameter.DecibelScale(-40, 40, false),
  fade: new parameter.DecibelScale(-60, 40, false),

  matrixSize: new parameter.IntScale(1, 256),
  timeMultiplier: new parameter.LinearScale(0, 1),
  feedback: new parameter.NegativeDecibelScale(-60, 0, 1, true),
  seed: new parameter.IntScale(0, 2 ** 32),

  delayTime: new parameter.DecibelScale(-60, 0, true),
  lowpassCutoffHz: new parameter.MidiPitchScale(33.0, 136.0, false),
  highpassCutoffHz: new parameter.MidiPitchScale(-37.0, 81.0, true),
};

const param = {
  renderDuration: new parameter.Parameter(1, scales.renderDuration, true),
  fadeOut: new parameter.Parameter(0.002, scales.fade, true),

  matrixSize: new parameter.Parameter(64, scales.matrixSize),
  timeMultiplier: new parameter.Parameter(1.0, scales.timeMultiplier),
  feedback: new parameter.Parameter(0.98, scales.feedback, true),
  seed: new parameter.Parameter(0, scales.seed),

  delayTime: createArrayParameters(0.01, scales.delayTime),
  lowpassCutoffHz:
    createArrayParameters(scales.lowpassCutoffHz.maxDsp, scales.lowpassCutoffHz),
  highpassCutoffHz: createArrayParameters(5, scales.highpassCutoffHz),
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

const fontSize
  = parseFloat(getComputedStyle(document.body).getPropertyValue("font-size"));
const waveViewWidth = 15 * fontSize;
const waveViewHeight = 8 * fontSize;
const barboxWidth = 32 * fontSize;
const barboxHeight = 12 * fontSize;

const pageTitle = widget.heading(document.body, 1, document.title, undefined, undefined);
const divMain = widget.div(document.body, "main", undefined);

const divLeft = widget.div(divMain, undefined, "controlBlock");
const divRight = widget.div(divMain, undefined, "controlBlock");

const headingWaveform = widget.heading(divLeft, 6, "Waveform");
const waveView = [
  new widget.WaveView(divLeft, waveViewWidth, waveViewHeight, audio.wave.data[0], false),
  new widget.WaveView(divLeft, waveViewWidth, waveViewHeight, audio.wave.data[1], false),
];

const pRenderStatus = widget.paragraph(divLeft, "renderStatus", undefined);
audio.renderStatusElement = pRenderStatus;

const divPlayControl = widget.div(divLeft, "playControl", undefined);
const playButton = widget.Button(divPlayControl, "Play", (ev) => { audio.play(); });
const stopButton = widget.Button(divPlayControl, "Stop", (ev) => { audio.stop(); });
const saveButton = widget.Button(divPlayControl, "Save", (ev) => { audio.save(); });

const detailRender = widget.details(divLeft, "Render");
const detailFdn = widget.details(divLeft, "FDN");
const detailDelay = widget.details(divRight, "Delay & Filter");

const ui = {
  renderDuration:
    new widget.NumberInput(detailRender, "Duration [s]", param.renderDuration, render),
  fadeOut: new widget.NumberInput(detailRender, "Fade-out [s]", param.fadeOut, render),
  overSample: new widget.ComboBox(detailRender, "Over-sample", ["1", "2"], "2", render),

  matrixSize: new widget.NumberInput(
    detailFdn, "Matrix Size", param.matrixSize, onMatrixSizeChanged),
  timeMultiplier:
    new widget.NumberInput(detailFdn, "Time Multiplier", param.timeMultiplier, render),
  feedback: new widget.NumberInput(detailFdn, "Feedback", param.feedback, render),
  matrixType: new widget.ComboBox(
    detailFdn, "Matrix Type",
    [
      "orthogonal",
      "specialOrthogonal",
      "circulantOrthogonal",
      "circulant4",
      "circulant8",
      "circulant16",
      "circulant32",
      "upperTriangularPositive",
      "upperTriangularNegative",
      "lowerTriangularPositive",
      "lowerTriangularNegative",
      "schroederPositive",
      "schroederNegative",
      "absorbentPositive",
      "absorbentNegative",
      "hadamard",
      "conference",
    ],
    "specialOrthogonal", render),
  seed: new widget.NumberInput(detailFdn, "Seed", param.seed, render),

  delayTime: new widget.BarBox(
    detailDelay, "Delay Time [s]", barboxWidth, barboxHeight, param.delayTime, render),
  lowpassCutoffHz: new widget.BarBox(
    detailDelay, "Lowpass Cutoff [Hz]", barboxWidth, barboxHeight, param.lowpassCutoffHz,
    render),
  highpassCutoffHz: new widget.BarBox(
    detailDelay, "Highpass Cutoff [Hz]", barboxWidth, barboxHeight,
    param.highpassCutoffHz, render),
};

onMatrixSizeChanged(param.matrixSize.defaultDsp);
