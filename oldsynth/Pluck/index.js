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

    // var chord = [-7, -2, 3, 7, 12]
    //   .map((value) => value + Math.floor(5 * Math.random()))
    // chord.unshift(-12)

    workers[ch].worker.postMessage({
      length: inputLength.value,
      sampleRate: audioContext.sampleRate,
      // overSampling: checkboxResample.value ? 16 : 1,
      overSampling: 1,
      transpose: inputTranspose.value,
      seed: inputSeed.value + inputSeed.max * ch,
      chord: chord.value,
      delayTime: inputDelayTime.value,
      jitter: inputJitter.value,
      stack: inputStackCount.value,
      stackDetune: inputStackDetune.value,
      cutoff: inputCutoff.value,
      cutoffVariation: inputCutoffVariation.value,
      qVariation: inputQVariation.value,
      pickTime: Math.pow(2, inputPickTime.value),
      pickCombFB: inputPickCombFeedback.value,
      pickCombTime: Math.pow(2, inputPickCombTime.value),
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
        wave.zeroOut(Math.floor(0.002 * audioContext.sampleRate))
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
      this.waveView.push(new WaveView(parent, 450, 256, wave.left, false))
    }
  }

  set(wave) {
    for (var ch = 0; ch < this.waveView.length; ++ch) {
      this.waveView[ch].set(wave.data[ch])
    }
  }
}

class Chord {
  constructor(parent, refreshFunc) {
    this.parent = parent
    this.refreshFunc = refreshFunc

    this.div = new Div(this.parent, "chordControls")
    this.heading = new Heading(this.div.element, 6, "Chord")
    this.buttonPush = new Button(this.div.element, "Push", () => this.push())
    this.buttonPop = new Button(this.div.element, "Pop", () => this.pop())

    this.note = []
    for (var i = 0; i < 6; ++i) {
      this.push()
    }
  }

  get value() {
    var chord = []
    for (let n of this.note) {
      chord.push(n[0].value + n[1].value / 100.0)
    }
    return chord
  }

  push() {
    this.note.push([
      new NumberInput(
        this.div.element,
        "Note" + (this.note.length + 1),
        0,
        -24,
        24,
        1,
        this.refreshFunc
      ),
      new NumberInput(
        this.div.element,
        "Cent" + (this.note.length + 1),
        0,
        -100,
        100,
        1,
        this.refreshFunc
      )
    ])
  }

  pop() {
    if (this.note.length > 1) {
      var obj = this.note.pop()
      for (let elem of obj)
        this.div.element.removeChild(elem.div)
    }
  }

  random() {
    for (var i = 1; i < this.note.length; ++i) {
      this.note[i][0].random()
      this.note[i][1].random()
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
  if (pullDownMenuRandomType.value === "something") {
  }
  else {
    // "All" case.
    chord.random()
    inputDelayTime.random()
    inputSeed.random()
    inputStackCount.random()
    inputStackDetune.random()
    // inputPickTime.random()
    // inputPickCombTime.random()
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
var buttonSave = new Button(divRenderControls.element, "Save",
  () => save(wave))
var checkboxQuickSave = new Checkbox(divRenderControls.element, "QuickSave",
  false, (checked) => { })

//// ControlLeft
var divControlLeft = new Div(divMain.element, "controlLeft", "controlBlock")

var divMiscControls = new Div(divControlLeft.element, "miscControls")
var headingRender = new Heading(divMiscControls.element, 6, "Render Settings")
var inputLength = new NumberInput(divMiscControls.element, "Length",
  1, 0.02, 16, 0.01, refresh)
// var pullDownMenuChannel = new PullDownMenu(divRenderControls.element, null,
//   () => { })
// pullDownMenuChannel.add("Mono")
// pullDownMenuChannel.add("Stereo")
var checkboxNormalize = new Checkbox(divMiscControls.element, "Normalize",
  true, refresh)
// var checkboxResample = new Checkbox(divMiscControls.element, "16x Sampling",
//   false, refresh)

var divEnvGainControls = new Div(divControlLeft.element, "envGainControls")
var headingEnvGain = new Heading(divEnvGainControls.element, 6, "Gain Envelope")
var inputFadeIn = new NumberInput(divEnvGainControls.element, "FadeIn",
  0, 0, 100, 0.01, refresh)
var inputFadeOut = new NumberInput(divEnvGainControls.element, "FadeOut",
  60, 0, 100, 0.01, refresh)

var divPluckControls = new Div(divControlLeft.element, "pluckControls")
var headingPluck = new Heading(divPluckControls.element, 6, "Pluck")
var inputTranspose = new NumberInput(divPluckControls.element, "Transpose",
  -12, -36, 24, 1, refresh)
var inputSeed = new NumberInput(divPluckControls.element, "Seed",
  0, 0, Math.floor(Number.MAX_SAFE_INTEGER / 2), 1, refresh)
var inputDelayTime = new NumberInput(divPluckControls.element, "DelayTime",
  0.06, 0, 0.1, 0.0001, refresh)
var inputJitter = new NumberInput(divPluckControls.element, "Jitter",
  0.01, 0, 1, 0.0001, refresh)
var inputStackCount = new NumberInput(divPluckControls.element, "Stack",
  8, 1, 16, 1, refresh)
var inputStackDetune = new NumberInput(divPluckControls.element, "StackDetune",
  1.3333, 1, 3, 0.0001, refresh)
var inputCutoff = new NumberInput(divPluckControls.element, "Cutoff",
  0.3, 0, 1, 0.0001, refresh)
var inputCutoffVariation = new NumberInput(divPluckControls.element, "CutoffVar.",
  1, 0, 1, 0.0001, refresh)
var inputQVariation = new NumberInput(divPluckControls.element, "QVar.",
  0.8, 0, 0.9999, 0.0001, refresh)
var inputPickTime = new NumberInput(divPluckControls.element, "PickTime",
  0, -2, 2, 0.001, refresh)
var inputPickCombFeedback = new NumberInput(divPluckControls.element,
  "PickCombFB", 0.3, 0, 0.9999, 0.0001, refresh)
var inputPickCombTime = new NumberInput(divPluckControls.element,
  "PickCombTime", 0, -2, 6, 0.1, refresh)

//// ControlRight
var divControlRight = new Div(divMain.element, "controlRight", "controlBlock")
var chord = new Chord(divControlRight.element, refresh)

refresh()

window.addEventListener("keydown", (event) => {
  if (event.keyCode === 32) {
    play(audioContext, wave)
  }
})

// If startup is succeeded, remove "unsupported" paragaraph.
document.getElementById("unsupported").outerHTML = ""
