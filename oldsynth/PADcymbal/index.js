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
      envGain: envelopeViewGain.value,
      envPower: inputEnvelopePower.value,
      numBin: Math.pow(2, inputNumBin.value),
      minFreq: inputMinFreq.value,
      maxFreq: inputMaxFreq.value,
      minGain: checkboxGainInvert.value ? 1e5 : 1e-5,
      maxGain: 1,
      bandWidth: inputBandWidth.value,
      seedFreq: inputSeedFreq.value + inputSeedFreq.max * ch,
      seedGain: inputSeedGain.value + inputSeedGain.max * ch,
      seedPhase: inputSeedPhase.value + inputSeedPhase.max * ch,
    })
  }

  workers.forEach((value, index) => {
    value.worker.onmessage = (event) => {
      wave.data[index] = event.data
      workers[index].isRunning = false
      if (workers.every((v) => !v.isRunning)) {
        wave.declickRatio(inputFadeIn.value, inputFadeOut.value)
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

function randomRange(min, max) {
  return (max - min) * Math.random() + min
}

function randomCommon() {
  envelopeViewGain.random()
  inputEnvelopePower.random()
  if (checkboxRandomizeFadeIn.value) {
    inputFadeIn.random()
  }
  else {
    inputFadeIn.value = 0
  }
  inputFadeOut.random()
  inputSeedFreq.random()
  inputSeedGain.random()
  inputSeedPhase.random()
}

function randomFreqRange() {
  if (checkboxRandomizeFreqRange.value) {
    inputMinFreq.random()
    inputMaxFreq.random()
  }
}

function random() {
  if (pullDownMenuRandomType.value === "RideCup") {
    inputNumBin.value = randomRange(6, 7.5)
    inputBandWidth.value = randomRange(0, 10)
    if (checkboxRandomizeFreqRange.value) {
      inputMinFreq.value = randomRange(100, 600)
      inputMaxFreq.value = randomRange(18000, inputMaxFreq.max)
    }
    randomCommon()
  }
  else if (pullDownMenuRandomType.value === "RideNoisy") {
    inputNumBin.value = randomRange(7, inputNumBin.max)
    inputBandWidth.value = randomRange(0, 10)
    if (checkboxRandomizeFreqRange.value) {
      inputMinFreq.value = randomRange(100, 600)
      inputMaxFreq.value = randomRange(18000, inputMaxFreq.max)
    }
    randomCommon()
  }
  else if (pullDownMenuRandomType.value === "Glassy") {
    inputNumBin.value = randomRange(1, 4)
    inputBandWidth.random()
    randomFreqRange()
    randomCommon()
  }
  else if (pullDownMenuRandomType.value === "Envelope") {
    envelopeViewGain.random()
    inputEnvelopePower.random()
    if (checkboxRandomizeFadeIn.value) {
      inputFadeIn.random()
    }
    inputFadeOut.random()
  }
  else if (pullDownMenuRandomType.value === "Seed") {
    inputSeedFreq.random()
    inputSeedGain.random()
    inputSeedPhase.random()
  }
  else {
    // "All" case.
    inputNumBin.random()
    randomFreqRange()
    randomCommon()
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
description.add("基本操作", "Playボタンかキーボードのスペースキーで音が再生されます。")
description.add("", "値を変更するかRandomボタンを押すと音がレンダリングされます。")
description.add("", "Randomボタンの隣のプルダウンメニューでランダマイズの種類を選択できます。")
description.add("", "Saveボタンで気に入った音を保存できます。")
description.add("", "QuickSaveにチェックを入れると音を再生するたびに音が保存されます。")

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
var pullDownMenuRandomType = new PullDownMenu(divRenderControls.element, null,
  () => { })
pullDownMenuRandomType.add("All")
pullDownMenuRandomType.add("RideCup")
pullDownMenuRandomType.add("RideNoisy")
pullDownMenuRandomType.add("Glassy")
pullDownMenuRandomType.add("Envelope")
pullDownMenuRandomType.add("Seed")
var buttonSave = new Button(divRenderControls.element, "Save",
  () => save(wave))
var checkboxQuickSave = new Checkbox(divRenderControls.element, "QuickSave",
  false, (checked) => { })

var divRandomizeControls = new Div(divMain.element, "RandomizeControls")
var headingRandomizeSwitch = new Heading(divRandomizeControls.element, 6,
  "Randomize Switch")
var checkboxRandomizeFadeIn = new Checkbox(divRandomizeControls.element,
  "FadeIn", false, refresh)
var checkboxRandomizeFreqRange = new Checkbox(divRandomizeControls.element,
  "FreqRange", true, refresh)

var divMiscControls = new Div(divMain.element, "MiscControls")
var headingRender = new Heading(divMiscControls.element, 6, "Render Settings")
var inputLength = new NumberInput(divMiscControls.element, "Length",
  0.8, 0.02, 4, 0.01, refresh)
// var pullDownMenuChannel = new PullDownMenu(divRenderControls.element, null,
//   () => { })
// pullDownMenuChannel.add("Mono")
// pullDownMenuChannel.add("Stereo")
var checkboxNormalize = new Checkbox(divMiscControls.element, "Normalize",
  true, refresh)

var divEnvGainControls = new Div(divMain.element, "EnvGainControls")
var headingEnvGain = new Heading(divEnvGainControls.element, 6, "Gain Envelope")
var envelopeViewGain = new EnvelopeView(divEnvGainControls.element,
  256, 128, 0.2, 0.2, 0.8, 0.8, "gain", refresh)
var inputEnvelopePower = new NumberInput(divEnvGainControls.element, "EnvPow",
  1.0, 0, 4, 0.01, refresh)
var inputFadeIn = new NumberInput(divEnvGainControls.element, "FadeIn",
  0, 0, 100, 0.01, refresh)
var inputFadeOut = new NumberInput(divEnvGainControls.element, "FadeOut",
  0, 0, 100, 0.01, refresh)

var divPadsynthControls = new Div(divMain.element, "PadsynthControls")
var headingPadsynth = new Heading(divPadsynthControls.element, 6, "PADsynth")
var inputNumBin = new NumberInput(divPadsynthControls.element, "NumBin",
  6, 0, 12, 0.01, refresh)
var inputMinFreq = new NumberInput(divPadsynthControls.element, "MinFreq",
  100, 0, 2500, 1, refresh)
var inputMaxFreq = new NumberInput(divPadsynthControls.element, "MaxFreq",
  12000, 3000, audioContext.sampleRate / 2, 1, refresh)
var inputBandWidth = new NumberInput(divPadsynthControls.element, "BandWidth",
  10, 0.01, 25, 0.01, refresh)
var inputSeedFreq = new NumberInput(divPadsynthControls.element, "SeedFreq",
  0, 0, Math.floor(Number.MAX_SAFE_INTEGER / 2), 1, refresh)
var inputSeedGain = new NumberInput(divPadsynthControls.element, "SeedGain",
  0, 0, Math.floor(Number.MAX_SAFE_INTEGER / 2), 1, refresh)
var inputSeedPhase = new NumberInput(divPadsynthControls.element, "SeedPhase",
  0, 0, Math.floor(Number.MAX_SAFE_INTEGER / 2), 1, refresh)
var checkboxGainInvert = new Checkbox(divPadsynthControls.element, "GainInvert",
  false, refresh)

refresh()

window.addEventListener("keydown", (event) => {
  if (event.keyCode === 32) {
    play(audioContext, wave)
  }
})

// If startup is succeeded, remove "unsupported" paragaraph.
document.getElementById("unsupported").outerHTML = ""
