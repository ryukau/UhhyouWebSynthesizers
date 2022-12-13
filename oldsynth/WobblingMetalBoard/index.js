const TWO_PI = 2 * Math.PI

function randomRange(min, max) {
  return (max - min) * Math.random() + min
}

function randomRangeInt(min, max) {
  return Math.floor(randomRange(min, max + 1))
}

class WaveViewMulti {
  constructor(parent, wave) {
    this.waveView = []
    for (var ch = 0; ch < wave.channels; ++ch) {
      this.waveView.push(new WaveView(parent, 450, 256, wave[ch], false))
    }
  }

  set(wave) {
    for (var ch = 0; ch < this.waveView.length; ++ch) {
      this.waveView[ch].set(wave.data[ch])
    }
  }
}

class UI {
  constructor(parent) {
    this.audioContext = new AudioContext()

    this.source // AudioBufferSourceNode. play() と stop() で使用。

    this.wave = new Wave(2)
    this.workers = []
    for (var ch = 0; ch < this.wave.channels; ++ch) {
      this.workers.push({
        worker: new Worker("renderer.js"),
        isRunning: false,
      })
    }

    this.divMain = new Div(parent, "main")
    this.headingTitle = new Heading(this.divMain.element, 1, document.title)

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
    )

    this.divWaveform = new Div(this.divMain.element, "waveform")
    this.headingWaveform = new Heading(this.divWaveform.element, 6, "Waveform")
    this.waveView = new WaveViewMulti(this.divWaveform.element, this.wave)

    this.divRenderControls = new Div(this.divMain.element, "renderControls")
    this.headingRenderStatus = new Heading(this.divRenderControls.element,
      4, "Rendering status will be displayed here.")
    this.buttonStop = new Button(this.divRenderControls.element,
      "Stop", () => this.stop())
    this.buttonPlay = new Button(this.divRenderControls.element,
      "Play", () => this.play())
    this.buttonRandom = new Button(this.divRenderControls.element,
      "Random", () => { this.random(); this.stop() })
    this.pullDownMenuRandomType = new PullDownMenu(
      this.divRenderControls.element,
      null,
      ["Default", "All"],
      () => { }
    )

    this.buttonSave = new Button(this.divRenderControls.element,
      "Save", () => this.save())
    this.checkboxQuickSave = new Checkbox(this.divRenderControls.element,
      "QuickSave", false, (checked) => { })

    //// ControlLeft
    this.divControlLeft = new Div(this.divMain.element, "controlLeft", "controlBlock")

    this.divMiscControls = new Div(this.divControlLeft.element, "MiscControls")
    this.headingRender = new Heading(this.divMiscControls.element,
      6, "Render Settings")
    this.checkboxNormalize = new Checkbox(this.divMiscControls.element,
      "Normalize", true, () => { this.refresh() })
    this.checkboxResample = new Checkbox(this.divMiscControls.element,
      "4x Sampling", false, () => { this.refresh() })
    this.inputLength = new NumberInputLog(this.divMiscControls.element,
      "Length", 1, 0.02, 16, 0.01, () => { this.refresh() })
    this.inputSeed = new NumberInput(this.divMiscControls.element,
      "Seed", 0, 0, Math.floor(Number.MAX_SAFE_INTEGER / 2), 1,
      () => { this.refresh() })
    this.inputDeclickIn = new NumberInputLog(this.divMiscControls.element,
      "DeclickIn", 0.001, 0, 0.01, 0.0001, () => { this.refresh() })

    this.divEnvelope = new Div(this.divControlLeft.element, "Envelope")
    this.headingRender = new Heading(this.divEnvelope.element,
      6, "Envelope")
    this.inputAmpAttack = new NumberInputLog(this.divEnvelope.element,
      "Amp.Attack", 1, 0.0001, 1, 0.0001, () => { this.refresh() })
    this.inputBaseFrequency = new NumberInputLog(this.divEnvelope.element,
      "BaseFreq", 100, 1, 10000, 0.0001, () => { this.refresh() })
    this.inputBendAttack = new NumberInputLog(this.divEnvelope.element,
      "Bend.Attack", 0.1, 0.0001, 4, 0.0001, () => { this.refresh() })
    this.inputBendCurve = new NumberInputLog(this.divEnvelope.element,
      "Bend.Curve", 30, 0.0001, 50, 0.0001, () => { this.refresh() })
    this.inputBendAmount = new NumberInputLog(this.divEnvelope.element,
      "Bend.Amount", 1000, 1, 10000, 0.0001, () => { this.refresh() })



    //// ControlRight
    this.divControlRight = new Div(this.divMain.element, "controlRight", "controlBlock")

    this.divHarmonics = new Div(this.divControlRight.element, "Harmonics")
    this.headingHarmonics = new Heading(this.divHarmonics.element,
      6, "Harmonics")
    this.inputHarmonicsNumber = new NumberInput(this.divHarmonics.element,
      "Number", 4, 1, 64, 1, () => { this.refresh() })
    this.inputHarmonicsAmp = new NumberInput(this.divHarmonics.element,
      "Amp", 0.75, 0, 1.2, 0.0001, () => { this.refresh() })
    this.inputHarmonicsBend = new NumberInput(this.divHarmonics.element,
      "Bend", 0.9, 0, 2, 0.0001, () => { this.refresh() })

    this.divBounce = new Div(this.divControlRight.element, "Bounce")
    this.headingBounce = new Heading(this.divBounce.element,
      6, "Bounce")
    this.inputBounce = new NumberInput(this.divBounce.element,
      "Number", 5, 1, 64, 1, () => { this.refresh() })
    this.inputInterval = new NumberInputLog(this.divBounce.element,
      "Interval", 0.15, 0.0001, 4, 0.0001, () => { this.refresh() })
    this.inputWander = new NumberInput(this.divBounce.element,
      "Wander", 0.5, 0, 1, 0.0001, () => { this.refresh() })
    this.inputBounceAmpInit = new NumberInput(this.divBounce.element,
      "AmpInit", 1, 0.0001, 4, 0.0001, () => { this.refresh() })
    this.inputBounceAmp = new NumberInput(this.divBounce.element,
      "Amp", 0.5, 0, 1, 0.0001, () => { this.refresh() })
    this.inputBounceBendInit = new NumberInput(this.divBounce.element,
      "BendInit", 1, 0.0001, 16, 0.0001, () => { this.refresh() })
    this.inputBounceBend = new NumberInput(this.divBounce.element,
      "Bend", 0.9, 0, 2, 0.0001, () => { this.refresh() })

    this.refresh()

    window.addEventListener("keydown", (event) => {
      if (event.keyCode === 32) {
        this.play()
      }
    })
  }

  gatherParameters(channel) {
    return {
      channel: channel,
      sampleRate: this.audioContext.sampleRate,
      overSampling: this.checkboxResample.value ? 4 : 1,
      length: this.inputLength.value,
      seed: this.inputSeed.value,
      ampAttack: this.inputAmpAttack.value,
      baseFrequency: this.inputBaseFrequency.value,
      bendAttack: this.inputBendAttack.value,
      bendCurve: this.inputBendCurve.value,
      bendAmount: this.inputBendAmount.value,
      nHarmonics: this.inputHarmonicsNumber.value,
      harmonicsAmp: this.inputHarmonicsAmp.value,
      harmonicsBend: this.inputHarmonicsBend.value,
      nBounce: this.inputBounce.value,
      interval: this.inputInterval.value,
      wander: this.inputWander.value,
      bounceAmpInit: this.inputBounceAmpInit.value,
      bounceAmp: this.inputBounceAmp.value,
      bounceBendInit: this.inputBounceBendInit.value,
      bounceBend: this.inputBounceBend.value,
    }
  }

  random() {
    if (this.pullDownMenuRandomType.value === "Default") {
      this.inputSeed.random()
      this.inputBaseFrequency.value = randomRange(50, 800)
      this.inputBendAttack.value = randomRange(0.001, 0.5) ** 2
      this.inputBendCurve.random()
      this.inputBendAmount.value = randomRange(400, 4000)
      this.inputHarmonicsNumber.random()
      this.inputHarmonicsAmp.value = randomRange(0.3, 0.7)
      this.inputHarmonicsBend.value = randomRange(0, 1)
    }
    else {
      this.inputSeed.random()
      this.inputBaseFrequency.random()
      this.inputBendAttack.random()
      this.inputBendCurve.random()
      this.inputBendAmount.random()
      this.inputHarmonicsNumber.random()
      this.inputHarmonicsAmpDecay.random()
      this.inputHarmonicsBendDecay.random()
    }
    this.refresh()
  }

  refresh() {
    this.render()
  }

  play() {
    var buffer = this.audioContext.createBuffer(
      this.wave.channels, this.wave.frames, this.audioContext.sampleRate)

    for (var i = 0; i < this.wave.channels; ++i) {
      var waveFloat32 = new Float32Array(this.wave.data[i])
      buffer.copyToChannel(waveFloat32, i, 0)
    }

    if (this.source !== undefined) {
      this.source.stop()
    }
    this.source = this.audioContext.createBufferSource()
    this.source.buffer = buffer
    this.source.connect(this.audioContext.destination)
    this.source.start()
  }

  stop() {
    if (this.source !== undefined) {
      this.source.stop()
    }
  }

  save() {
    var buffer = Wave.toBuffer(this.wave, this.wave.channels)
    var header = Wave.fileHeader(
      this.audioContext.sampleRate, this.wave.channels, buffer.length, false)

    var blob = new Blob([header, buffer], { type: "application/octet-stream" })
    var url = window.URL.createObjectURL(blob)

    var a = document.createElement("a")
    a.style = "display: none"
    a.href = url
    a.download = document.title + "_" + Date.now() + ".wav"
    document.body.appendChild(a)
    a.click()

    // Firefoxでダウンロードできるようにするための遅延。
    setTimeout(() => {
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    }, 100)
  }

  render() {
    this.headingRenderStatus.element.textContent = "⚠ Rendering ⚠"
    var channels = 2
    for (var ch = 0; ch < channels; ++ch) {
      if (this.workers[ch].isRunning) {
        this.workers[ch].worker.terminate()
        this.workers[ch].worker = new Worker("renderer.js")
      }
      else {
        this.workers[ch].isRunning = true
      }
      this.workers[ch].worker.postMessage(this.gatherParameters(ch))
    }

    this.workers.forEach((value, index) => {
      value.worker.onmessage = (event) => {
        this.wave.data[index] = event.data
        this.workers[index].isRunning = false
        if (this.workers.every((v) => !v.isRunning)) {
          if (channels === 1) {
            this.wave.copyChannel(index)
          }
          this.finalize()
        }
      }
    })
  }

  finalize() {
    if (this.checkboxNormalize.value) {
      this.wave.normalize()
    }
    this.wave.declickIn(this.inputDeclickIn.value * this.audioContext.sampleRate)
    this.wave.zeroOut(Math.floor(0.01 * this.audioContext.sampleRate))
    this.waveView.set(this.wave)

    if (this.checkboxQuickSave.value) {
      this.save()
    }

    this.headingRenderStatus.element.textContent = "Rendering finished. ✓"
  }
}

var ui = new UI(document.body)

// If startup is succeeded, remove "unsupported" paragaraph.
document.getElementById("unsupported").outerHTML = ""
