const TWO_PI = 2 * Math.PI

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

function getChannels() {
  switch (pullDownMenuChannel.value) {
    case "Mono":
      return 1
    case "Stereo":
      return 2
  }
  return wave.channels
}

function makeWave() {
  headingRenderStatus.element.textContent = "⚠ Rendering ⚠"
  var channels = getChannels()
  for (var ch = 0; ch < channels; ++ch) {
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
      overSampling: checkboxResample.value ? 16 : 1,
      postHighShelfFrequency: inputHighShelfFrequency.value,
      postHighShelfQ: inputHighShelfQ.value,
      postHighShelfGain: inputHighShelfGain.value,
      seed: inputSeed.value * (ch + 1),
      fdnReferenceDelayTime: inputFdnReferenceDelayTime.value,
      fdnFeedback: inputFdnFeedback.value,
      fdnCascadeMix: inputFdnCascadeMix.value,
      diagPower: inputDiagPower.value,
      nonDiagPower: inputNonDiagPower.value,
      allpassFeedback: 1 - inputAllpassFeedback.value,
      allpassMix: inputAllpassMix.value,
      allpassHighpassFrequency: inputAllpassHighpassFrequency.value,
      fdnAttackTimeRatio: inputFdnAttackTimeRatio.value,
      fdnAttackMix: inputFdnAttackMix.value,
      fdnTickTimeRatio: inputFdnTickTimeRatio.value,
      fdnTickMix: inputFdnTickMix.value,
      fdnFilterSeed: inputFdnFilterSeed.value,
      fdnMaxFilterGain: inputFdnMaxFilterGain.value,
      fdnMaxFilterQ: inputFdnMaxFilterQ.value,
    })
  }
  for (var ch = channels; ch < wave.channels; ++ch) {
    workers[ch].isRunning = false
  }

  workers.forEach((value, index) => {
    value.worker.onmessage = (event) => {
      wave.data[index] = event.data
      workers[index].isRunning = false
      if (workers.every((v) => !v.isRunning)) {
        if (channels === 1) {
          wave.copyChannel(index)
        }
        finalize()
      }
    }
  })
}

function finalize() {
  wave.declickRatio(inputFadeIn.value, inputFadeOut.value)
  if (checkboxNormalize.value) {
    wave.normalize()
  }
  wave.zeroOut(Math.floor(0.002 * audioContext.sampleRate))
  waveView.set(wave)

  if (checkboxQuickSave.value) {
    save(wave)
  }

  headingRenderStatus.element.textContent = "Rendering finished. ✓"
}

class WaveViewMulti {
  constructor(parent, channels) {
    this.waveView = []
    for (var i = 0; i < channels; ++i) {
      this.waveView.push(new WaveView(parent, 450, 256, wave.left, false))
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

function random() {
  if (pullDownMenuRandomType.value === "Default") {
    inputSeed.random()
    inputFdnReferenceDelayTime.random()
    inputFdnAttackTimeRatio.random()
    inputFdnAttackMix.value = randomRange(0.001, 0.02)
    inputFdnTickTimeRatio.random()
    inputFdnTickMix.random()
    inputFdnCascadeMix.value = randomRange(0.6, 0.7)
    inputDiagPower.random()
    inputNonDiagPower.random()
    inputAllpassFeedback.random()
    inputAllpassMix.random()
    inputAllpassHighpassFrequency.random()
    inputFdnFilterSeed.random()
    inputFdnMaxFilterGain.random()
    inputFdnMaxFilterQ.random()
  }
  else if (pullDownMenuRandomType.value === "Seed") {
    inputSeed.random()
    inputFdnFilterSeed.random()
  }
  else {
    // "All" case.
    inputSeed.random()
    inputFdnReferenceDelayTime.random()
    inputFdnAttackTimeRatio.random()
    inputFdnAttackMix.random()
    inputFdnTickTimeRatio.random()
    inputFdnTickMix.random()
    // inputFdnFeedback.random()
    inputFdnCascadeMix.random()
    inputDiagPower.random()
    inputNonDiagPower.random()
    inputAllpassFeedback.random()
    inputAllpassMix.random()
    inputAllpassHighpassFrequency.random()
    inputFdnFilterSeed.random()
    inputFdnMaxFilterGain.random()
    inputFdnMaxFilterQ.random()
  }
  refresh()
}

//-- UI.

var audioContext = new AudioContext()

var wave = new Wave(2)
var workers = []
for (var ch = 0; ch < wave.channels; ++ch) {
  workers.push({
    worker: new Worker("renderer.js"),
    isRunning: false,
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
description.add("ヒント", "発散するときはFDN.Feedbackを0にしてFDN.Flt.Gainの値を下げてみてください。")
description.add("", "音量が波打つときはFDN.Cas.Mixの値を下げてみてください。")

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
pullDownMenuRandomType.add("Default")
pullDownMenuRandomType.add("All")
pullDownMenuRandomType.add("Seed")
var buttonSave = new Button(divRenderControls.element, "Save",
  () => save(wave))
var checkboxQuickSave = new Checkbox(divRenderControls.element, "QuickSave",
  false, (checked) => { })

//// ControlLeft
var divControlLeft = new Div(divMain.element, "controlLeft", "controlBlock")

var divMiscControls = new Div(divControlLeft.element, "miscControls")
var headingRender = new Heading(divMiscControls.element, 6, "Render Settings")
var inputLength = new NumberInput(divMiscControls.element,
  "Length", 1, 0.02, 16, 0.01, refresh, true)
var pullDownMenuChannel = new PullDownMenu(divMiscControls.element,
  null, refresh)
pullDownMenuChannel.add("Mono")
pullDownMenuChannel.add("Stereo")
var checkboxNormalize = new Checkbox(divMiscControls.element, "Normalize",
  true, refresh)
var checkboxResample = new Checkbox(divMiscControls.element, "16x Sampling",
  false, refresh)

var divEnvGainControls = new Div(divControlLeft.element, "envGainControls")
var headingEnvGain = new Heading(divEnvGainControls.element, 6, "Gain Envelope")
var inputFadeIn = new NumberInput(divEnvGainControls.element,
  "FadeIn", 0, 0, 100, 0.01, refresh)
var inputFadeOut = new NumberInput(divEnvGainControls.element,
  "FadeOut", 0, 0, 100, 0.01, refresh)

var divHighShelfControls = new Div(divControlLeft.element, "highShelfControls")
var headingHighShelf = new Heading(divHighShelfControls.element, 6, "HighShelf")
var inputHighShelfFrequency = new NumberInput(divHighShelfControls.element,
  "Frequency", 1000, 20, 4000, 0.01, refresh, true)
var inputHighShelfQ = new NumberInput(divHighShelfControls.element,
  "Q", 0.1, 0.01, 0.5, 0.001, refresh, true)
var inputHighShelfGain = new NumberInput(divHighShelfControls.element,
  "Gain", -30, -100, 0, 0.001, refresh, false)

//// ControlRight
var divControlRight = new Div(divMain.element, "controlRight", "controlBlock")

var divCymbalControls = new Div(divControlRight.element, "cymbalControls")
var headingCymbal = new Heading(divCymbalControls.element, 6, "Cymbal")
var inputSeed = new NumberInput(divCymbalControls.element,
  "Time.Seed", 0, 0, Math.floor(Number.MAX_SAFE_INTEGER / 2), 1, refresh, false)
var inputFdnReferenceDelayTime = new NumberInput(divCymbalControls.element,
  "FDN.Time", 0.16, 0.0001, 0.2, 0.0001, refresh, true)
var inputFdnAttackTimeRatio = new NumberInput(divCymbalControls.element,
  "Atk.Time", 0.2, 0.0001, 1, 0.0001, refresh, true)
var inputFdnAttackMix = new NumberInput(divCymbalControls.element,
  "Atk.Mix", 0.01, 0, 0.1, 0.0001, refresh, true)
var inputFdnTickTimeRatio = new NumberInput(divCymbalControls.element,
  "Tick.Time", 0.1, 0.0001, 1, 0.0001, refresh, true)
var inputFdnTickMix = new NumberInput(divCymbalControls.element,
  "Tick.Mix", 0.2, 0, 1, 0.0001, refresh, true)
var inputFdnFeedback = new NumberInput(divCymbalControls.element,
  "FDN.Feedback", 0.02, 0, 16, 0.0001, refresh, false)
var inputFdnCascadeMix = new NumberInput(divCymbalControls.element,
  "FDN.Cas.Mix", 0.67, 0, 1, 0.0001, refresh, false)
var inputDiagPower = new NumberInput(divCymbalControls.element,
  "Diag.Pow", 4, 0, 32, 0.001, refresh, true)
var inputNonDiagPower = new NumberInput(divCymbalControls.element,
  "NonDiag.Pow", 2.4, 0, 8, 0.001, refresh, true)
var inputAllpassFeedback = new NumberInput(divCymbalControls.element,
  "AP.Feedback", 0.01, 0.0001, 1, 0.0001, refresh, false)
var inputAllpassMix = new NumberInput(divCymbalControls.element,
  "AP.Mix", 2 / 3, 0, 1, 0.001, refresh, false)
var inputAllpassHighpassFrequency = new NumberInput(divCymbalControls.element,
  "AP.HP.Freq", 20, 1, 200, 0.001, refresh, true)
var inputFdnFilterSeed = new NumberInput(divCymbalControls.element,
  "FDN.Flt.Seed", 0, 0, Math.floor(Number.MAX_SAFE_INTEGER / 2), 1, refresh, false)
var inputFdnMaxFilterGain = new NumberInput(divCymbalControls.element,
  "FDN.Flt.Gain", 20, -24, 24, 0.0001, refresh, false)
var inputFdnMaxFilterQ = new NumberInput(divCymbalControls.element,
  "FDN.Flt.Q", 0.01, 0.01, 0.99, 0.01, refresh, false)

refresh()

window.addEventListener("keydown", (event) => {
  if (event.keyCode === 32) {
    play(audioContext, wave)
  }
})

// If startup is succeeded, remove "unsupported" paragaraph.
document.getElementById("unsupported").outerHTML = ""
