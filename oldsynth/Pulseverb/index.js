const TWO_PI = 2 * Math.PI

class RenderParameters {
  constructor(audioContext, overSampling) {
    this.audioContext = audioContext
    this.overSampling = overSampling
  }

  get sampleRate() {
    return this._sampleRate
  }

  get overSampling() {
    return this._overSampling
  }

  set overSampling(value) {
    this._overSampling = value
    this._sampleRate = this._overSampling * this.audioContext.sampleRate
  }
}

function play(audioContext, wave) {
  var channel = wave.channels
  var frame = wave.frames
  var buffer = audioContext.createBuffer(channel, frame, audioContext.sampleRate)

  for (var i = 0; i < wave.channels; ++i) {
    var waveFloat32 = new Float32Array(wave.data[i])
    buffer.copyToChannel(waveFloat32, i, 0)
  }

  if (this.source !== undefined) {
    this.source.stop()
  }
  this.source = audioContext.createBufferSource()
  this.source.buffer = buffer
  this.source.connect(audioContext.destination)
  this.source.start()
}

function save(wave) {
  var buffer = Wave.toBuffer(wave, wave.channels)
  var header = Wave.fileHeader(audioContext.sampleRate, wave.channels,
    buffer.length)

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

function makeWave() {
  headingRenderStatus.element.textContent = "⚠ Rendering ⚠"
  for (var ch = 0; ch < wave.channels; ++ch) {
    if (workers[ch].isRunning) {
      workers[ch].worker.terminate()
      workers[ch].worker = new Worker("renderer.js")
    }
    else {
      workers[ch].isRunning = true
    }
    workers[ch].worker.postMessage({
      length: inputLength.value,
      sampleRate: audioContext.sampleRate,
      stack: inputStack.value,
      density: inputDensity.value,
      lpOrder: inputLPOrder.value,
      lpStart: inputLPStart.value,
      lpEnd: inputLPEnd.value,
      hpOrder: inputHPOrder.value,
      hpStart: inputHPStart.value,
      hpEnd: inputHPEnd.value,
      seed: inputSeed.value + inputSeed.max * ch,
    })
  }

  workers.forEach((value, index) => {
    value.worker.onmessage = (event) => {
      wave.data[index] = event.data
      workers[index].isRunning = false
      if (workers.every((v) => !v.isRunning)) {
        if (checkboxTrim.value) {
          wave.trim()
        }
        wave.declick(inputDeclickIn.value, inputDeclickOut.value)
        if (checkboxNormalize.value) {
          wave.normalize()
        }
        waveView.set(wave)

        if (checkboxQuickSave.value) {
          save(wave)
        }

        headingRenderStatus.element.textContent = "Rendering finished. ✓"
      }
    }
  })
}

class WaveViewMulti {
  constructor(parent, channels) {
    this.waveView = []
    for (var i = 0; i < channels; ++i) {
      this.waveView.push(new WaveView(parent, 512, 256, wave.left, false))
    }
  }

  set(wave) {
    for (var ch = 0; ch < this.waveView.length; ++ch) {
      this.waveView[ch].set(wave.data[ch])
    }
  }
}

function refresh() {
  makeWave()
}

function random() {
  if (pullDownMenuRandomType.value === "Reverb") {
    inputDeclickIn.value = 0
    inputDensity.random()
    inputSeed.random()
    inputLPOrder.value = 0
    inputLPStart.value = 1
    inputLPEnd.value = 1
    inputHPOrder.value = 0
    inputHPStart.value = 0
    inputHPEnd.value = 0
  }
  else if (pullDownMenuRandomType.value === "Seed") {
    inputSeed.random()
  }
  else {
    inputDeclickIn.value = Math.floor(tenMilliSecond / 10)
    // inputStack.random()
    inputDensity.random()
    inputSeed.random()
    inputLPOrder.random()
    inputLPStart.random()
    inputLPEnd.random()
    inputHPOrder.random()
    inputHPStart.random()
    inputHPEnd.random()
  }
  refresh()
}


//-- UI.

var audioContext = new AudioContext()
var renderParameters = new RenderParameters(audioContext, 16)

var wave = new Wave(2)
var workers = []
for (var ch = 0; ch < wave.channels; ++ch) {
  workers.push({
    worker: new Worker("renderer.js"),
    isRunning: true,
  })
}

var divMain = new Div(document.body, "main")
var headingTitle = new Heading(divMain.element, 1, document.title)

var description = new Description(divMain.element)
description.add("基本操作", "Playボタンでインパルス応答が再生されます。")
description.add("", "値を変更するかRandomボタンを押すとインパルス応答がレンダリングされます。")
description.add("", "Saveボタンで気に入ったインパルス応答を保存できます。")
description.add("", "QuickSaveにチェックを入れるとレンダリングが終了するたびにインパルス応答が保存されます。")
description.add("", "フィルタはOrderを0にすると無効になります。")
description.add("⚠注意", "Stackの値を大きくするとレンダリング時間が長くなります。")

var divWaveform = new Div(divMain.element, "waveform")
var headingWaveform = new Heading(divWaveform.element, 6, "Waveform")
var waveView = new WaveViewMulti(divWaveform.element, wave.channels)

var divRenderControls = new Div(divMain.element, "renderControls")
var headingRenderStatus = new Heading(divRenderControls.element, 4,
  "Rendering status will be displayed here.")
var buttonPlay = new Button(divRenderControls.element, "Play",
  () => play(audioContext, wave))
var buttonRandom = new Button(divRenderControls.element, "Random",
  () => random())
var buttonSave = new Button(divRenderControls.element, "Save",
  () => save(wave))
var pullDownMenuRandomType = new PullDownMenu(divRenderControls.element, null,
  () => { })
pullDownMenuRandomType.add("Reverb")
pullDownMenuRandomType.add("Seed")
pullDownMenuRandomType.add("All")
var checkboxQuickSave = new Checkbox(divRenderControls.element, "QuickSave",
  false, (checked) => { })

var divMiscControls = new Div(divMain.element, "MiscControls")
var headingRender = new Heading(divMiscControls.element, 6, "Render Settings")
var inputLength = new NumberInput(divMiscControls.element, "Length",
  2, 0.02, 16, 0.01, (value) => { refresh() })
var tenMilliSecond = audioContext.sampleRate / 100
var inputDeclickIn = new NumberInput(divMiscControls.element, "Declick In",
  0, 0, tenMilliSecond, 1, refresh)
var inputDeclickOut = new NumberInput(divMiscControls.element, "Declick Out",
  Math.floor(tenMilliSecond / 10), 0, tenMilliSecond, 1, refresh)
var checkboxNormalize = new Checkbox(divMiscControls.element, "Normalize",
  true, refresh)
var checkboxTrim = new Checkbox(divMiscControls.element, "Trim",
  false, refresh)

var divReverbControls = new Div(divMain.element, "MiscControls")
var headingReverb = new Heading(divReverbControls.element, 6, "Reverb")
var inputStack = new NumberInput(divReverbControls.element,
  "Stack", 4, 0, 10, 1, refresh)
var inputDensity = new NumberInput(divReverbControls.element,
  "Density", 0, -10, 10, 1, refresh)
var inputSeed = new NumberInput(divReverbControls.element,
  "Seed", 0, 0, Math.floor(Number.MAX_SAFE_INTEGER / 2), 1, refresh)
var headingFilter = new Heading(divReverbControls.element, 6, "Filter")
var inputLPOrder = new NumberInput(divReverbControls.element,
  "LP.Order", 0, 0, 8, 1, refresh)
var inputLPStart = new NumberInput(divReverbControls.element,
  "LP.Start", 1, 0, 1, 0.001, refresh)
var inputLPEnd = new NumberInput(divReverbControls.element,
  "LP.End", 0.5, 0, 1, 0.001, refresh)
var inputHPOrder = new NumberInput(divReverbControls.element,
  "HP.Order", 0, 0, 8, 1, refresh)
var inputHPStart = new NumberInput(divReverbControls.element,
  "HP.Start", 1, 0, 1, 0.001, refresh)
var inputHPEnd = new NumberInput(divReverbControls.element,
  "HP.End", 0.5, 0, 1, 0.001, refresh)

refresh()

// If startup is succeeded, remove "unsupported" paragaraph.
document.getElementById("unsupported").outerHTML = ""
