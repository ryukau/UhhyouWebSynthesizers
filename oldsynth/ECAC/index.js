const TWO_PI = 2 * Math.PI
const SYNTH_NAME = "ECA Chord"
const INITIAL_HARMONICS = 16
const MAX_HARMONICS = 32
const INITIAL_HARMONICS_INTERVAL = 1
const INITIAL_HARMONICS_GAIN = 0.93
const INITIAL_PITCH = -29
const INITIAL_DURATION = 170
const NUM_CHORD = 4

class Clock {
  constructor(timeoutFunc, delay) {
    this.timeoutFunc = timeoutFunc
    this.timeoutID = null
    this.delay = delay
    this.isRunning = false
  }

  start() {
    this.isRunning = true
    this.run()
  }

  run() {
    if (this.isRunning) {
      this.timeoutFunc()
      this.timeoutID = window.setTimeout(() => this.run(), this.delay)
    }
  }

  stop() {
    this.isRunning = false
    window.clearTimeout(this.timeoutID)
  }
}

class Tone {
  constructor(parent, audioContext) {
    this.parent = parent
    this.context = audioContext
    this.oscillators
    this.harmonicGains
    this.controlGains
    this.masterGain
    this._harmoInterval = INITIAL_HARMONICS_INTERVAL
    this._harmoGain = INITIAL_HARMONICS_GAIN

    this.reset()
  }

  initialize(maxHarmonics) {
    this.oscillators = []
    this.harmonicGains = []
    this.controlGains = []
    this.masterGain = this.context.createGain()
    this.masterGain.gain.value = 1
    if (this.parent !== null) {
      this.masterGain.connect(this.parent)
    }

    for (var i = 0; i < maxHarmonics; ++i) {
      this.oscillators.push(this.context.createOscillator())
      this.oscillators[i].frequency.value = 440 * (1 + this._harmoInterval * i)

      this.harmonicGains.push(this.context.createGain())
      this.harmonicGains[i].gain.value = 1

      this.controlGains.push(this.context.createGain())
      this.controlGains[i].gain.value = 0

      this.oscillators[i].connect(this.harmonicGains[i])
      this.harmonicGains[i].connect(this.controlGains[i])
      this.controlGains[i].connect(this.masterGain)
    }
    this.harmoGain = this._harmoGain
  }

  set pitch(value) {
    for (var i = 0; i < this.oscillators.length; ++i) {
      this.oscillators[i].detune.value = value * 100
    }
  }

  set volume(value) {
    this.masterGain.gain.value = value
  }

  set harmoInterval(value) {
    this._harmoInterval = value
    for (var i = 0; i < this.oscillators.length; ++i) {
      this.oscillators[i].frequency.value = 440 * (1 + value * i)
    }
  }

  set harmoGain(value) {
    if (value === 0) {
      return
    }
    this._harmoGain = value

    var sum = 0
    var gain = []
    for (var i = 0; i < this.harmonicGains.length; ++i) {
      var gain = Math.pow(this._harmoGain, i)
      this.harmonicGains[i].gain.value = gain
      sum += gain
    }
    sum += 1e-5 // 最大音量が1を超えないように調整。
    for (var i = 0; i < this.harmonicGains.length; ++i) {
      this.harmonicGains[i].gain.value /= sum
    }
  }

  set muteHarmonics(mute) {
    var endTime = this.context.currentTime + smooth.value
    for (var i = 0; i < mute.length; ++i) {
      var value = mute[i] ? 1 : 0
      this.controlGains[i].gain.linearRampToValueAtTime(value, endTime)
    }
    for (; i < MAX_HARMONICS; ++i) {
      this.controlGains[i].gain.linearRampToValueAtTime(0, endTime)
    }
  }

  start() {
    this.oscillators.forEach((element) => element.start(0))
  }

  stop() {
    var endTime = this.context.currentTime + Math.max(smooth.value, 0.01)
    for (var i = 0; i < MAX_HARMONICS; ++i) {
      this.controlGains[i].gain.linearRampToValueAtTime(0, endTime)
    }
    this.oscillators.forEach((element) => element.stop(endTime + 0.001))
    this.reset()
  }

  reset() {
    this.initialize(MAX_HARMONICS)
  }
}

class ToneStack {
  constructor(parent, audioContext) {
    this.parent = parent
    this.context = audioContext
    this.masterGain = null
    this.length = NUM_CHORD
    this.uniform = true
    this.tones
    this.automata

    this.initialize()
  }

  initialize() {
    this.masterGain = this.context.createGain()
    this.masterGain.gain.value = 1 / this.length
    this.masterGain.connect(this.parent)

    this.tones = []
    this.automata = []
    for (var i = 0; i < this.length; ++i) {
      this.tones.push(new Tone(this.masterGain, this.context))

      var offset = this.uniform ? 0 : 65536
      this.automata.push(new ElementaryCA(INITIAL_HARMONICS, 30, offset * i))
    }
  }

  set volume(value) {
    this.masterGain.gain.value = value / this.length
  }

  set harmoInterval(value) {
    this.tones.forEach((element) => element.harmoInterval = value)
  }

  set harmoGain(value) {
    this.tones.forEach((element) => element.harmoGain = value)
  }

  set size(value) {
    this.automata.forEach((element) => element.size = value)
  }

  set rule(value) {
    this.automata.forEach((element) => element.rule = value)
  }

  set seed(value) {
    var offset = this.uniform ? 0 : 65536
    this.automata.forEach((element, i) => element.seed = value + offset * i)
  }

  setVolume(value, index) {
    this.tones[index].volume = value
  }

  getVolume(index) {
    return this.tones[index].masterGain.gain.value
  }

  setPitch(value, index) {
    this.tones[index].pitch = value
  }

  next() {
    var cells = []
    for (var i = 0; i < this.tones.length; ++i) {
      cells.push(this.automata[i].next())
      this.tones[i].muteHarmonics = cells[i]
    }
    return cells
  }

  start() {
    this.tones.forEach((element) => element.start())
  }

  stop() {
    this.tones.forEach((element) => element.stop())
  }

  reset() {
    this.automata.forEach((element) => element.initialize())
  }
}

class ElementaryCA {
  constructor(size, rule, seed) {
    this.rule = rule
    this.seed = seed

    this.cells = []
    this.bufferCells = []
    this.gain = [] // 倍音ごとの現在の音量。

    this.size = size
  }

  set size(value) {
    this.cells.length = value
    this.bufferCells.length = value
    this.gain.length = value
    this.initialize()
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
    return this.cells.slice(0)
  }

  // [0, this.cells.length) の範囲の値を返す余り演算。
  mod(n) {
    var m = this.cells.length
    return ((n % m) + m) % m
  }
}

class CAView extends Canvas {
  constructor(parent, width, height) {
    super(parent, width, height)
    this.x = width / 4
    this.y = INITIAL_HARMONICS
    this.rule = 30
    this.seed = 0
    this.ecaCells = new Array(this.x).fill(
      new Array(NUM_CHORD).fill(
        new Array(this.y).fill(false)
      )
    )

    // this.palette = [
    //   "rgba(0, 255, 255, 0.25)",
    //   "rgba(255, 0, 255, 0.25)",
    //   "rgba(255, 255, 0, 0.25)",
    //   "rgba(127, 255, 128, 0.25)"
    // ]
  }

  setAt(index, step, state) {
    this.ca[index][step] = state
  }

  pushCells(cells) {
    this.ecaCells.shift()
    this.ecaCells.push(cells)
    this.refresh()
  }

  refresh() {
    this.clearWhite()
    this.context.save()
    this.context.translate(0, this.height)
    this.context.scale(this.width / this.x, -this.height / this.y)

    for (var i = 0; i < this.ecaCells[0].length; ++i) {
      this.context.fillStyle = this.palette(i)
      for (var x = 0; x < this.ecaCells.length; ++x) {
        for (var y = 0; y < this.ecaCells[x][i].length; ++y) {
          if (this.ecaCells[x][i][y]) {
            this.context.fillRect(x, y, 1, 1)
          }
        }
      }
    }
    this.context.restore()
  }

  palette(index) {
    var volume = Math.min(Math.max(0, toneStack.getVolume(index)), 1)
    var alpha = 0.25 * volume
    var fade = Math.floor(255 * (1 - volume))
    switch (index) {
      case 0:
        return this.rgba(fade, 255, 255, alpha)
      case 1:
        return this.rgba(255, fade, 255, alpha)
      case 2:
        return this.rgba(255, 255, fade, alpha)
      case 3:
        var fade2 = 128 + Math.floor(fade / 2)
        return this.rgba(fade2, fade2, fade2, alpha)
      default:
        break
    }
    return this.rgba(255, 255, 255, 0.25)
  }

  rgba(r, g, b, a) {
    return `rgba(${r},${g},${b},${a})`
  }
}

function play() {
  refresh()
  toneStack.start()

  clock.start()
}

function stop() {
  clock.stop()
  toneStack.stop()
}

function reset() {
  toneStack.reset()
}

function random(type) {
  var random0 = () => {
    rule.random()
    seed.random()
  }
  var random1 = () => {
    duration.random()
    harmonics.random()
  }
  var random2 = () => {
    pitch00.random()
    pitch01.random()
    pitch1.random()
    pitch2.random()
    volume01.random()
    volume1.random()
    volume2.random()
    harmoGain.random()
  }

  switch (type) {
    case 1:
      random1()
    case 0:
      random0()
      break
    case 2:
      random2()
      break
    case 3:
      random0()
      random1()
      random2()
      harmoInterval.random()
      break
    default:
      break
  }

  refresh()
}

function setPitch() {
  toneStack.setPitch(pitch00.value, 0)
  toneStack.setPitch(pitch00.value + pitch01.value, 3)
  toneStack.setPitch(pitch1.value, 1)
  toneStack.setPitch(pitch2.value, 2)

  toneStack.setVolume(volume01.value, 3)
  toneStack.setVolume(volume1.value, 1)
  toneStack.setVolume(volume2.value, 2)
}

function refresh() {
  setPitch()
  caView.y = harmonics.value
  caView.rule = rule.value
  caView.seed = seed.value
  caView.refresh()
}

var audioContext = new AudioContext()
var toneStack = new ToneStack(audioContext.destination, audioContext)
var clock = new Clock(() => caView.pushCells(toneStack.next()), INITIAL_DURATION)

var divMain = new Div(document.body, "main")
var headingTitle = new Heading(divMain.element, 1, SYNTH_NAME)

var divCAView = new Div(divMain.element, "caView")
var headingCAView = new Heading(divCAView.element, 6, "Elementary Cellular Automaton")
var caView = new CAView(divCAView.element, 512, 128)

var divRenderControls = new Div(divMain.element, "renderControls")
var buttonPlay = new Button(divRenderControls.element, "Play",
  () => play())
var buttonStop = new Button(divRenderControls.element, "Stop",
  () => stop())
var buttonReset = new Button(divRenderControls.element, "Reset",
  () => reset())

var divRandomControls = new Div(divMain.element, "randomControls")
var buttonRandom1 = new Button(divRandomControls.element, "Random0",
  () => random(0))
var buttonRandom1 = new Button(divRandomControls.element, "Random1",
  () => random(1))
var buttonRandom1 = new Button(divRandomControls.element, "Random2",
  () => random(2))
var buttonRandom1 = new Button(divRandomControls.element, "Random3",
  () => random(3))

var divControls = new Div(divMain.element, "synthControls")
var volume = new NumberInput(divControls.element, "Volume",
  1, 0, 2, 0.01, () => toneStack.volume = volume.value)
var smooth = new NumberInput(divControls.element, "Smooth",
  0.002, 0, 1, 0.001, () => { })
var duration = new NumberInput(divControls.element, "Duration",
  INITIAL_DURATION, 10, 400, 1, () => clock.delay = duration.value)
var pitch00 = new NumberInput(divControls.element, "Pitch0",
  INITIAL_PITCH, -60, 60, 1, () => {
    toneStack.setPitch(pitch00.value, 0)
    toneStack.setPitch(pitch00.value + pitch01.value, 3)
  })
var volume01 = new NumberInput(divControls.element, "Volume0+",
  0.3, 0, 2, 0.01, () => toneStack.setVolume(volume01.value, 3))
var pitch01 = new NumberInput(divControls.element, "Pitch0+",
  12, -60, 60, 1, () => {
    toneStack.setPitch(pitch00.value + pitch01.value, 3)
  })
var volume1 = new NumberInput(divControls.element, "Volume1",
  1, 0, 2, 0.01, () => toneStack.setVolume(volume1.value, 1))
var pitch1 = new NumberInput(divControls.element, "Pitch1",
  INITIAL_PITCH + 7, -60, 60, 1, () => {
    toneStack.setPitch(pitch1.value, 1)
  })
var volume2 = new NumberInput(divControls.element, "Volume2",
  1, 0, 2, 0.01, () => toneStack.setVolume(volume2.value, 2))
var pitch2 = new NumberInput(divControls.element, "Pitch2",
  INITIAL_PITCH + 10, -60, 60, 1, () => {
    toneStack.setPitch(pitch2.value, 2)
  })
var harmonics = new NumberInput(divControls.element, "Harmonics",
  INITIAL_HARMONICS, 4, MAX_HARMONICS, 1, () => {
    toneStack.size = harmonics.value
    caView.y = harmonics.value
  })
var harmoInterval = new NumberInput(divControls.element, "HarmoInterval",
  1, 0.01, 2, 0.01, () => toneStack.harmoInterval = harmoInterval.value)
var harmoGain = new NumberInput(divControls.element, "HarmoGain",
  INITIAL_HARMONICS_GAIN, 0.01, 1.1, 0.01, () => toneStack.harmoGain = harmoGain.value)
var rule = new NumberInput(divControls.element, "Rule",
  30, 0, 255, 1, () => toneStack.rule = rule.value)
var seed = new NumberInput(divControls.element, "Seed",
  0, 0, 65535, 1, () => {
    toneStack.seed = seed.value
    reset()
  })
var uniform = new Checkbox(divControls.element, "Uniform",
  true, () => {
    toneStack.uniform = uniform.value
    toneStack.seed = seed.value
    reset()
  })

refresh()
