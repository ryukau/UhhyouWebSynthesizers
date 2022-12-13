const TWO_PI = 2 * Math.PI
const SYNTH_NAME = "ECAFM"

function play(audioContext, wave) {
  if (quickSave) {
    save(wave)
  }

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
  a.download = SYNTH_NAME + Date.now() + ".wav"
  document.body.appendChild(a)
  a.click()

  // 不要になった要素をすぐに消すとFirefoxでうまく動かないので
  // タイマーで少し遅らせる。
  setTimeout(() => {
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }, 100)
}

// lengthは秒数。
function makeWave(length, sampleRate) {
  var waveLength = Math.floor(sampleRate * length)
  var wave = new Array(waveLength).fill(0)
  var frequency = pitchToFrequency(pitch.value)
  var twopif = TWO_PI * frequency / sampleRate
  var stepLength = Math.floor(duration.value * sampleRate / 1000)

  oscillator.initialize()

  for (var t = 0; t < wave.length; ++t) {
    wave[t] += oscillator.oscillate(twopif * t)
    if (t % stepLength == 0) {
      oscillator.next()
    }
  }
  return wave
}

class Delay {
  constructor(audioContext) {
    this.sampleRate = audioContext.sampleRate
    this.buffer = []
    this.index = 0
    this._feedback = 0.5
  }

  // value はミリ秒。
  set length(value) {
    var length = Math.floor(value * this.sampleRate / 1000)
    length = (length < 1) ? 1 : length
    this.buffer = new Array(length).fill(0)
  }

  set feedback(value) {
    this._feedback = Math.max(-0.99, Math.min(value, 0.99))
  }

  refresh() {
    this.buffer.fill(0)
    this.index = 0
  }

  pass(input) {
    var output = input + this.buffer[this.index] * this._feedback
    this.buffer[this.index] = output
    this.index = (this.index + 1) % this.buffer.length
    return output
  }
}

class ElementaryCA {
  constructor(sampleRate, size, rule, seed) {
    this.sampleRate = sampleRate
    this.rule = rule
    this.steepness = 500 / this.sampleRate // 世代交代時の短いフェードの長さ。
    this.seed = seed

    this.cells = []
    this.bufferCells = []
    this.gain = [] // 倍音ごとの現在の音量。

    this.size = size
    this.initialize()
  }

  set size(value) {
    this.cells.length = value
    this.bufferCells.length = value
    this.gain.length = value
  }

  set smooth(msec) {
    this.steepness = (msec < 1e-5) ? 1 : 1000 / (msec * this.sampleRate)
  }

  initialize() {
    var generator = new MersenneTwister(this.seed)
    for (var i = 0; i < this.cells.length; ++i) {
      this.cells[i] = (generator.random() < 0.5)
    }
    this.gain.fill(0)
  }

  next() {
    var cells = this.cells
    var buffer = this.bufferCells
    for (var n = 0; n < cells.length; ++n) {
      var pattern = 4 * cells[this.mod(n - 1)] + 2 * cells[n] + cells[this.mod(n + 1)]
      buffer[n] = (Math.floor(this.rule / Math.pow(2, pattern)) % 2) !== 0
    }
    for (var i = 0; i < buffer.length; ++i) {
      cells[i] = buffer[i]
    }
  }

  gainAt(index) {
    if (this.cells[index]) {
      this.gain[index] = Math.min(this.gain[index] + this.steepness, 1)
    }
    else {
      this.gain[index] = Math.max(this.gain[index] - this.steepness, 0)
    }
    return this.gain[index]
  }

  // [0, this.cells.length) の範囲の値を返す余り演算。
  mod(n) {
    var m = this.cells.length
    return ((n % m) + m) % m
  }
}

class Oscillator {
  constructor(audioContext) {
    this.sampleRate = audioContext.sampleRate
    this.ratio = 1
    this.fmIndex = 3
    this._harmonics = 16
    this.harmoFunc
    this.eca = []
    this.fmStack = 1

    this.setHarmoFunc("hard")
  }

  set fmStack(value) {
    this.eca.length = 0
    for (var i = 0; i < value; ++i) {
      this.eca.push(new ElementaryCA(this.sampleRate, this._harmonics, 30, 0))
    }
  }

  set harmonics(value) {
    this._harmonics = value
    for (var i = 0; i < this.eca.length; ++i) {
      this.eca[i].size = value
    }
  }

  set harmoType(type) {
    this.setHarmoFunc(type)
  }

  set seed(value) {
    for (var i = 0; i < this.eca.length; ++i) {
      this.eca[i].seed = value + i * 65536
    }
  }

  set rule(value) {
    for (var i = 0; i < this.eca.length; ++i) {
      this.eca[i].rule = value
      // this.eca[i].rule = (value + i) % 256
    }
  }

  set smooth(value) {
    for (var i = 0; i < this.eca.length; ++i) {
      this.eca[i].smooth = value
    }
  }

  initialize() {
    for (var i = 0; i < this.eca.length; ++i) {
      this.eca[i].initialize()
    }
  }

  setHarmoFunc(type) {
    switch (type) {
      case "soft":
        this.harmoFunc = (phase, index) => {
          var sum = 0
          for (var i = 0; i < this._harmonics; ++i) {
            var gain = Math.pow(0.75, i) * this.eca[index].gainAt(i)
            sum += gain * Math.sin(phase * i)
          }
          return sum * 0.4
        }
        break
      case "hard":
      default:
        this.harmoFunc = (phase, index) => {
          var sum = 0
          for (var i = 0; i < this._harmonics; ++i) {
            sum += this.eca[index].gainAt(i) * Math.sin(phase * i)
          }
          return sum / this._harmonics
        }
        break
    }
  }

  oscillate(phase) {
    var fm = 0
    for (var i = this.eca.length - 1; i > 0; --i) {
      var fixedPhase = phase * this.ratio * i
      fm = this.harmoFunc(fixedPhase + this.fmIndex * fm, i)
    }
    return this.harmoFunc(phase + this.fmIndex * fm, i)
  }

  next() {
    for (var i = 0; i < this.eca.length; ++i) {
      this.eca[i].next()
    }
  }
}

class CAView extends Canvas {
  constructor(parent, width, height) {
    super(parent, width, height)
    this.x = 20
    this.y = 16
    this.layer = 1
    this.rule = 30
    this.seed = 0

    this.palette = [
      "rgba(0, 255, 255, 0.25)",
      "rgba(255, 0, 255, 0.25)",
      "rgba(255, 255, 0, 0.25)",
      "rgba(127, 255, 128, 0.25)"
    ]
  }

  setAt(index, step, state) {
    this.ca[index][step] = state
  }

  refresh() {
    this.clearWhite()
    this.context.save()
    this.context.translate(0, this.height)
    this.context.scale(this.width / this.x, -this.height / this.y)
    for (var i = 0; i < this.layer; ++i) {
      var eca = new ElementaryCA(1, this.y, this.rule, this.seed + i * 65536)
      this.context.fillStyle = this.palette[i]
      for (var x = 0; x < this.x; ++x) {
        for (var y = 0; y < this.y; ++y) {
          if (eca.cells[y]) {
            this.context.fillRect(x, y, 1, 1)
          }
        }
        eca.next()
      }
    }
    this.context.restore()
  }
}

const LOWEST_FREQUENCY = 440 * Math.pow(2, -69 / 12)
function pitchToFrequency(pitch) {
  return LOWEST_FREQUENCY * Math.pow(2, pitch / 12)
}

function random(level) {
  rule.random()
  seed.random()
  if (level >= 1) {
    duration.random()
    maxStep.value = Math.floor(1000 / duration.value)
    pitch.value = Math.floor(Math.random() * 81 + 1)
    harmonics.value = Math.floor(Math.random() * 28 + 4)
    ratio.random()
  }
  if (level >= 2) {
    fmIndex.random()
    fmStack.random()
  }

  refresh()
  play(audioContext, wave)
}

function refresh() {
  caView.x = maxStep.value
  caView.y = harmonics.value
  caView.layer = fmStack.value
  caView.rule = rule.value
  caView.seed = seed.value
  caView.refresh()

  oscillator.ratio = ratio.value
  oscillator.fmIndex = fmIndex.value
  oscillator.fmStack = fmStack.value
  oscillator.harmonics = harmonics.value
  oscillator.harmoType = harmoType.value
  oscillator.smooth = smooth.value
  oscillator.rule = rule.value
  oscillator.seed = seed.value

  var length = duration.value * maxStep.value / 1000
  wave.left = makeWave(length, audioContext.sampleRate)

  wave.declick(declickLength, declickLength)
  if (checkboxNormalize.value) {
    wave.normalize()
  }

  waveView.set(wave.left)
}

var audioContext = new AudioContext()
const declickLength = Math.floor(0.005 * audioContext.sampleRate)

var quickSave = false
var wave = new Wave(1)

var divMain = new Div(document.body, "main")
var headingTitle = new Heading(divMain.element, 1, "ECAFM")

var description = new Description(divMain.element)
description.add("ざっくりと使う", "まずはRandom0を押してみてください。")
description.add("", "何度か試したら、Harmonicsの値を変えて変化をみてみましょう。")
description.add("", "次にFM Stackの値を2にしてRandom1を押してみてください。")
description.add("", "音がとげとげしいと感じたらHarmoTypeをsoftに変えるといいかもしれません。")
description.add("", "なんとなく雰囲気がつかめたらRandom2を押していろいろな音を探すことができます。")
description.add("", "気に入った音があればMaxStepを増やすことで音を長くできます。")
description.add("", "また、Saveを押すと32bitのwavファイルとして音を保存することができます。")
description.add("仕組み", "ECAFMはElementary Cellular Automaton (ECA)を利用した加算合成 + FMシンセサイザーです。")
description.add("", "Pitchの値から基音の高さを決めて、Harmonicsの値に応じて倍音を加算します。")
description.add("", "Pitchの高さはMIDIノートナンバーに対応していて、Pitch = 69のとき440Hzとなります。")
description.add("", "さらにFM Stackの値だけ繰り返し変調を行います。時間tにおける加算合成部の出力をfn(t)とすると")
description.add("", "(時間tでの出力) = f0(t + i * f1(t + i * f2( ... )))")
description.add("", "ここでiはFM Indexの値です。また、変調波の基音の高さは以下の式で求まります。")
description.add("", "(変調波の基音の高さ) = Pitch * Ratio * (FM Stackの深さ)")
description.add("", "例えばPitch = 10, Ratio = 2, FM Stack = 4の場合、基音の高さは10, 20, 40, 80となります。")
description.add("細かい機能", "QuickSaveにチェックを入れると音が再生されるたびにファイルとして保存されます。")
description.add("", "保存されるファイルの形式は32bitのwavファイルで、サンプリング周波数は環境依存です。")
description.add("", "Smoothの値を変えると音の切り替わりの滑らかさを変更できます。")
description.add("", "Normalizeにチェックを入れると最大振幅を一定の値に揃えます。")

var divWaveform = new Div(divMain.element, "waveform")
var headingWaveform = new Heading(divWaveform.element, 6, "Waveform")
var waveView = new WaveView(divWaveform.element, 512, 128, wave.left, false)

var divCAView = new Div(divMain.element, "caView")
var headingCAView = new Heading(divCAView.element, 6, "Elementary Cellular Automaton")
var caView = new CAView(divCAView.element, 512, 128)
var oscillator = new Oscillator(audioContext)

var divRenderControls = new Div(divMain.element, "renderControls")
var buttonPlay = new Button(divRenderControls.element, "Play",
  () => play(audioContext, wave))
var buttonSave = new Button(divRenderControls.element, "Save",
  () => save(wave))
var buttonRandom1 = new Button(divRenderControls.element, "Random0",
  () => random(0))
var buttonRandom1 = new Button(divRenderControls.element, "Random1",
  () => random(1))
var buttonRandom1 = new Button(divRenderControls.element, "Random2",
  () => random(2))
var checkboxQuickSave = new Checkbox(divRenderControls.element, "QuickSave",
  quickSave, (checked) => { quickSave = checked })

var divControls = new Div(divMain.element, "synthControls")
var duration = new NumberInput(divControls.element, "Duration(msec)",
  50, 10, 50, 1, refresh)
var maxStep = new NumberInput(divControls.element, "MaxStep",
  20, 4, 512, 1, refresh)
var pitch = new NumberInput(divControls.element, "Pitch",
  40, 0, 127, 1, refresh)
var ratio = new NumberInput(divControls.element, "Ratio",
  1, 1, 12, 1, refresh)
var fmIndex = new NumberInput(divControls.element, "FM Index",
  0.2, 0, 1, 0.01, refresh)
var fmStack = new NumberInput(divControls.element, "FM Stack",
  1, 1, 4, 1, refresh)
var harmonics = new NumberInput(divControls.element, "Harmonics",
  16, 4, 128, 1, refresh)
var harmoType = new RadioButton(divControls.element, "HarmoType", refresh)
harmoType.add("hard")
harmoType.add("soft")
var smooth = new NumberInput(divControls.element, "Smooth(msec)",
  2, 0, 100, 1, refresh)
var rule = new NumberInput(divControls.element, "Rule",
  30, 0, 255, 1, refresh)
var seed = new NumberInput(divControls.element, "Seed",
  0, 0, 65535, 1, refresh)
var checkboxNormalize = new Checkbox(divControls.element, "Normalize",
  false, refresh)

refresh()
