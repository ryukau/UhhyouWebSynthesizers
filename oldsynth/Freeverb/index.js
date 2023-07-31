const TWO_PI = 2 * Math.PI;

class RenderParameters {
  constructor(audioContext, overSampling) {
    this.audioContext = audioContext;
    this.overSampling = overSampling;
  }

  get sampleRate() {
    return this._sampleRate;
  }

  get overSampling() {
    return this._overSampling;
  }

  set overSampling(value) {
    this._overSampling = value;
    this._sampleRate = this._overSampling * this.audioContext.sampleRate;
  }
}

function play(audioContext, wave) {
  var channel = wave.channels;
  var frame = wave.frames;
  var buffer = audioContext.createBuffer(channel, frame, audioContext.sampleRate);

  for (var i = 0; i < wave.channels; ++i) {
    var waveFloat32 = new Float32Array(wave.data[i]);
    buffer.copyToChannel(waveFloat32, i, 0);
  }

  if (this.source !== undefined) {
    this.source.stop();
  }
  this.source = audioContext.createBufferSource();
  this.source.buffer = buffer;
  this.source.connect(audioContext.destination);
  this.source.start();
}

function save(wave) {
  var buffer = Wave.toBuffer(wave, wave.channels);
  var header = Wave.fileHeader(audioContext.sampleRate, wave.channels,
    buffer.length);

  var blob = new Blob([header, buffer], { type: "application/octet-stream" });
  var url = window.URL.createObjectURL(blob);

  var a = document.createElement("a");
  a.style = "display: none";
  a.href = url;
  a.download = document.title + "_" + Date.now() + ".wav";
  document.body.appendChild(a);
  a.click();

  // Firefoxでダウンロードできるようにするための遅延。
  setTimeout(() => {
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, 100);
}

function makeWave() {
  headingRenderStatus.element.textContent = "⚠ Rendering ⚠";
  for (var ch = 0; ch < wave.channels; ++ch) {
    if (workers[ch].isRunning) {
      workers[ch].worker.terminate();
      workers[ch].worker = new Worker("renderer.js");
    }
    else {
      workers[ch].isRunning = true;
    }
    workers[ch].worker.postMessage({
      length: inputLength.value,
      sampleRate: audioContext.sampleRate,
      overSampling: checkboxResample.value ? 16 : 1,
      damp: inputDamp.value,
      roomsize: inputRoomsize.value,
      combLength: inputCombLength.value,
      combDelayMin: inputCombDelayMin.value,
      combDelayRange: inputCombDelayRange.value,
      allpassLength: inputAllpassLength.value,
      allpassGain: inputAllpassGain.value,
      allpassDelayMin: inputAllpassDelayMin.value,
      allpassDelayRange: inputAllpassDelayRange.value,
      allpassMixStepe: inputAllpassMixStep.value,
      erRatio: inputERRatio.value,
      erTaps: inputERTaps.value,
      erRange: inputERRange.value,
      feedback: inputFeedback.value,
      highpassCutoff: inputFeedbackHighpassCutoff.value,
      seed: inputSeed.value + inputSeed.max * ch,
    });
  }

  workers.forEach((value, index) => {
    value.worker.onmessage = (event) => {
      wave.data[index] = event.data;
      workers[index].isRunning = false;
      if (workers.every((v) => !v.isRunning)) {
        if (checkboxTrim.value) {
          wave.trim();
        }
        wave.declick(inputDeclickIn.value, inputDeclickOut.value);
        if (checkboxNormalize.value) {
          wave.normalize();
        }
        waveView.set(wave);

        if (checkboxQuickSave.value) {
          save(wave);
        }

        headingRenderStatus.element.textContent = "Rendering finished. ✓";
      }
    };
  });
}

class WaveViewMulti {
  constructor(parent, channels) {
    this.waveView = [];
    for (var i = 0; i < channels; ++i) {
      this.waveView.push(new WaveView(parent, 512, 256, wave.left, false));
    }
  }

  set(wave) {
    for (var ch = 0; ch < this.waveView.length; ++ch) {
      this.waveView[ch].set(wave.data[ch]);
    }
  }
}

function refresh() {
  makeWave();
}

function random() {
  // inputFeedback.random()
  // inputFeedbackHighpassCutoff.random()
  inputDamp.random();
  inputRoomsize.random();
  inputCombLength.random();
  inputCombDelayMin.random();
  inputCombDelayRange.random();
  inputAllpassLength.random();
  inputAllpassGain.random();
  inputAllpassDelayMin.random();
  inputAllpassDelayRange.random();
  inputAllpassMixStep.random();
  inputERRatio.random();
  inputERTaps.random();
  inputERRange.random();
  inputSeed.random();
  refresh();
}


//-- UI.

var audioContext = new AudioContext();
var renderParameters = new RenderParameters(audioContext, 16);

var wave = new Wave(2);
var workers = [];
for (var ch = 0; ch < wave.channels; ++ch) {
  workers.push({
    worker: new Worker("renderer.js"),
    isRunning: true,
  });
}

var divMain = new Div(document.body, "main");
var headingTitle = pageTitle(divMain.element);

var description = new Description(divMain.element);
description.add("基本操作", "Playボタンでインパルス応答が再生されます。");
description.add("", "値を変更するかRandomボタンを押すとインパルス応答がレンダリングされます。");
description.add("", "Saveボタンで気に入ったインパルス応答を保存できます。");
description.add("", "QuickSaveにチェックを入れるとレンダリングが終了するたびにインパルス応答を保存します。");
description.add("⚠注意", "以下の値を有効あるいは大きくするとレンダリング時間が長くなるので注意してください。");
description.add("", "- Length");
description.add("", "- 16x Sampling");
description.add("", "- ER.Taps");
description.add("", "- Comb");
description.add("", "- Allpass");

var divWaveform = new Div(divMain.element, "waveform");
var headingWaveform = new Heading(divWaveform.element, 6, "Waveform");
var waveView = new WaveViewMulti(divWaveform.element, wave.channels);

var divRenderControls = new Div(divMain.element, "renderControls");
var headingRenderStatus = new Heading(divRenderControls.element, 4,
  "Rendering status will be displayed here.");
var buttonPlay = new Button(divRenderControls.element, "Play",
  () => play(audioContext, wave));
var buttonRandom = new Button(divRenderControls.element, "Random",
  () => random());
var pullDownMenuRandomType = new PullDownMenu(divRenderControls.element, null,
  () => { });
pullDownMenuRandomType.add("All");
var buttonSave = new Button(divRenderControls.element, "Save",
  () => save(wave));
var checkboxQuickSave = new Checkbox(divRenderControls.element, "QuickSave",
  false, (checked) => { });

var divMiscControls = new Div(divMain.element, "MiscControls");
var headingRender = new Heading(divMiscControls.element, 6, "Render Settings");
var inputLength = new NumberInput(divMiscControls.element, "Length",
  2, 0.02, 16, 0.01, (value) => { refresh(); });
var tenMilliSecond = audioContext.sampleRate / 100;
var inputDeclickIn = new NumberInput(divMiscControls.element, "Declick In",
  2, 0, tenMilliSecond, 1, refresh);
var inputDeclickOut = new NumberInput(divMiscControls.element, "Declick Out",
  Math.floor(tenMilliSecond / 10), 0, tenMilliSecond, 1, refresh);
var checkboxNormalize = new Checkbox(divMiscControls.element, "Normalize",
  true, refresh);
var checkboxResample = new Checkbox(divMiscControls.element, "16x Sampling",
  false, refresh);
var checkboxTrim = new Checkbox(divMiscControls.element, "Trim",
  false, refresh);

var divReverbControls = new Div(divMain.element, "MiscControls");
var headingReverb = new Heading(divReverbControls.element, 6, "Reverb");
var inputFeedback = new NumberInput(divReverbControls.element,
  "Feedback", 0, 0, 1.0, 0.0001, refresh);
var inputFeedbackHighpassCutoff = new NumberInput(divReverbControls.element,
  "FB.Highpass", 0.25, 0, 1, 0.0001, refresh);
var inputERRatio = new NumberInput(divReverbControls.element,
  "ER.Ratio", 0.2, 0, 1, 0.001, refresh);
var inputERTaps = new NumberInput(divReverbControls.element,
  "ER.Taps", 16, 0, 128, 1, refresh);
var inputERRange = new NumberInput(divReverbControls.element,
  "ER.Range", 0.002, 0.0001, 0.01, 0.0001, refresh);
var inputDamp = new NumberInput(divReverbControls.element,
  "Damp", 0.2, 0, 0.999, 0.001, refresh);
var inputRoomsize = new NumberInput(divReverbControls.element,
  "Roomsize", 0.84, 0, 1, 0.001, refresh);
var inputCombLength = new NumberInput(divReverbControls.element,
  "Comb", 8, 1, 128, 1, refresh);
var inputCombDelayMin = new NumberInput(divReverbControls.element,
  "CombMin", 0.04, 0.0001, 0.1, 0.0001, refresh);
var inputCombDelayRange = new NumberInput(divReverbControls.element,
  "CombRange", 0.03, 0.0001, 0.1, 0.0001, refresh);
var inputAllpassLength = new NumberInput(divReverbControls.element,
  "Allpass", 4, 1, 128, 1, refresh);
var inputAllpassGain = new NumberInput(divReverbControls.element,
  "AllpassGain", 0.5, 0.01, 1, 0.001, refresh);
var inputAllpassDelayMin = new NumberInput(divReverbControls.element,
  "AllpassMin", 0.005, 0.0001, 0.1, 0.0001, refresh);
var inputAllpassDelayRange = new NumberInput(divReverbControls.element,
  "AllpassRange", 0.025, 0.0001, 0.1, 0.0001, refresh);
var inputAllpassMixStep = new NumberInput(divReverbControls.element,
  "AllpassMixStep", 0, 0, 16, 1, refresh);
var inputSeed = new NumberInput(divReverbControls.element,
  "Seed", 0, 0, Math.floor(Number.MAX_SAFE_INTEGER / 2), 1, refresh);

refresh();

// If startup is succeeded, remove "unsupported" paragaraph.
document.getElementById("unsupported").outerHTML = "";
