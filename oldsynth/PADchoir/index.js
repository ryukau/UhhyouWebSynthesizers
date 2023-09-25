const TWO_PI = 2 * Math.PI;

function play(audioContext, wave, stop = false) {
  if (stop) {
    this.source.stop();
    return;
  }

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
  var header = Wave.fileHeader(audioContext.sampleRate, wave.channels, buffer.length);

  var blob = new Blob([header, buffer], {type: "application/octet-stream"});
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
    case "Phase":
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
    } else {
      workers[ch].isRunning = true;
    }
    workers[ch].worker.postMessage({
      sampleRate: audioContext.sampleRate,
      overSampling: checkboxResample.value ? 16 : 1,
      baseFreq: inputBaseFreq.value,
      bandWidth: inputBandWidth.value,
      seed: inputSeed.value + inputSeed.max * ch,
      tableSize: 2 ** inputTableSize.value,
      basefunc: pullDownMenuBaseFunction.index,
      basefuncP1: inputBaseFunctionP1.value,
      modType: pullDownMenuModType.index,
      modP1: inputModP1.value,
      modP2: inputModP2.value,
      modP3: inputModP3.value,
      filtType: pullDownMenuFiltType.index,
      filtCutoff: inputFiltCutoff.value,
      filtQ: inputFiltQ.value,
      harmonicShift: inputHarmonicShift.value,
      adaptiveHarmonics: pullDownMenuAdaptHarmo.index === 1,
      adaptBaseFreq: inputAdaptBaseFreq.value,
      adaptPower: inputAdaptPower.value,
      overtone: overtoneControl.overtone,
    });
  }

  workers.forEach((value, index) => {
    value.worker.onmessage = (event) => {
      wave.data[index] = event.data;
      workers[index].isRunning = false;
      if (workers.every((v) => !v.isRunning)) {
        if (channels === 1) {
          wave.copyChannel(index);
          if (pullDownMenuChannel.value === "Phase" && wave.channels > 1) {
            wave.rotate(1, Math.floor(wave.data[1].length / 2));
          }
        }
        finalize();
      }
    };
  });
}

function finalize() {
  if (checkboxNormalize.value) {
    wave.normalize();
  }
  // wave.zeroOut(Math.floor(0.002 * audioContext.sampleRate))
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

class OvertoneControl extends Canvas {
  constructor(parent, width, height, numOvertone, onChangeFunc) {
    super(parent, width, height);

    this.element.className = "overtoneControl";
    this.onChangeFunc = onChangeFunc;

    numOvertone = Math.floor(Math.max(1, numOvertone));
    this.overtone = new Array(numOvertone).fill(0);
    this.overtone[0] = 1;

    this.sliderWidth = width / numOvertone;

    this.isMouseDown = false;
    this.mouseX = null;

    this.element.addEventListener("wheel", this, false);
    this.element.addEventListener("mousedown", this, false);
    this.element.addEventListener("mouseup", this, false);
    this.element.addEventListener("mousemove", this, false);
    this.element.addEventListener("mouseleave", this, false);
    this.element.addEventListener("touchstart", this, false);
    this.element.addEventListener("touchend", this, false);
    this.element.addEventListener("touchmove", this, false);

    this.draw();
  }

  setOvertone(overtone) {
    if (overtone.length !== this.overtone.length) {
      console.log("Overtone length mismatch");
      console.trace();
      return;
    }

    var min = Number.MAX_VALUE;
    var max = Number.MIN_VALUE;
    for (var i = 0; i < overtone.length; ++i) {
      if (overtone[i] < min) min = overtone[i];
      if (overtone[i] > max) max = overtone[i];
    }

    var diff = max - min;
    for (var i = 0; i < this.overtone.length; ++i) {
      this.overtone[i] = (overtone[i] - min) / diff;
    }

    this.draw();
  }

  handleEvent(event) {
    switch (event.type) {
      case "wheel":
        this.onWheel(event);
        break;
      case "mousedown":
        this.onMouseDown(event);
        break;
      case "mouseup":
        this.onMouseUp(event);
        break;
      case "mousemove":
        this.onMouseMove(event);
        break;
      case "mouseleave":
        this.onMouseLeave(event);
        break;
      case "touchstart":
        this.onMouseDown(event);
        break;
      case "touchend":
        this.onMouseUp(event);
        break;
      case "touchmove":
        this.onMouseMove(event);
        break;
    }
  }

  getMousePosition(event) {
    var point = event.type.includes("touch") ? event.touches[0] : event;

    var rect = event.target.getBoundingClientRect();
    var x = Math.floor(point.clientX - rect.left);
    var y = event.ctrlKey ? this.height
      : event.altKey      ? 0
                          : Math.floor(point.clientY - rect.top);
    return new Vec2(x, y);
  }

  onMouseDown(event) {
    this.isMouseDown = true;

    this.setValueFromPosition(this.getMousePosition(event));
  }

  onMouseUp(event) {
    this.isMouseDown = false;
    this.onChangeFunc();
  }

  onMouseMove(event) {
    var pos = this.getMousePosition(event);
    this.mouseX = pos.x;

    if (this.isMouseDown)
      this.setValueFromPosition(pos);
    else
      this.draw();
  }

  onMouseLeave(event) {
    if (this.isMouseDown === true) this.onChangeFunc();

    this.isMouseDown = false;
    this.mouseX = null;
    this.draw();
  }

  onWheel(event) {
    event.preventDefault(); // 画面のスクロールを阻止。

    var rect = event.target.getBoundingClientRect();
    var x = Math.floor(event.clientX - rect.left);
    var index = Math.floor(x / this.sliderWidth);

    if (event.ctrlKey) {
      this.setValue(index, this.overtone[index] - 0.001 * event.deltaY);
    } else {
      this.setValue(index, this.overtone[index] - 0.003 * event.deltaY);
    }

    this.draw();
    this.onChangeFunc();
  }

  setValue(index, value) { this.overtone[index] = Math.max(0, Math.min(value, 1)); }

  setValueFromPosition(position) {
    var index = Math.floor(position.x / this.sliderWidth);
    var value = 1 - position.y / this.height;

    this.setValue(index, value);
    this.draw();
  }

  draw() {
    this.clearWhite();

    var ctx = this.context;

    ctx.fillStyle = "#88bbff";
    ctx.strokeStyle = "#333333";
    ctx.lineWidth = 2;

    ctx.beginPath();
    for (var i = 0; i < this.overtone.length; ++i) {
      var sliderHeight = this.overtone[i] * this.height;
      ctx.rect(
        i * this.sliderWidth, this.height - sliderHeight, this.sliderWidth, sliderHeight);
    }
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#000000";
    ctx.font = "8px monospace";
    for (var i = 0; i < this.overtone.length; ++i) {
      ctx.fillText((i + 1), i * this.sliderWidth + 2, this.height - 4);
    }

    if (this.mouseX !== null) {
      var index = Math.floor(this.overtone.length * this.mouseX / this.width);
      if (index >= 0 && index < this.overtone.length) {
        ctx.fillStyle = "#00ff0033";
        ctx.fillRect(index * this.sliderWidth, 0, this.sliderWidth, this.height);
      }
    }
  }
}

function refresh() { makeWave(); }

function randomRange(min, max) { return (max - min) * Math.random() + min; }

function randomRangeInt(min, max) { return Math.floor(randomRange(min, max + 1)); }

function random() {
  if (pullDownMenuRandomType.value === "Choir") {
    inputSeed.random();

    inputBaseFunctionP1.value = randomRange(0.18, 0.82);
    inputModP1.value = 0.28346456692913385;
    inputModP2.value = 0.5354330708661418;
    inputModP3.value = 0.7007874015748031;
    inputFiltCutoff.value = randomRange(0.78125, 1);
    inputFiltQ.value = randomRange(0.12, 0.16);
    inputHarmonicShift.value = randomRangeInt(7, 15);
    inputAdaptBaseFreq.value = randomRange(0.7, 1.2);
    inputAdaptPower.value = randomRange(0.3, 1);

    var overtone = new Array(overtoneControl.overtone.length);
    for (var i = 0; i < overtone.length; ++i) {
      overtone[i] = Math.random();
    }
    overtoneControl.setOvertone(overtone);
  } else if (pullDownMenuRandomType.value === "i") {
    inputSeed.random();

    pullDownMenuBaseFunction.setValue("Sqr", false);
    inputBaseFunctionP1.value = randomRange(0.4, 0.5);
    pullDownMenuModType.setValue("Rev", false);
    inputModP1.value = randomRange(0.18, 0.25);
    inputModP2.value = randomRange(0.4, 0.5);
    inputModP3.value = randomRange(0.32, 0.38);
    pullDownMenuFiltType.setValue("BandStop1", false);
    inputFiltCutoff.value = randomRange(0.52, 0.6);
    inputFiltQ.value = randomRange(0.7, 0.9);
    inputHarmonicShift.value = randomRangeInt(0, 3);
    pullDownMenuAdaptHarmo.setValue("On", false);
    inputAdaptBaseFreq.value = randomRange(0.27, 0.30);
    inputAdaptPower.value = randomRange(0.8, 0.9);

    var overtone = new Array(overtoneControl.overtone.length).fill(0);
    overtone[1] = 0.6;

    overtone[20] = randomRange(0, 0.6);
    overtone[21] = randomRange(0, 0.6);
    overtone[22] = randomRange(0, 0.6);
    overtone[23] = randomRange(0, 0.6);
    overtone[24] = randomRange(0, 0.6);
    overtone[25] = randomRange(0, 0.6);

    overtone[26] = randomRange(0, 0.5);
    overtone[27] = randomRange(0, 0.5);
    overtone[28] = randomRange(0, 0.2);
    overtone[29] = 0.5;
    overtone[30] = randomRange(0, 0.2);
    overtone[31] = randomRange(0, 0.2);
    overtoneControl.setOvertone(overtone);
  } else if (pullDownMenuRandomType.value === "i saw bp") {
    inputSeed.random();

    pullDownMenuBaseFunction.setValue("Saw", false);
    inputBaseFunctionP1.value = randomRange(0.5, 0.51);
    pullDownMenuModType.setValue("Rev", false);
    inputModP1.value = 0.19;
    inputModP2.value = randomRange(0.4, 0.5);
    inputModP3.value = randomRange(0.62, 0.7);
    pullDownMenuFiltType.setValue("BandPass2", false);
    inputFiltCutoff.value = randomRange(0.7, 0.8);
    inputFiltQ.value = randomRange(0.7, 0.8);
    // inputHarmonicShift.value = 9
    inputHarmonicShift.value = randomRangeInt(5, 9);
    pullDownMenuAdaptHarmo.setValue("On", false);
    inputAdaptBaseFreq.value = 0.286;
    inputAdaptPower.value = 0.755; // randomRange(0.7, 0.8)

    var overtone = new Array(overtoneControl.overtone.length).fill(0);
    overtone[1] = 0.2;

    overtone[4] = randomRange(0, 0.1);
    overtone[5] = randomRange(0.15, 0.2);

    // overtone[20] = randomRange(0, 0.6)
    // overtone[21] = randomRange(0, 0.6)
    // overtone[22] = randomRange(0, 0.6)
    // overtone[23] = randomRange(0, 0.6)
    // overtone[24] = randomRange(0, 0.6)
    // overtone[25] = randomRange(0, 0.6)

    overtone[27] = randomRange(0.15, 0.2);
    overtone[28] = randomRange(0, 0.2);
    overtone[29] = randomRange(0.15, 0.2);
    overtone[30] = randomRange(0, 0.2);
    overtoneControl.setOvertone(overtone);
  } else if (pullDownMenuRandomType.value === "oa") {
    inputSeed.random();

    pullDownMenuBaseFunction.setValue("Pulsesine", false);
    inputBaseFunctionP1.value = randomRange(0.7, 0.71);
    inputModP1.value = randomRange(0.3, 0.4);
    inputModP2.value = randomRange(0.1, 0.2);
    inputModP3.value = randomRange(0.5, 0.6);
    inputHarmonicShift.value = randomRangeInt(10, 25);
    pullDownMenuAdaptHarmo.setValue("On", false);
    inputAdaptBaseFreq.value = 0.275;
    inputAdaptPower.value = randomRange(0.4, 0.45);

    var overtone = new Array(overtoneControl.overtone.length).fill(0);
    overtone[randomRangeInt(3, 6)] = 1;
    overtoneControl.setOvertone(overtone);
  } else if (pullDownMenuRandomType.value === "Additive Pad") {
    inputSeed.random();
    inputBandWidth.value = 1.0 + 199.0 * (randomRange(0.0, 1.0) ** 2);

    pullDownMenuBaseFunction.setValue("Sine", false);
    inputBaseFunctionP1.value = 0.0;
    pullDownMenuModType.setValue("None", false);
    inputModP1.value = 0.0;
    inputModP2.value = 0.0;
    inputModP3.value = 0.0;
    pullDownMenuFiltType.setValue("LowPass1", false);
    inputFiltCutoff.value = 1.0;
    inputFiltQ.value = randomRange(0.0, 1.0);
    inputHarmonicShift.value = 0.0;
    pullDownMenuAdaptHarmo.setValue("Off", false);
    inputAdaptBaseFreq.value = 0.0;
    inputAdaptPower.value = 0.0;

    var overtone = new Array(overtoneControl.overtone.length).fill(0);
    overtone[0] = 1;
    for (var idx = 1; idx < overtone.length; ++idx) {
      if (randomRange(0.0, 1.0) >= 0.15) continue;
      overtone[idx] = randomRange(0.5, 1.0) / (idx + 1);
    }
    overtoneControl.setOvertone(overtone);
  } else if (pullDownMenuRandomType.value === "PADsynth") {
    inputBaseFreq.random();
    inputBandWidth.random();
    inputSeed.random();
  } else if (pullDownMenuRandomType.value === "Seed") {
    inputSeed.random();
  } else {
    // "All" case.
    inputBaseFreq.random();
    inputBandWidth.random();
    inputSeed.random();

    pullDownMenuBaseFunction.random();
    inputBaseFunctionP1.random();
    pullDownMenuModType.random();
    inputModP1.random();
    inputModP2.random();
    inputModP3.random();
    pullDownMenuFiltType.setValue("None");
    inputFiltCutoff.random();
    inputFiltQ.random();
    inputHarmonicShift.value = 0;
    pullDownMenuAdaptHarmo.random();
    inputAdaptBaseFreq.random();
    inputAdaptPower.random();

    var overtone = new Array(overtoneControl.overtone.length);
    for (var i = 0; i < overtone.length; ++i) {
      overtone[i] = Math.random();
    }
    overtoneControl.setOvertone(overtone);
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
description.add("基本操作", "Playボタンかキーボードのスペースキーで音を再生します。");
description.add("", "Stopボタンで音を停止できます。");
description.add("", "値を変更するかRandomボタンを押すと音がレンダリングされます。");
description.add(
  "", "Randomボタンの隣のプルダウンメニューでランダマイズの種類を選択できます。");
description.add("", "Saveボタンで気に入った音を保存できます。");
description.add("", "QuickSaveにチェックを入れると音を再生するたびに音が保存されます。");
description.add("", "Overtoneの値はCtrl+クリックで0、Alt+クリックで1に設定できます。");

var divWaveform = new Div(divMain.element, "waveform");
var headingWaveform = new Heading(divWaveform.element, 6, "Waveform");
var waveView = new WaveViewMulti(divWaveform.element, wave.channels);

var divRenderControls = new Div(divMain.element, "renderControls");
var headingRenderStatus
  = new Heading(divRenderControls.element, 4, "Rendering status will be displayed here.");
var buttonStop
  = new Button(divRenderControls.element, "Stop", () => play(audioContext, wave, true));
var buttonPlay
  = new Button(divRenderControls.element, "Play", () => play(audioContext, wave));
var buttonRandom = new Button(divRenderControls.element, "Random", () => {
  random();
  play(audioContext, wave, true);
});
var pullDownMenuRandomType = new PullDownMenu(divRenderControls.element, null, () => {});
pullDownMenuRandomType.add("Choir");
pullDownMenuRandomType.add("i");
pullDownMenuRandomType.add("i saw bp");
pullDownMenuRandomType.add("oa");
pullDownMenuRandomType.add("PADsynth");
pullDownMenuRandomType.add("Additive Pad");
pullDownMenuRandomType.add("Seed");
pullDownMenuRandomType.add("All");
var buttonSave = new Button(divRenderControls.element, "Save", () => save(wave));
var checkboxQuickSave
  = new Checkbox(divRenderControls.element, "QuickSave", false, (checked) => {});

//// ControlLeft
var divControlLeft = new Div(divMain.element, "controlLeft", "controlBlock");

var divMiscControls = new Div(divControlLeft.element, "MiscControls");
var headingRender = new Heading(divMiscControls.element, 6, "Render Settings");
var pullDownMenuChannel
  = new PullDownMenu(divMiscControls.element, null, () => { refresh(); });
pullDownMenuChannel.add("Phase");
pullDownMenuChannel.add("Mono");
pullDownMenuChannel.add("Stereo");
var checkboxNormalize = new Checkbox(divMiscControls.element, "Normalize", true, refresh);
var checkboxResample
  = new Checkbox(divMiscControls.element, "16x Sampling", false, refresh);

var divPadsynthControls = new Div(divControlLeft.element, "PadsynthControls");
var headingPadsynth = new Heading(divPadsynthControls.element, 6, "PADsynth");
var inputBaseFreq
  = new NumberInput(divPadsynthControls.element, "BaseFreq", 220, 1, 1000, 0.01, refresh);
var inputBandWidth = new NumberInput(
  divPadsynthControls.element, "BandWidth", 50, 0.01, 200, 0.01, refresh);
var inputSeed = new NumberInput(
  divPadsynthControls.element, "Seed", 0, 0, Math.floor(Number.MAX_SAFE_INTEGER / 2), 1,
  refresh);
var inputTableSize
  = new NumberInput(divPadsynthControls.element, "Length [2^n]", 18, 2, 20, 1, refresh);

var divOvertoneControl = new Div(divControlLeft.element, "OvertoneControl");
var headingOvertone = new Heading(divOvertoneControl.element, 6, "Overtone");
var overtoneControl
  = new OvertoneControl(divOvertoneControl.element, 448, 128, 32, refresh);

//// ControlRight
var divControlRight = new Div(divMain.element, "controlLeft", "controlBlock");
var divWaveTableControls = new Div(divControlRight.element, "WaveTableControls");
var headingWaveTable = new Heading(divWaveTableControls.element, 6, "Wave Table");

var pullDownMenuBaseFunction
  = new PullDownMenu(divWaveTableControls.element, "BaseFunc", () => { refresh(); });
pullDownMenuBaseFunction.add("Sine");
pullDownMenuBaseFunction.add("Triangle");
pullDownMenuBaseFunction.add("Pulse");
pullDownMenuBaseFunction.add("Saw");
pullDownMenuBaseFunction.add("Power");
pullDownMenuBaseFunction.add("Gauss");
pullDownMenuBaseFunction.add("Diode");
pullDownMenuBaseFunction.add("Abssine");
pullDownMenuBaseFunction.add("Pulsesine");
pullDownMenuBaseFunction.add("Stretchsine");
pullDownMenuBaseFunction.add("Chirp");
pullDownMenuBaseFunction.add("Absstretchsine");
pullDownMenuBaseFunction.add("Chebyshev");
pullDownMenuBaseFunction.add("Sqr");
pullDownMenuBaseFunction.add("Spike");
pullDownMenuBaseFunction.add("Circle");
pullDownMenuBaseFunction.setValue("Stretchsine", false);

var inputBaseFunctionP1 = new NumberInput(
  divWaveTableControls.element, "BaseFuncP1", 0.4, 0, 1.0, 0.0001, refresh);

var pullDownMenuModType
  = new PullDownMenu(divWaveTableControls.element, "Mod.Type", () => { refresh(); });
pullDownMenuModType.add("None");
pullDownMenuModType.add("Rev");
pullDownMenuModType.add("Sine");
pullDownMenuModType.add("Power");
pullDownMenuModType.setValue("Rev", false);

var inputModP1 = new NumberInput(
  divWaveTableControls.element, "Mod.P1", 36 / 127, 0, 1.0, 0.0001, refresh);
var inputModP2 = new NumberInput(
  divWaveTableControls.element, "Mod.P2", 68 / 127, 0, 1.0, 0.0001, refresh);
var inputModP3 = new NumberInput(
  divWaveTableControls.element, "Mod.P3", 89 / 127, 0, 1.0, 0.0001, refresh);

var pullDownMenuFiltType
  = new PullDownMenu(divWaveTableControls.element, "Filt.Type", () => { refresh(); });
pullDownMenuFiltType.add("None");
pullDownMenuFiltType.add("LowPass1");
pullDownMenuFiltType.add("HighPass1a");
pullDownMenuFiltType.add("HighPass1b");
pullDownMenuFiltType.add("BandPass1");
pullDownMenuFiltType.add("BandStop1");
pullDownMenuFiltType.add("LowPass2");
pullDownMenuFiltType.add("HighPass2");
pullDownMenuFiltType.add("BandPass2");
pullDownMenuFiltType.add("BandStop2");
pullDownMenuFiltType.add("Cos");
pullDownMenuFiltType.add("Sin");
pullDownMenuFiltType.add("LowShelf");
pullDownMenuFiltType.add("Peaking");
pullDownMenuFiltType.setValue("LowPass1", false);

var inputFiltCutoff = new NumberInput(
  divWaveTableControls.element, "Filt.Cutoff", 102 / 128, 0, 1.0, 0.0001, refresh);
var inputFiltQ = new NumberInput(
  divWaveTableControls.element, "Filt.Q", 16 / 127, 0, 1.0, 0.0001, refresh);
var inputHarmonicShift
  = new NumberInput(divWaveTableControls.element, "Harmo.Shift", 7, -64, 64, 1, refresh);

var pullDownMenuAdaptHarmo
  = new PullDownMenu(divWaveTableControls.element, "Adapt.Harmo", () => { refresh(); });
pullDownMenuAdaptHarmo.add("Off");
pullDownMenuAdaptHarmo.add("On");
pullDownMenuAdaptHarmo.setValue("On", false);

var inputAdaptBaseFreq = new NumberInput(
  divWaveTableControls.element, "Adapt.Freq", 124 / 128, 0, 2, 0.0001, refresh);
var inputAdaptPower = new NumberInput(
  divWaveTableControls.element, "Adapt.Power", 78 / 127, 0, 1.0, 0.0001, refresh);

refresh();

window.addEventListener("keydown", (event) => {
  if (event.keyCode === 32) {
    play(audioContext, wave);
  }
});

// If startup is succeeded, remove "unsupported" paragaraph.
document.getElementById("unsupported").outerHTML = "";
