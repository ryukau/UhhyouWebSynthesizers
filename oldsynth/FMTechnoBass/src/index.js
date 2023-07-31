const TWO_PI = 2 * Math.PI;
const rendererPath = "src/renderer.js";

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

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

class OscControl {
  constructor(parent, index, nOsc, refreshFunc) {
    this.parent = parent;
    this.index = index;
    this.lastIndex = nOsc - 1;
    this.refreshFunc = refreshFunc;

    this.div = new Div(this.parent, "OscControl");
    this.div.element.className = "OscControl";

    this.divTop = new Div(this.div.element, "OscControlTop", "oscControlTop");

    this.controls = {
      envDuration: this.inputDuration = new NumberInputLog(
        this.divTop.element, "Duration[ratio]", 4, 0, 16, 0.0001, this.refreshFunc),
      envCurve: this.inputEnvCurve = new NumberInput(
        this.divTop.element, "EnvCurve", 1, 1, 4, 0.0001, this.refreshFunc),
      envSustain: this.inputEnvSustain = new NumberInput(
        this.divTop.element, "EnvSustain", 0, 0, 1, 0.0001, this.refreshFunc),
      envSaturation: this.inputEnvSaturation = new NumberInput(
        this.divTop.element, "EnvSaturation", 0, 0, 1, 0.0001, this.refreshFunc),
      pmIndex: this.inputPmIndex = new NumberInputLog(
        this.divTop.element, "PMIndex", 0, 0, 32, 0.0001, this.refreshFunc),
      sinPhase: this.inputSinPhase
        = new NumberInput(this.divTop.element, "Phase", 0, 0, 1, 0.01, this.refreshFunc),
      sinSkew: this.inputSinSkew = new NumberInput(
        this.divTop.element, "SinSkew", 1, 0.1, 3, 0.001, this.refreshFunc),
      sinShaper: this.inputSinShaper = new NumberInput(
        this.divTop.element, "SinShaper", 0, 0, 1, 0.01, this.refreshFunc),
      freqNumerator: this.inputFreqNumerator
        = new NumberInput(this.divTop.element, "f0 * N", 3, 1, 100, 1, this.refreshFunc),
      freqDenominator: this.inputFreqDenominator
        = new NumberInput(this.divTop.element, "f0 / N", 3, 1, 10, 1, this.refreshFunc),
    };

    this.hide();
  }

  show() { this.div.element.style.display = ""; }

  hide() { this.div.element.style.display = "none"; }

  getParams() {
    var data = {};
    for (const [key, elem] of Object.entries(this.controls)) data[key] = elem.value;
    return data;
  }

  random(type) {
    if (type === "Default") {
      if (this.index === 0) {
        this.inputDuration.value = 4;
        this.inputEnvCurve.value = 1;
        this.inputEnvSustain.value = 0;
        this.inputEnvSaturation.random();
        this.inputFreqDenominator.value = 3;
        this.inputFreqNumerator.value = 3;
      } else {
        this.inputEnvCurve.random();
        this.inputEnvSustain.value = mapUniform(Math.random(), 0, 1 / 8);
        this.inputEnvSaturation.value = 0;
        this.inputSinSkew.random();

        if (this.index === 1) {
          this.inputDuration.value = mapUniform(Math.random(), 1, 16);
          var denom = mapIntInclusive(Math.random(), 1, 2);
          this.inputFreqDenominator.value = denom;
          this.inputFreqNumerator.value = mapIntInclusive(Math.random(), 1, 8);
        } else {
          this.inputDuration.value = mapUniform(Math.random(), 0.25, 2.5);
          var denom = mapIntInclusive(Math.random(), 1, 4);
          this.inputFreqDenominator.value = denom;
          var numMax = Math.min(6 * denom, this.inputFreqNumerator.max);
          this.inputFreqNumerator.value = mapIntInclusive(Math.random(), 1, numMax);
        }
      }

      if (this.index === this.lastIndex) {
        this.inputSinShaper.random();
        this.inputPmIndex.value = 0.1 * Math.random();
      } else if (this.index === 0) {
        this.inputSinShaper.value = 0;
        this.inputPmIndex.value = mapUniform(Math.random(), 0.5, 10);
      } else {
        this.inputSinShaper.value = 0.2 * Math.random();
        this.inputPmIndex.value = mapUniform(Math.random(), 0.5, 10);
      }

      this.inputSinSkew.value = 1;
      this.inputSinPhase.random();
    } else if (type === "HighFreq") {
      if (this.index === 0) {
        this.inputDuration.value = 4;
        this.inputEnvCurve.value = 1;
        this.inputEnvSustain.value = 0;
        this.inputEnvSaturation.random();
        this.inputFreqDenominator.value = 3;
        this.inputFreqNumerator.value = 3;
      } else {
        this.inputEnvCurve.random();
        this.inputEnvSustain.value = mapUniform(Math.random(), 0, 1 / 8);
        this.inputEnvSaturation.value = 0;
        this.inputSinSkew.random();

        if (this.index >= 1) {
          this.inputDuration.value = mapUniform(Math.random(), 1, 16);
          this.inputFreqDenominator.value = 1;
          this.inputFreqNumerator.value
            = Math.floor(2 ** mapIntInclusive(Math.random(), 0, 6))
            + mapIntInclusive(Math.random(), 0, 3);
        } else {
          this.inputDuration.value = mapUniform(Math.random(), 0.25, 2.5);
          var denom = mapIntInclusive(Math.random(), 1, 4);
          this.inputFreqDenominator.value = denom;
          var numMax = Math.min(6 * denom, this.inputFreqNumerator.max);
          this.inputFreqNumerator.value = mapIntInclusive(Math.random(), 1, numMax);
        }
      }

      if (this.index === this.lastIndex) {
        this.inputSinShaper.random();
        this.inputPmIndex.value = 0.1 * Math.random();
      } else if (this.index === 0) {
        this.inputSinShaper.value = 0;
        this.inputPmIndex.value = mapUniform(Math.random(), 0.5, 10);
      } else {
        this.inputSinShaper.value = 0.2 * Math.random();
        this.inputPmIndex.value = mapUniform(Math.random(), 0.5, 10);
      }

      this.inputSinSkew.value = 1;
      this.inputSinPhase.random();
    } else if (type === "Unison") {
      if (this.index === 0) {
        this.inputDuration.value = 4;
        this.inputEnvCurve.value = 1;
        this.inputEnvSustain.value = 0;
        this.inputEnvSaturation.random();
        this.inputFreqDenominator.value = 3;
        this.inputFreqNumerator.value = 3;
      } else {
        this.inputEnvCurve.random();
        this.inputEnvSustain.value = mapUniform(Math.random(), 0, 1 / 8);
        this.inputEnvSaturation.value = 0;
        this.inputSinSkew.random();

        if (this.index >= 1) {
          this.inputDuration.value = mapUniform(Math.random(), 1, 16);
          this.inputFreqDenominator.value = 1;
          this.inputFreqNumerator.value
            = Math.floor(2 ** mapIntInclusive(Math.random(), 0, 6))
            + mapIntInclusive(Math.random(), 0, 3);
        } else {
          this.inputDuration.value = mapUniform(Math.random(), 0.25, 2.5);
          var denom = mapIntInclusive(Math.random(), 1, 4);
          this.inputFreqDenominator.value = denom;
          var numMax = Math.min(6 * denom, this.inputFreqNumerator.max);
          this.inputFreqNumerator.value = mapIntInclusive(Math.random(), 1, numMax);
        }
      }

      if (this.index === this.lastIndex) {
        this.inputSinShaper.random();
        this.inputPmIndex.value = 0.1 * Math.random();
      } else if (this.index === 0) {
        this.inputSinShaper.value = 0;
        this.inputPmIndex.value = mapUniform(Math.random(), 0.5, 10);
      } else {
        this.inputSinShaper.value = 0.2 * Math.random();
        this.inputPmIndex.value = mapUniform(Math.random(), 0.5, 10);
      }

      this.inputSinSkew.value = 1;
      this.inputSinPhase.random();
    } else {
      for (const elem of Object.values(this.controls)) elem.random();
    }
  }
}

class OscGroup {
  constructor(parent, nOsc, refreshFunc) {
    this.parent = parent;
    this.refreshFunc = refreshFunc;

    this.div = new Div(this.parent, "OscGroup");
    this.div.element.className = "OscGroup";

    this.selector = new RadioButton(
      this.div.element, "TowerIndex", (index) => { this.toggle(index); });

    this.controls = [];
    for (var idx = 0; idx < nOsc; ++idx) {
      this.controls.push(new OscControl(this.div.element, idx, nOsc, this.refreshFunc));
      this.selector.add(idx);
    }
    this.toggle(0);
  }

  show() { this.div.element.style.display = ""; }

  hide() { this.div.element.style.display = "none"; }

  toggle(index) {
    for (var ctrl of this.controls) ctrl.hide();
    this.controls[index].show();
  }

  getParams() {
    var params = [];
    for (var ctrl of this.controls) params.push(ctrl.getParams());
    return params;
  }

  random(type) {
    for (var ctrl of this.controls) ctrl.random(type);
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
        worker: new Worker(rendererPath),
        isRunning: false,
      });
    }

    this.oscUI = {};

    // Define UI.
    this.divMain = new Div(parent, "main");
    this.headingTitle = pageTitle(this.divMain.element);

    this.description = new Description(this.divMain.element, [
      ["基本操作", "Playボタンかキーボードのスペースキーで音を再生します。"],
      ["", "Stopボタンで音を停止できます。"],
      ["", "値を変更するかRandomボタンを押すと音がレンダリングされます。"],
      ["", "Randomボタンの隣のプルダウンメニューでランダマイズの種類を選択できます。"],
      ["", "Saveボタンで気に入った音を保存できます。"],
      ["", "QuickSaveにチェックを入れると音を再生するたびに音が保存されます。"]
    ]);

    this.divWaveform = new Div(this.divMain.element, "waveform");
    this.headingWaveform = new Heading(this.divWaveform.element, 6, "Waveform");
    this.waveView = new WaveViewMulti(this.divWaveform.element, this.wave);

    this.divRenderControls = new Div(this.divMain.element, "renderControls");
    this.headingRenderStatus = new Heading(
      this.divRenderControls.element, 4, "Rendering status will be displayed here.");
    this.buttonStop
      = new Button(this.divRenderControls.element, "Stop", () => this.stop());
    this.buttonPlay
      = new Button(this.divRenderControls.element, "Play", () => this.play());
    this.buttonRandom = new Button(this.divRenderControls.element, "Random", () => {
      this.random();
      this.stop();
    });
    this.pullDownMenuRandomType = new PullDownMenu(
      this.divRenderControls.element, null, ["Default", "HighFreq", "Unison", "All"],
      () => { });

    this.buttonSave
      = new Button(this.divRenderControls.element, "Save", () => this.save());
    this.checkboxQuickSave
      = new Checkbox(this.divRenderControls.element, "QuickSave", false, (checked) => { });

    //// ControlLeft
    this.divControlLeft = new Div(this.divMain.element, "controlLeft", "controlBlock");

    this.divMiscControls = new Div(this.divControlLeft.element, "MiscControls");
    this.headingRender = new Heading(this.divMiscControls.element, 6, "Render Settings");
    this.checkboxNormalize = new Checkbox(
      this.divMiscControls.element, "Normalize", true, () => { this.refresh(); });
    this.checkboxResample = new Checkbox(
      this.divMiscControls.element, "8x Oversampling", false, () => { this.refresh(); });
    this.inputLength = new NumberInputLog(
      this.divMiscControls.element, "Length[s]", 0.5, 0.02, 16, 0.01,
      () => { this.refresh(); });
    this.inputDeclickIn = new NumberInputLog(
      this.divMiscControls.element, "DeclickIn[s]", 0.002, 0, 0.01, 0.0001,
      () => { this.refresh(); });
    this.inputNote = new NumberInput(
      this.divMiscControls.element, "Note[semi]", 36, -36, 136, 1,
      () => { this.refresh(); });

    this.headingUnison = new Heading(this.divMiscControls.element, 6, "Unison");
    this.inputNUnison = new NumberInput(
      this.divMiscControls.element, "nUnison", 1, 1, 128, 1, () => { this.refresh(); });
    this.inputUnisonDetune = new NumberInput(
      this.divMiscControls.element, "Detune[cent]", 2, 0, 1200, 1,
      () => { this.refresh(); });
    this.inputUnisonPhase = new NumberInput(
      this.divMiscControls.element, "Phase", 1, 0, 1, 0.01, () => { this.refresh(); });
    this.inputSeed = new NumberInput(
      this.divMiscControls.element, "Seed", 0, 0, Math.floor(Number.MAX_SAFE_INTEGER / 2),
      1, () => { this.refresh(); });

    this.headingLfoOsc = new Heading(this.divMiscControls.element, 6, "Pitch LFO");
    this.inputLfoDuration = new NumberInputLog(
      this.divMiscControls.element, "Duration[ratio]", 4, 0, 16, 0.0001,
      () => { this.refresh(); });
    this.inputLfoPmIndex = new NumberInput(
      this.divMiscControls.element, "PMIndex", 0, 0, 8, 0.0001,
      () => { this.refresh(); });
    this.inputLfoPhase = new NumberInput(
      this.divMiscControls.element, "Phase", 0, 0, 1, 0.01, () => { this.refresh(); });
    this.inputLfoFreqDenominator = new NumberInput(
      this.divMiscControls.element, "f0 / N", 40, 10, 200, 10, () => { this.refresh(); });

    //// ControlRight
    this.divControlRight = new Div(this.divMain.element, "controlRight", "controlBlock");

    this.divParam = new Div(this.divControlRight.element, "Param");
    this.headingRender = new Heading(this.divParam.element, 6, "Oscillator");
    this.oscGroup = new OscGroup(this.divParam.element, 3, () => { this.refresh(); });

    // Post processing.
    this.refresh();

    window.addEventListener("keydown", (event) => {
      if (event.key === " ") {
        this.play();
      }
    });
  }

  gatherParameters(channel) {
    return {
      nOsc: this.oscGroup.controls.length,

      channel: channel,
      sampleRate: this.audioContext.sampleRate,
      overSampling: this.checkboxResample.value,
      length: this.inputLength.value,
      note: this.inputNote.value,

      nUnison: this.inputNUnison.value,
      unisonDetune: this.inputUnisonDetune.value,
      unisonPhase: this.inputUnisonPhase.value,
      seed: this.inputSeed.value,

      lfoDuration: this.inputLfoDuration.value,
      lfoPmIndex: this.inputLfoPmIndex.value,
      lfoPhase: this.inputLfoPhase.value,
      lfoFreqDenominator: this.inputLfoFreqDenominator.value,

      oscData: this.oscGroup.getParams(),
    };
  }

  random() {
    var randomType = this.pullDownMenuRandomType.value;
    if (randomType === "Default") {
      this.inputUnisonDetune.random();
      this.inputUnisonPhase.random();
      this.inputSeed.random();

      this.inputLfoDuration.random();
      this.inputLfoPmIndex.random();
      this.inputLfoPhase.random();
      this.inputLfoFreqDenominator.random();
    } else if (randomType === "Unison") {
      this.inputUnisonDetune.random();
      this.inputUnisonPhase.random();
      this.inputSeed.random();

      this.inputLfoDuration.random();
      this.inputLfoPhase.random();
      this.inputLfoFreqDenominator.random();
    } else {
      this.inputUnisonDetune.random();
      this.inputUnisonPhase.random();
      this.inputSeed.random();

      this.inputLfoDuration.random();
      this.inputLfoPmIndex.random();
      this.inputLfoPhase.random();
      this.inputLfoFreqDenominator.random();
    }

    this.oscGroup.random(randomType);

    this.refresh();
  }

  refresh() { this.render(); }

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
    var channels = this.wave.channels;
    for (var ch = 0; ch < channels; ++ch) {
      if (this.workers[ch].isRunning) {
        this.workers[ch].worker.terminate();
        this.workers[ch].worker = new Worker(rendererPath);
      } else {
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
    this.wave.declickOut(0.002 * this.audioContext.sampleRate);
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
