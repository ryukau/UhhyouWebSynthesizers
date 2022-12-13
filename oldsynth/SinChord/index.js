const TWO_PI = 2 * Math.PI

// waveは普通のArray。
function play(audioContext, wave) {
  var channel = wave.channels
  var frame = wave.frames
  var buffer = audioContext.createBuffer(channel, frame, audioContext.sampleRate)

  var waveFloat32 = new Float32Array(wave.left)
  buffer.copyToChannel(waveFloat32, 0, 0)
  waveFloat32 = new Float32Array(wave.right)
  buffer.copyToChannel(waveFloat32, 1, 0)

  var source = audioContext.createBufferSource()
  source.buffer = buffer
  source.connect(audioContext.destination)
  source.start()
}

// pitch は一番低い周波数。
// n は音数。
const coefficients = [
  1,
  9 / 8, // d
  6 / 5, // dis
  5 / 4, // e
  4 / 3, // f
  3 / 2, // g
  5 / 3, // a
  7 / 4, // ais
  17 / 9 // b
]

// 0 <= randomInt(n) < n の整数。
function randomInt(n) {
  return Math.floor(n * Math.random())
}

function clamp(value, min, max) {
  return Math.max(min, Math.max(value, min))
}

class Note {
  constructor(frequency, velocity, phase) {
    this.frequency = frequency
    this.velocity = velocity
    this.phase = phase
  }

  clone() {
    return new Note(this.frequency, this.velocity, this.phase)
  }
}

function makeChord(pitch, numNotes, maxPhase) {
  var velocity = 1 / numNotes
  var frequency = pitch
  var chord = []//[{ frequency, velocity }]

  for (var i = 0; i < numNotes; ++i) {
    var index = randomInt(coefficients.length)
    var octave = randomInt(4) + 1
    frequency = octave * pitch * coefficients[index]
    var phase = maxPhase * Math.random()
    chord.push(new Note(frequency, velocity, phase))
  }
  return chord
}

function cloneChord(chord) {
  var clone = []
  for (var i = 0; i < chord.length; ++i) {
    clone.push(chord[i].clone())
  }
  return clone
}

function modifyChord(chord, numEcho, cent, gain, phaseCoefficient) {
  var length = chord.length
  for (var echo = 1; echo <= numEcho; ++echo) {
    var coefficient = Math.pow(2, cent * echo / 1200)
    var velocity = Math.pow(gain, echo)
    for (var i = 0; i < length; ++i) {
      var frequency = coefficient * chord[i].frequency
      var phase = isNaN(phaseCoefficient)
        ? (Math.random() * chord[i].phase)
        : (phaseCoefficient * chord[i].phase)
      chord.push(new Note(frequency, velocity, phase))
    }
  }
  return normalizeVelocity(chord)
}

function normalizeVelocity(chord) {
  var sum = 0
  for (var i = 0; i < chord.length; ++i) {
    sum += chord[i].velocity
  }
  for (var i = 0; i < chord.length; ++i) {
    chord[i].velocity /= sum
  }
  return chord
}

class Oscillator {
  constructor(type) {
    this.shapeValue
    this.sinShape
    this.pulseWidth
    this.pulseLow
    this.sawShape
    this.sawDenom
    this.oscFunc

    this.shape = 0.1
    this.type = type
  }

  set shape(value) {
    this.shapeValue = clamp(value, 0, 1)

    this.sinShape = Math.floor(this.shapeValue * 32) * 2 + 1

    this.pulseWidth = this.shapeValue * 0.48 + 0.5
    this.pulseLow = (1 - this.pulseWidth) / this.pulseWidth
    this.pulseWidth *= TWO_PI

    this.sawShape = TWO_PI * (this.shapeValue * 0.5 + 0.5)
    this.sawDenom = 1 / (TWO_PI / this.sawShape - 1)
  }

  set type(value) {
    switch (value) {
      case "pulse":
        this.oscFunc = this.pulse
        break
      case "trisaw":
        this.oscFunc = this.saw
        break
      case "sin":
      default:
        this.oscFunc = this.sin
        break
    }
  }

  oscillate(phase) {
    return this.oscFunc(phase)
  }

  sin(phase) {
    return Math.pow(Math.sin(phase), this.sinShape)
  }

  pulse(phase) {
    return (phase % TWO_PI < this.pulseWidth) ? this.pulseLow : -1
  }

  saw(phase) {
    phase = (phase % TWO_PI)
    var output = phase / this.sawShape
    if (phase > this.sawShape) {
      output = 1 - (output - 1) * this.sawDenom
    }
    return 2 * output - 1
  }
}

// lengthは秒数。
function makeWave(length, chord, sampleRate) {
  var waveLength = Math.floor(sampleRate * length)
  var wave = new Array(waveLength).fill(0)
  for (var i = 0; i < chord.length; ++i) {
    var note = chord[i]
    var twopif = 2 * Math.PI * note.frequency / sampleRate
    for (var t = 0; t < wave.length; ++t) {
      // wave[t] += note.velocity * Math.sin(twopif * t + note.phase)
      wave[t] += note.velocity * osc.oscillate(twopif * t + note.phase)
      // wave[t] += note.velocity * (saw(twopif * t + note.phase) +  Math.sin(twopif * t + note.phase)) * 0.5
    }
  }
  return wave
}

class EchoControl {
  constructor(parent, refreshFunc, id) {
    this.div = new Div(parent, "echoControl")
    this.heading = new Heading(this.div.element, 6, "Echo" + id)
    this.echo = new NumberInput(this.div.element, "Echo",
      2, 0, 10, 1, refreshFunc)
    this.feedback = new NumberInput(this.div.element, "Feedback",
      1, 0, 2, 0.01, refreshFunc)
    this.pitch = new NumberInput(this.div.element, "Pitch",
      700, -1200, 1200, 1, refreshFunc)
    this.detune = new NumberInput(this.div.element, "Detune",
      525, -1200, 1200, 1, refreshFunc)
  }

  pass(left, right) {
    modifyChord(left, this.echo.value, this.pitch.value,
      this.feedback.value, NaN)
    modifyChord(right, this.echo.value, this.pitch.value + this.detune.value,
      this.feedback.value, NaN)
  }

  random() {
    this.echo.random()
    this.feedback.random()
    this.pitch.random()
    this.detune.random()
  }
}

class EchoGroup {
  constructor(parent, refreshFunc) {
    this.refreshFunc = refreshFunc

    this.div = new Div(parent, "echoGroup")
    this.buttonPush = new Button(this.div.element, "PushEcho", () => this.push())
    this.buttonPop = new Button(this.div.element, "PopEcho", () => this.pop())
    this.echoControls = []
  }

  push() {
    this.echoControls.push(new EchoControl(
      this.div.element, this.refreshFunc, this.echoControls.length))
  }

  pop() {
    var child = this.echoControls.pop().div.element
    this.div.element.removeChild(child)
  }

  pass(left, right) {
    for (var i = 0; i < this.echoControls.length; ++i) {
      this.echoControls[i].pass(chordLeft, chordRight)
    }
  }

  random() {
    for (var i = 0; i < this.echoControls.length; ++i) {
      this.echoControls[i].random()
    }
  }
}

function randomize() {
  // inputBaseFrequency.random()
  // inputBaseNote.random()
  echos.random()
  refresh()
  play(audioContext, wave)
}

function changeChord() {
  refresh()
  play(audioContext, wave)
}

function refresh() {
  osc.type = radio.value
  osc.shape = inputWaveShape.value

  chordLeft = makeChord(inputBaseFrequency.value, inputBaseNotes.value, 2 * Math.PI)
  chordRight = cloneChord(chordLeft)

  echos.pass(chordLeft, chordRight)

  wave.left = makeWave(inputDuration.value, chordLeft, audioContext.sampleRate)
  wave.right = makeWave(inputDuration.value, chordRight, audioContext.sampleRate)
  if (declick) {
    wave.declick()
  }

  waveViewLeft.set(wave.left)
  waveViewRight.set(wave.right)
}

var audioContext = new AudioContext()
console.log(audioContext)

var osc = new Oscillator("saw")
var declick = true
var chordLeft = []
var chordRight = []
var wave = new Wave(2)

var divMain = new Div(document.body, "main")
var headingTitle = new Heading(divMain.element, 1, "SinChord")

var description = new Description(divMain.element)
description.add("概要", "ランダムにコードを作るシンセサイザーです。まずは画面下部のRandomボタンを押してどんな音が出るか試してみてください。FL Studioの3xOSCで似たような音が作れます。あらかじめ用意してある音程をランダムに選んで基本となるコードを作ります。コードはEchoによってさらに複雑になります。")
description.add("Oscillator", "sin, pulse, trisawの3つの基本波形を選択できます。")
description.add("WaveShape", "波形を変更します。")
description.add("BaseFrequency", "基本となるコードの最も低い音です。")
description.add("BaseNotes", "基本となるコードの音数です。")
description.add("Duration", "レンダリングされる音の長さです。")
description.add("Declick", "レンダリングされた音の開始、終了時に短いフェードを入れてプチノイズを抑えます。")
description.add("PushEcho, PopEcho", "Echoの数を変更します。")
description.add("Echo", "コードに追加される音数を変更します。")
description.add("Feedback", "コードに追加される音の大きさを設定します。")
description.add("Pitch", "コードに追加される音の高さを設定します。")
description.add("Detune", "左右のチャンネルの音の高さの差を設定します。")
description.add("Play", "音を再生します。")
description.add("Random", "Echoのパラメータをランダムに変更して音を再生します。")
description.add("ChangeChord", "基本となるコードの構成を変えて音を再生します。")

var waveViewLeft = new WaveView(divMain.element, 512, 256, wave.left)
var waveViewRight = new WaveView(divMain.element, 512, 256, wave.right)

var radio = new RadioButton(divMain.element, "Oscillator", refresh)
radio.add("sin")
radio.add("pulse")
radio.add("trisaw")
var inputWaveShape = new NumberInput(divMain.element, "WaveShape",
  0, 0, 1, 0.01, refresh)
var inputBaseFrequency = new NumberInput(divMain.element, "BaseFrequency",
  110, 5, 1000, 1, refresh)
var inputBaseNotes = new NumberInput(divMain.element, "BaseNotes",
  3, 1, 10, 1, refresh)
var inputDuration = new NumberInput(divMain.element, "Duration",
  0.2, 0.02, 2, 0.02, refresh)

var checkboxDeclick = new Checkbox(divMain.element, "Declick",
  declick, (checked) => { declick = checked })

var echos = new EchoGroup(divMain.element, refresh)
echos.push()
echos.push()

var buttonPlay = new Button(divMain.element, "Play", () => play(audioContext, wave))
var buttonRandom = new Button(divMain.element, "Random", () => randomize())
var buttonChangeChord = new Button(divMain.element, "ChangeChord", () => changeChord())

refresh()

// osc の type をラジオボタンで選択できるようにする。