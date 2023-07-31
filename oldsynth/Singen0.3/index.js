const TWO_PI = 2 * Math.PI;

function randomRange(min, max) {
  return (max - min) * Math.random() + min;
}

function randomRangeInt(min, max) {
  return Math.floor(randomRange(min, max + 1));
}

class WaveViewMulti {
  constructor(parent, wave) {
    this.waveView = [];
    for (var ch = 0; ch < wave.channels; ++ch) {
      this.waveView.push(new WaveView(parent, 450, 256, wave[ch], false));
    }
  }

  set(wave) {
    for (var ch = 0; ch < this.waveView.length; ++ch) {
      this.waveView[ch].set(wave.data[ch]);
    }
  }
}

class UI {
  constructor(parent) {
    this.audioContext = new AudioContext();

    this.source; // AudioBufferSourceNode. play() と stop() で使用。

    this.wave = new Wave(1);
    this.workers = [];
    for (var ch = 0; ch < this.wave.channels; ++ch) {
      this.workers.push({
        worker: new Worker("renderer.js"),
        isRunning: false,
      });
    }

    this.divMain = new Div(parent, "main");
    this.headingTitle = pageTitle(this.divMain.element);

    this.description = new Description(
      this.divMain.element,
      [
        ["基本操作", "Playボタンかキーボードのスペースキーで音を再生します。"],
        ["", "Stopボタンで音を停止できます。"],
        ["", "値を変更するかRandomボタンを押すと音がレンダリングされます。"],
        ["", "Randomボタンの隣のプルダウンメニューでランダマイズの種類を選択できます。"],
        ["", "Saveボタンで気に入った音を保存できます。"],
        ["", "QuickSaveにチェックを入れると音を再生するたびに音が保存されます。"],
        ["", "Overtoneの値はCtrl+クリックで0、Alt+クリックで1に設定できます。"]
      ]
    );
    this.description.add("信号の流れ", "");
    this.description.addImage(
      "img/signal_flow.svg", "Signal flow graph of Singen0.3.");

    this.divWaveform = new Div(this.divMain.element, "waveform");
    this.headingWaveform = new Heading(this.divWaveform.element, 6, "Waveform");
    this.waveView = new WaveViewMulti(this.divWaveform.element, this.wave);

    this.divRenderControls = new Div(this.divMain.element, "renderControls");
    this.headingRenderStatus = new Heading(this.divRenderControls.element,
      4, "Rendering status will be displayed here.");
    this.buttonStop = new Button(this.divRenderControls.element,
      "Stop", () => this.stop());
    this.buttonPlay = new Button(this.divRenderControls.element,
      "Play", () => this.play());
    this.buttonRandom = new Button(this.divRenderControls.element,
      "Random", () => { this.random(); this.stop(); });
    this.pullDownMenuRandomType = new PullDownMenu(
      this.divRenderControls.element,
      null,
      ["Default", "All"],
      () => { }
    );

    this.buttonSave = new Button(this.divRenderControls.element,
      "Save", () => this.save());
    this.checkboxQuickSave = new Checkbox(this.divRenderControls.element,
      "QuickSave", false, (checked) => { });

    //// ControlLeft
    this.divControlLeft = new Div(this.divMain.element, "controlLeft", "controlBlock");

    this.divMiscControls = new Div(this.divControlLeft.element, "MiscControls");
    this.headingRender = new Heading(this.divMiscControls.element,
      6, "Render Settings");
    this.checkboxNormalize = new Checkbox(this.divMiscControls.element,
      "Normalize", true, () => { this.refresh(); });
    this.checkboxResample = new Checkbox(this.divMiscControls.element,
      "16x Sampling", false, () => { this.refresh(); });
    this.inputLength = new NumberInput(this.divMiscControls.element,
      "Length", 1, 0.02, 16, 0.01, () => { this.refresh(); }, true);
    this.inputSeed = new NumberInput(this.divMiscControls.element,
      "Seed", 0, 0, Math.floor(Number.MAX_SAFE_INTEGER / 2), 1,
      () => { this.refresh(); });
    this.inputDeclickIn = new NumberInput(this.divMiscControls.element,
      "DeclickIn", 0.001, 0, 0.01, 0.0001, () => { this.refresh(); }, true);
    this.inputDecayTension = new NumberInput(this.divMiscControls.element,
      "GainDecay", -2, -5, 0, 0.001, () => { this.refresh(); });

    this.divCarrierControls = new Div(this.divControlLeft.element, "Carrier");
    this.headingCarrier = new Heading(this.divCarrierControls.element,
      6, "Carrier");

    // TODO: some stereo

    this.envelopeViewCarGain = new EnvelopeView(this.divCarrierControls.element,
      223, 96, 0.2, 0.5, 0.4, 0.2, "Car.Gain", () => { this.refresh(); });
    this.overtoneCarrier = new OvertoneControl(this.divCarrierControls.element,
      223, 96, 16, () => { this.refresh(); });

    this.divFilterCar = new Div(this.divCarrierControls.element,
      "FilterCar", "envelopeControl");

    this.divFilterCutoffCar = new Div(this.divFilterCar.element,
      "CutoffCar");
    this.headingCutoffCar = new Heading(this.divFilterCutoffCar.element,
      6, "Car.Cutoff");
    this.inputCarCutoffAmount = new NumberInput(this.divFilterCutoffCar.element,
      "Amount", 1, 0, 1, 0.001, () => { this.refresh(); }, true);
    this.inputCarCutoffBias = new NumberInput(this.divFilterCutoffCar.element,
      "Bias", 200, 20, 20000, 0.001, () => { this.refresh(); }, true);
    this.inputCarCutoffTension = new NumberInput(this.divFilterCutoffCar.element,
      "Tension", -2, -5, 0, 0.001, () => { this.refresh(); }, false);

    this.divFilterSplitter = new Div(this.divFilterCar.element,
      "FilterCarSplitter", "splitter");
    this.divFilterQCar = new Div(this.divFilterCar.element,
      "QCar");
    this.headingQCar = new Heading(this.divFilterQCar.element,
      6, "Car.Q");
    this.inputCarQAmount = new NumberInput(this.divFilterQCar.element,
      "Amount", 0.3, 0, 1, 0.001, () => { this.refresh(); }, false);
    this.inputCarQBias = new NumberInput(this.divFilterQCar.element,
      "Bias", 0.1, 0, 1, 0.001, () => { this.refresh(); }, false);
    this.inputCarQTension = new NumberInput(this.divFilterQCar.element,
      "Tension", -2, -5, 0, 0.001, () => { this.refresh(); }, false);
    this.inputCarFilterStack = new NumberInput(this.divCarrierControls.element,
      "FilterStack", 6, 1, 16, 1, () => { this.refresh(); }, false);
    this.inputFrequency = new NumberInput(this.divCarrierControls.element,
      "Frequency", 220 * Math.pow(2, -9 / 12), 20, 2000, 0.01,
      () => { this.refresh(); }, true);
    this.inputDetune = new NumberInput(this.divCarrierControls.element,
      "Detune", 0, 0, 0.06, 0.0001, () => { this.refresh(); }, true);
    this.inputModIndex = new NumberInput(this.divCarrierControls.element,
      "ModIndex", 4, 0, 6, 0.001, () => { this.refresh(); }, true);
    this.inputModMix = new NumberInput(this.divCarrierControls.element,
      "Mod:PAD Mix", 0.5, 0, 1, 0.001, () => { this.refresh(); });

    //// ControlRight
    this.divControlRight = new Div(this.divMain.element,
      "controlRight", "controlBlock");

    this.divModulatorControls = new Div(this.divControlRight.element, "Modulator");
    this.headingModulator = new Heading(this.divModulatorControls.element,
      6, "Modulator");
    this.inputModulatorRatio = new NumberInput(this.divModulatorControls.element,
      "Ratio", 0.375, 0, 16, 0.0001, () => { this.refresh(); }, true);
    this.inputModulatorClip = new NumberInput(this.divModulatorControls.element,
      "ClipGain", 1, 1, 16, 0.0001, () => { this.refresh(); }, true);
    this.pullDownMenuClipType = new PullDownMenu(
      this.divModulatorControls.element,
      null,
      ["HardClip", "tanh", "Logistic", "HalfRect", "2^(-abs(sig))"],
      () => { this.refresh(); }
    );

    this.divPadsynthControls = new Div(this.divControlRight.element,
      "PadsynthControls");
    this.headingPadsynth = new Heading(this.divPadsynthControls.element,
      6, "PADsynth");
    this.inputRatioPad = new NumberInput(this.divPadsynthControls.element,
      "Ratio", 0.375, 0, 16, 0.0001, () => { this.refresh(); }, true);
    this.inputBandWidth = new NumberInput(this.divPadsynthControls.element,
      "BandWidth", 10, 0.01, 100, 0.01, () => { this.refresh(); }, true);
    this.overtonePad = new OvertoneControl(this.divPadsynthControls.element,
      448, 96, 32, () => { this.refresh(); });

    // TODO: 余ってるスペースに何か入れる。
    this.envelopeViewPadGain = new EnvelopeView(this.divPadsynthControls.element,
      223, 96, 0.2, 0.5, 0.4, 0.2, "PAD.Gain", () => { this.refresh(); });


    this.envelopePadCutoff = new EnvelopeControl(this.divPadsynthControls.element,
      "PAD.Cutoff", 223, 96, 0.2, 0.5, 0.4, 0.2, 1, 0.2, 0, 1, 0.001, false,
      () => { this.refresh(); });
    this.envelopePadQ = new EnvelopeControl(this.divPadsynthControls.element,
      "PAD.Q", 223, 96, 0.2, 0.5, 0.4, 0.2, 0.3, 0.1, 0, 1, 0.0001, false,
      () => { this.refresh(); });

    this.refresh();

    window.addEventListener("keydown", (event) => {
      if (event.keyCode === 32) {
        this.play();
      }
    });
  }

  gatherParameters() {
    return {
      sampleRate: this.audioContext.sampleRate,
      overSampling: this.checkboxResample.value ? 16 : 1,
      length: this.inputLength.value,
      seed: this.inputSeed.value,
      gainCarTension: this.inputDecayTension.value,

      envCarGain: this.envelopeViewCarGain.value,
      overtoneCar: this.overtoneCarrier.overtone,
      carCutoffAmount: this.inputCarCutoffAmount.value,
      carCutoffBias: this.inputCarCutoffBias.value,
      carCutoffTension: this.inputCarCutoffTension.value,
      carQAmount: this.inputCarQAmount.value,
      carQBias: this.inputCarQBias.value,
      carQTension: this.inputCarQTension.value,
      carFilterStack: this.inputCarFilterStack.value,
      frequency: this.inputFrequency.value,
      detuneCar: this.inputDetune.value,
      modIndex: this.inputModIndex.value,
      modPadMix: this.inputModMix.value,

      ratioMod: this.inputModulatorRatio.value,
      clipGain: this.inputModulatorClip.value,
      clipType: this.pullDownMenuClipType.value,

      ratioPad: this.inputRatioPad.value,
      bandWidth: this.inputBandWidth.value,
      overtonePad: this.overtonePad.overtone,
      envPadGain: this.envelopeViewPadGain.value,
      envPadCutoff: this.envelopePadCutoff.value,
      envPadQ: this.envelopePadQ.value,
    };
  }

  random() {
    if (this.pullDownMenuRandomType.value === "Default") {
      this.inputDecayTension.random();

      this.envelopeViewCarGain.random();
      this.overtoneCarrier.sparseRandom();
      this.inputCarCutoffAmount.random();
      this.inputCarCutoffBias.random();
      this.inputCarCutoffTension.random();
      this.inputCarQAmount.random();
      this.inputCarQBias.random();
      this.inputCarQTension.random();
      this.inputCarFilterStack.value = randomRangeInt(
        this.inputCarFilterStack.min, this.inputCarFilterStack.max);
      this.inputDetune.random();
      this.inputModIndex.value = randomRange(0, 2);
      this.inputModMix.random();

      this.inputModulatorRatio.random();
      this.inputModulatorClip.random();
      this.pullDownMenuClipType.random();

      this.inputRatioPad.random();
      this.inputBandWidth.random();
      this.inputSeed.random();
      this.overtonePad.random();
      this.envelopeViewPadGain.random();
      this.envelopePadCutoff.random();
      this.envelopePadQ.random();
    }
    else {
      this.inputLength.value = randomRange(0.01, 1);
      this.inputDeclickIn.value = randomRange(0, 0.001);
      this.inputDecayTension.random();

      this.envelopeViewCarGain.random();
      this.overtoneCarrier.sparseRandom();
      this.inputCarCutoffAmount.random();
      this.inputCarCutoffBias.random();
      this.inputCarCutoffTension.random();
      this.inputCarQAmount.random();
      this.inputCarQBias.random();
      this.inputCarQTension.random();
      this.inputCarFilterStack.value = randomRangeInt(
        this.inputCarFilterStack.min, this.inputCarFilterStack.max);
      this.inputFrequency.random();
      this.inputDetune.random();
      this.inputModIndex.value = randomRange(0, 2);
      this.inputModMix.random();

      this.inputModulatorRatio.random();
      this.inputModulatorClip.random();
      this.pullDownMenuClipType.random();

      this.inputRatioPad.random();
      this.inputBandWidth.random();
      this.inputSeed.random();
      this.overtonePad.random();
      this.envelopeViewPadGain.random();
      this.envelopePadCutoff.random();
      this.envelopePadQ.random();
    }
    this.refresh();
  }

  refresh() {
    this.makeWave();
  }

  play() {
    var buffer = this.audioContext.createBuffer(
      this.wave.channels, this.wave.frames, this.audioContext.sampleRate);

    for (var i = 0; i < this.wave.channels; ++i) {
      var waveFloat32 = new Float32Array(this.wave.data[i]);
      buffer.copyToChannel(waveFloat32, i, 0);
    }

    if (this.source !== undefined) {
      this.source.stop();
    }
    this.source = this.audioContext.createBufferSource();
    this.source.buffer = buffer;
    this.source.connect(this.audioContext.destination);
    this.source.start();
  }

  stop() {
    if (this.source !== undefined) {
      this.source.stop();
    }
  }

  save() {
    var buffer = Wave.toBuffer(this.wave, this.wave.channels);
    var header = Wave.fileHeader(
      this.audioContext.sampleRate, this.wave.channels, buffer.length, false);

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

  makeWave() {
    this.headingRenderStatus.element.textContent = "⚠ Rendering ⚠";
    var channels = 1;
    for (var ch = 0; ch < channels; ++ch) {
      if (this.workers[ch].isRunning) {
        this.workers[ch].worker.terminate();
        this.workers[ch].worker = new Worker("renderer.js");
      }
      else {
        this.workers[ch].isRunning = true;
      }
      this.workers[ch].worker.postMessage(this.gatherParameters());
    }

    this.workers.forEach((value, index) => {
      value.worker.onmessage = (event) => {
        this.wave.data[index] = event.data;
        this.workers[index].isRunning = false;
        if (this.workers.every((v) => !v.isRunning)) {
          if (channels === 1) {
            this.wave.copyChannel(index);
          }
          this.finalize();
        }
      };
    });
  }

  finalize() {
    if (this.checkboxNormalize.value) {
      this.wave.normalize();
    }
    this.wave.declickIn(this.inputDeclickIn.value * this.audioContext.sampleRate);
    this.wave.zeroOut(Math.floor(0.01 * this.audioContext.sampleRate));
    this.waveView.set(this.wave);

    if (this.checkboxQuickSave.value) {
      this.save();
    }

    this.headingRenderStatus.element.textContent = "Rendering finished. ✓";
  }
}

var ui = new UI(document.body);

// If startup is succeeded, remove "unsupported" paragaraph.
document.getElementById("unsupported").outerHTML = "";
