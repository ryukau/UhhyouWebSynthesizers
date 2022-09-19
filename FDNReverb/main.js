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

const audio = new wave.Audio(
  2,
  "./renderer.js",
  document.getElementById("renderStatus"),
  (wave) => {
    for (let i = 0; i < ui.waveView.length; ++i) ui.waveView[i].set(wave.data[i]);
  },
);

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

const divMain = document.getElementById("main");

const ui = {
  waveView: [
    new widget.WaveView(divMain, 384, 128, audio.wave.data[0], false),
    new widget.WaveView(divMain, 384, 128, audio.wave.data[1], false),
  ],

  play: new widget.Button(divMain, "Play", (ev) => { audio.play(); }),
  stop: new widget.Button(divMain, "Stop", (ev) => { audio.stop(); }),
  save: new widget.Button(divMain, "Save", (ev) => { audio.save(); }),

  renderDuration:
    new widget.NumberInput(divMain, "Duration [s]", param.renderDuration, render),
  fadeOut: new widget.NumberInput(divMain, "Fade out [s]", param.fadeOut, render),
  overSample: new widget.PullDownMenu(divMain, "Over-sample", ["1", "2"], "2", render),

  matrixSize:
    new widget.NumberInput(divMain, "MatrixSize", param.matrixSize, onMatrixSizeChanged),
  timeMultiplier:
    new widget.NumberInput(divMain, "Time Multiplier", param.timeMultiplier, render),
  feedback: new widget.NumberInput(divMain, "Feedback", param.feedback, render),
  matrixType: new widget.PullDownMenu(
    divMain, "Matrix Type",
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
  seed: new widget.NumberInput(divMain, "Seed", param.seed, render),

  delayTime:
    new widget.BarBox(divMain, "Delay Time [s]", 512, 200, param.delayTime, render),
  lowpassCutoffHz: new widget.BarBox(
    divMain, "Lowpass Cutoff [Hz]", 512, 200, param.lowpassCutoffHz, render),
  highpassCutoffHz: new widget.BarBox(
    divMain, "Highpass Cutoff [Hz]", 512, 200, param.highpassCutoffHz, render),
};

onMatrixSizeChanged(param.matrixSize.defaultDsp);
