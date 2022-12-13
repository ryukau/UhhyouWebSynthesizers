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
      seed: inputSeed.value + inputSeed.max * ch,
      pickCombFB: inputPickCombFeedback.value,
      pickCombTime: Math.pow(2, inputPickCombTime.value),
      dx: inputDx.value,
      waveSpeed: inputWaveSpeed.value,
      damping: inputDamping.value,
      stiffness: sitffnessValue(),
      boundaryCondition: pullDownMenuBoundary.value,
      scatterImpulse: checkboxScatterImpulse.value,
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

function sitffnessValue() {
  if (checkboxMetalic.value) {
    return inputStiffness.value * 10 ** 5
  }
  return inputStiffness.value * 10 ** 2
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
  if (pullDownMenuRandomType.value === "Seed") {
    inputSeed.random()
  }
  else if (pullDownMenuRandomType.value === "Soft") {
    checkboxMetalic.unCheck()
    checkboxScatterImpulse.random()

    inputSeed.random()
    inputDx.random()
    inputWaveSpeed.value = randomRange(0.1, 1000)
    inputDamping.value = randomRange(96, inputDamping.max)
    inputStiffness.random()
    inputPickCombFeedback.random()
    inputPickCombTime.random()
  }
  else if (pullDownMenuRandomType.value === "Metal") {
    checkboxMetalic.check()
    checkboxScatterImpulse.random()

    inputSeed.random()
    inputDx.random()
    inputWaveSpeed.value = randomRange(1000, inputWaveSpeed.max)
    inputDamping.value = randomRange(96, inputDamping.max)
    inputStiffness.random()
    inputPickCombFeedback.random()
    inputPickCombTime.random()
  }
  else {
    // "All" case.
    // inputFadeIn.random()
    // inputFadeOut.random()

    checkboxScatterImpulse.random()
    checkboxMetalic.random()
    pullDownMenuBoundary.random()

    inputSeed.random()
    inputDx.random()
    inputWaveSpeed.random()
    inputDamping.random()
    inputStiffness.random()
    inputPickCombFeedback.random()
    inputPickCombTime.random()
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
description.add("注意", "レンダリングに時間がかかります。")

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
pullDownMenuRandomType.add("Soft")
pullDownMenuRandomType.add("Metal")
pullDownMenuRandomType.add("Seed")
pullDownMenuRandomType.add("All")
var buttonSave = new Button(divRenderControls.element, "Save",
  () => save(wave))
var checkboxQuickSave = new Checkbox(divRenderControls.element, "QuickSave",
  false, (checked) => { })

//// ControlLeft
var divControlLeft = new Div(divMain.element, "controlLeft", "controlBlock")

var divMiscControls = new Div(divControlLeft.element, "miscControls")
var headingRender = new Heading(divMiscControls.element, 6, "Render Settings")
var inputLength = new NumberInput(divMiscControls.element,
  "Length", 0.2, 0.02, 16, 0.01, refresh)
var pullDownMenuChannel = new PullDownMenu(divMiscControls.element,
  null, refresh)
pullDownMenuChannel.add("Mono")
pullDownMenuChannel.add("Stereo")
var checkboxNormalize = new Checkbox(divMiscControls.element, "Normalize",
  true, refresh)
// Wave1D のピッチがサンプリング周波数によって変わる。
var checkboxResample = new Checkbox(divMiscControls.element, "16x Sampling",
  false, refresh)

var divEnvGainControls = new Div(divControlLeft.element, "envGainControls")
var headingEnvGain = new Heading(divEnvGainControls.element, 6, "Gain Envelope")
var inputFadeIn = new NumberInput(divEnvGainControls.element,
  "FadeIn", 0, 0, 100, 0.01, refresh)
var inputFadeOut = new NumberInput(divEnvGainControls.element,
  "FadeOut", 0, 0, 100, 0.01, refresh)

var divCymbalControls = new Div(divControlLeft.element, "cymbalControls")
var headingPluck = new Heading(divCymbalControls.element, 6, "Cymbal")
var inputSeed = new NumberInput(divCymbalControls.element,
  "Seed", 0, 0, Math.floor(Number.MAX_SAFE_INTEGER / 2), 1, refresh)
var inputDx = new NumberInput(divCymbalControls.element,
  "dx", 0.01, 0.0001, 1, 0.0001, refresh)
var inputWaveSpeed = new NumberInput(divCymbalControls.element,
  "WaveSpeed", 10, 0.1, 10000, 0.0001, refresh)
var inputDamping = new NumberInput(divCymbalControls.element,
  "Damping", 100, 0, 128, 0.0001, refresh)
var inputStiffness = new NumberInput(divCymbalControls.element,
  "Stiffness", 1, 0, 10000, 0.0001, refresh)
var inputPickCombFeedback = new NumberInput(divCymbalControls.element,
  "PickCombFB", 0.3, 0, 0.6, 0.0001, refresh)
var inputPickCombTime = new NumberInput(divCymbalControls.element,
  "PickCombTime", 0, -2, 2, 0.1, refresh)
var pullDownMenuBoundary = new PullDownMenu(divCymbalControls.element,
  null, refresh)
pullDownMenuBoundary.add("Constant")
pullDownMenuBoundary.add("Free")
var checkboxScatterImpulse = new Checkbox(divCymbalControls.element, "ScatterImpulse",
  false, (checked) => { refresh() })
var checkboxMetalic = new Checkbox(divCymbalControls.element, "Metalic",
  false, (checked) => { refresh() })

refresh()

window.addEventListener("keydown", (event) => {
  if (event.keyCode === 32) {
    play(audioContext, wave)
  }
})

// If startup is succeeded, remove "unsupported" paragaraph.
document.getElementById("unsupported").outerHTML = ""
