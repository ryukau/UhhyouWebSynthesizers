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

    this.wave = new Wave(2);
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
        ["", "QuickSaveにチェックを入れると音を再生するたびに音が保存されます。"]
      ]
    );

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
    this.inputLength = new NumberInputLog(this.divMiscControls.element,
      "Length", 1, 0.02, 16, 0.01, () => { this.refresh(); });
    this.inputSeed = new NumberInput(this.divMiscControls.element,
      "Seed", 0, 0, Math.floor(Number.MAX_SAFE_INTEGER / 2), 1,
      () => { this.refresh(); });
    this.inputDeclickIn = new NumberInputLog(this.divMiscControls.element,
      "DeclickIn", 0.001, 0, 0.01, 0.0001, () => { this.refresh(); });
    this.inputRadius = new NumberInputLog(this.divMiscControls.element,
      "Radius", 0.001, 0.0001, 0.02, 0.0001, () => { this.refresh(); });
    this.inputRadiusRange = new NumberInputLog(this.divMiscControls.element,
      "RadiusRange", 8, 0, 16, 0.0001, () => { this.refresh(); });
    this.inputBeta = new NumberInput(this.divMiscControls.element,
      "Beta (Gain)", 8, 0, 32, 0.0001, () => { this.refresh(); });
    this.inputXi = new NumberInput(this.divMiscControls.element,
      "Xi (PitchMod)", 0.1, 0, 0.2, 0.0001, () => { this.refresh(); });
    this.inputXiRange = new NumberInput(this.divMiscControls.element,
      "XiRange", 0, 0, 1, 0.0001, () => { this.refresh(); });
    this.inputAttack = new NumberInputLog(this.divMiscControls.element,
      "Attack", 0.001, 0.0002, 0.01, 0.0001, () => { this.refresh(); });
    this.inputBubbleRate = new NumberInputLog(this.divMiscControls.element,
      "Bubble/Sec", 100, 1, 1000, 0.01, () => { this.refresh(); });

    this.refresh();

    window.addEventListener("keydown", (event) => {
      if (event.keyCode === 32) {
        this.play();
      }
    });
  }

  gatherParameters(channel) {
    return {
      channel: channel,
      sampleRate: this.audioContext.sampleRate,
      length: this.inputLength.value,
      seed: this.inputSeed.value,
      radius: this.inputRadius.value,
      radiusRange: this.inputRadiusRange.value,
      beta: this.inputBeta.value,
      xi: this.inputXi.value,
      xiRange: this.inputXiRange.value,
      attack: this.inputAttack.value,
      bubbleRate: this.inputBubbleRate.value,
    };
  }

  random() {
    if (this.pullDownMenuRandomType.value === "Default") {
      this.inputSeed.random();
    }
    else {
      this.inputSeed.random();
      this.inputRadius.random();
      this.inputRadiusRange.random();
      this.inputBeta.random();
      this.inputXi.random();
      this.inputXiRange.random();
      this.inputAttack.random();
      this.inputBubbleRate.random();
    }
    this.refresh();
  }

  refresh() {
    this.render();
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

  render() {
    this.headingRenderStatus.element.textContent = "⚠ Rendering ⚠";
    var channels = 2;
    for (var ch = 0; ch < channels; ++ch) {
      if (this.workers[ch].isRunning) {
        this.workers[ch].worker.terminate();
        this.workers[ch].worker = new Worker("renderer.js");
      }
      else {
        this.workers[ch].isRunning = true;
      }
      this.workers[ch].worker.postMessage(this.gatherParameters(ch));
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
