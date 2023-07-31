const TWO_PI = 2 * Math.PI;

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

function getChannels() {
  switch (pullDownMenuChannel.value) {
    case "Mono":
      return 1;
    case "Stereo":
      return 2;
  }
  return wave.channels;
}

function makeWave() {
  headingRenderStatus.element.textContent = "⚠ Rendering ⚠";
  var channels = getChannels();
  for (var ch = 0; ch < channels; ++ch) {
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
      highpass: checkboxHighpass.value,
      // overSampling: checkboxResample.value ? 16 : 1,
      overSampling: 1,
      cymbalCount: inputCymbalCount.value,
      minFrequency: inputMinFrequency.value,
      maxFrequency: inputMaxFrequency.value,
      seed: inputSeed.value + inputSeed.max * ch,
      stack: inputStackCount.value,
      pickCombFB: inputPickCombFeedback.value,
      pickCombTime: Math.pow(2, inputPickCombTime.value),
      distance: inputDistance.value,
      pulsePosition: inputPulsePosition.value,
      pulseWidth: inputPulseWidth.value,
      dx: dxValue(),
      damping: inputDamping.value,
      stiffness: 10 ** inputStiffness.value,
      decay: 2 ** (inputDecay.max - inputDecay.value),
      bandpassQ: inputBandpassQ.value,
      bandSplit: pullDownMenuBandSplit.value,
      simulator: pullDownSimulator.value,
    });
  }
  for (var ch = channels; ch < wave.channels; ++ch) {
    workers[ch].isRunning = false;
  }

  workers.forEach((value, index) => {
    value.worker.onmessage = (event) => {
      wave.data[index] = event.data;
      workers[index].isRunning = false;
      if (workers.every((v) => !v.isRunning)) {
        if (channels === 1) {
          wave.copyChannel(index);
        }
        finalize();
      }
    };
  });
}

function dxValue() {
  if (pullDownSimulator.value === "Newmark-β") {
    return 10 ** (-2 + inputDx.value - inputDx.max);
  }
  return 10 ** (-1 + inputDx.value - inputDx.max);
}

function finalize() {
  wave.declickRatio(inputFadeIn.value, inputFadeOut.value);
  if (checkboxNormalize.value) {
    wave.normalize();
  }
  wave.zeroOut(Math.floor(0.002 * audioContext.sampleRate));
  waveView.set(wave);

  if (checkboxQuickSave.value) {
    save(wave);
  }

  headingRenderStatus.element.textContent = "Rendering finished. ✓";
}

class WaveViewMulti {
  constructor(parent, channels) {
    this.waveView = [];
    for (var i = 0; i < channels; ++i) {
      this.waveView.push(new WaveView(parent, 450, 256, wave.left, false));
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

function randomRange(min, max) {
  return (max - min) * Math.random() + min;
}

function random() {
  if (pullDownMenuRandomType.value === "Seed") {
    inputSeed.random();
  }
  else {
    // "All" case.
    // inputFadeIn.random()
    // inputFadeOut.random()

    inputSeed.random();
    inputCymbalCount.random();
    inputDecay.random();
    inputDx.random();
    inputDamping.random();
    inputStiffness.random();
    inputPulsePosition.random();
    inputPulseWidth.random();
    inputMinFrequency.random();
    inputMaxFrequency.random();
    inputBandpassQ.random();
    inputDistance.random();
    // inputStackCount.random()
    inputPickCombFeedback.random();
    inputPickCombTime.random();
  }
  refresh();
}


//-- UI.

var audioContext = new AudioContext();

var wave = new Wave(2);
var workers = [];
for (var ch = 0; ch < wave.channels; ++ch) {
  workers.push({
    worker: new Worker("renderer.js"),
    isRunning: false,
  });
}

var divMain = new Div(document.body, "main");
var headingTitle = pageTitle(divMain.element);

var description = new Description(divMain.element);
description.add("基本操作", "Playボタンかキーボードのスペースキーで音が再生されます。");
description.add("", "値を変更するかRandomボタンを押すと音がレンダリングされます。");
description.add("", "Randomボタンの隣のプルダウンメニューでランダマイズの種類を選択できます。");
description.add("", "Saveボタンで気に入った音を保存できます。");
description.add("", "QuickSaveにチェックを入れると音を再生するたびに音が保存されます。");
description.add("注意", "システムのサンプリング周波数によってピッチが変わります。");
description.add("", "Explicitが発散するときはDxの値を上げてください。");
description.add("", "Newmark-βはレンダリングに時間がかかります。");

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
pullDownMenuRandomType.add("Seed");
var buttonSave = new Button(divRenderControls.element, "Save",
  () => save(wave));
var checkboxQuickSave = new Checkbox(divRenderControls.element, "QuickSave",
  false, (checked) => { });

//// ControlLeft
var divControlLeft = new Div(divMain.element, "controlLeft", "controlBlock");

var divMiscControls = new Div(divControlLeft.element, "miscControls");
var headingRender = new Heading(divMiscControls.element, 6, "Render Settings");
var inputLength = new NumberInput(divMiscControls.element,
  "Length", 1, 0.02, 16, 0.01, refresh);
var pullDownMenuChannel = new PullDownMenu(divMiscControls.element,
  null, refresh);
pullDownMenuChannel.add("Mono");
pullDownMenuChannel.add("Stereo");
var checkboxNormalize = new Checkbox(divMiscControls.element, "Normalize",
  true, refresh);
var checkboxHighpass = new Checkbox(divMiscControls.element, "Highpass",
  false, refresh);
// var checkboxResample = new Checkbox(divMiscControls.element, "16x Sampling",
//   false, refresh)

var divEnvGainControls = new Div(divControlLeft.element, "envGainControls");
var headingEnvGain = new Heading(divEnvGainControls.element, 6, "Gain Envelope");
var inputFadeIn = new NumberInput(divEnvGainControls.element,
  "FadeIn", 0, 0, 100, 0.01, refresh);
var inputFadeOut = new NumberInput(divEnvGainControls.element,
  "FadeOut", 0, 0, 100, 0.01, refresh);

var divCymbalControls = new Div(divControlLeft.element, "cymbalControls");
var headingPluck = new Heading(divCymbalControls.element, 6, "Cymbal");
var inputSeed = new NumberInput(divCymbalControls.element,
  "Seed", 0, 0, Math.floor(Number.MAX_SAFE_INTEGER / 2), 1, refresh);
var inputCymbalCount = new NumberInput(divCymbalControls.element,
  "CymbalCount", 2, 1, 8, 1, refresh);
var inputDecay = new NumberInput(divCymbalControls.element,
  "Decay", 1, 0, 4, 0.0001, refresh);
var inputDx = new NumberInput(divCymbalControls.element,
  "Dx", 0.15, 0, 3, 0.0001, refresh);
var inputDamping = new NumberInput(divCymbalControls.element,
  "Damping", 16, 0, 32, 0.0001, refresh);
var inputStiffness = new NumberInput(divCymbalControls.element,
  "Stiffness", 8.27, 3, 9, 0.0001, refresh);
var inputPulsePosition = new NumberInput(divCymbalControls.element,
  "PulsePosition", 0, 0, 1, 0.0001, refresh);
var inputPulseWidth = new NumberInput(divCymbalControls.element,
  "PulseWidth", 0.1, 0, 1, 0.0001, refresh);
var inputMinFrequency = new NumberInput(divCymbalControls.element,
  "MinFrequency", 80, 0, 1000, 0.001, refresh);
var inputMaxFrequency = new NumberInput(divCymbalControls.element,
  "MaxFrequency", 200, 10, 4000, 0.001, refresh);
var inputBandpassQ = new NumberInput(divCymbalControls.element,
  "BandpassQ", 0.1, 0.0001, 0.9999, 0.0001, refresh);
var inputDistance = new NumberInput(divCymbalControls.element,
  "Distance", 0.02, 0, 0.1, 0.0001, refresh);
var inputStackCount = new NumberInput(divCymbalControls.element,
  "Stack", 24, 2, 256, 1, refresh);
var inputPickCombFeedback = new NumberInput(divCymbalControls.element,
  "PickCombFB", 0.3, 0, 0.9999, 0.0001, refresh);
var inputPickCombTime = new NumberInput(divCymbalControls.element,
  "PickCombTime", 0, -2, 6, 0.1, refresh);
var pullDownMenuBandSplit = new PullDownMenu(divCymbalControls.element,
  null, refresh);
pullDownMenuBandSplit.add("Log");
pullDownMenuBandSplit.add("Linear");
var pullDownSimulator = new PullDownMenu(divCymbalControls.element,
  null, refresh);
pullDownSimulator.add("Explicit");
pullDownSimulator.add("Newmark-β");

refresh();

window.addEventListener("keydown", (event) => {
  if (event.keyCode === 32) {
    play(audioContext, wave);
  }
});

// If startup is succeeded, remove "unsupported" paragaraph.
document.getElementById("unsupported").outerHTML = "";
