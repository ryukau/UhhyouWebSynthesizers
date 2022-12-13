importScripts(
  "kaiser.js",
  "lib/mersenne-twister.js",
)

const TWO_PI = 2 * Math.PI

function normalize(sound) {
  var max = 0.0
  for (var t = 0; t < sound.length; ++t) {
    var value = Math.abs(sound[t])
    if (max < value) {
      max = value
    }
  }

  if (max === 0.0) {
    return sound
  }

  var amp = 1.0 / max
  for (var t = 0; t < sound.length; ++t) {
    sound[t] *= amp
  }

  return sound
}

class PolyExpEnvelope {
  // env(t) := t^a * exp(-b * t)
  constructor(sampleRate, attack, curve) {
    var a = attack * curve
    var b = curve

    this.attack = attack
    this.a = a
    this.peak = (a / b) ** a * Math.exp(-a)
    this.gamma = Math.exp(-b / sampleRate)
    this.tick = 1 / sampleRate

    this.reset()
  }

  isReleasing() {
    return this.t >= this.attack
  }

  reset() {
    this.t = 0
    this.value = 1
  }

  process() {
    var output = this.t ** this.a * this.value / this.peak
    this.t += this.tick
    this.value *= this.gamma
    return output
  }
}

function makeLowpassWindow(win, cutoff) {
  // cutoff is [0, 1].
  var half = (win.length % 2 === 0 ? win.length - 1 : win.length) / 2
  var omega_c = 2 * Math.PI * cutoff
  for (var i = 0; i < win.length; ++i) {
    var n = i - half
    win[i] *= (n === 0) ? 1 : Math.sin(omega_c * n) / (Math.PI * n)
  }
  return win
}

function downSampling(sound, overSampling) {
  var lowpass = kaiserWindow.slice()
  lowpass = makeLowpassWindow(lowpass, 0.5 / overSampling)

  var reduced = new Array(Math.floor(sound.length / overSampling)).fill(0)
  for (var i = 0; i < reduced.length; ++i) {
    var start = i * overSampling
    for (var j = 0; j < lowpass.length; ++j) {
      var index = start + j
      if (index >= sound.length) break
      reduced[i] += sound[index] * lowpass[j]
    }
  }
  return reduced
}

onmessage = (event) => {
  var params = event.data
  var sampleRate = params.sampleRate * params.overSampling
  var rnd = new MersenneTwister(params.seed + params.channel)

  var sound = new Array(Math.floor(sampleRate * params.length)).fill(0)

  var ampEnv = new Array(sound.length).fill(0)
  var pitchEnv = new Array(sound.length).fill(0)
  var interval = Math.floor(params.interval * sampleRate)
  var bounceStart = 0
  for (var n = 0; n < params.nBounce; ++n) {
    // Construct amplitude envelope.
    var aEnv = new PolyExpEnvelope(
      sampleRate, params.bendAttack, params.bendCurve / params.ampAttack)
    var aInit = params.bounceAmpInit * params.bounceAmp ** n
    for (var i = Math.floor(bounceStart); i < sound.length; ++i) {
      var amp = aEnv.process()
      if (aEnv.isReleasing() && amp < 1e-5) break
      ampEnv[i] += aInit * amp
    }

    // Construct pitch envelope.
    var pEnv = new PolyExpEnvelope(
      sampleRate, params.bendAttack, params.bendCurve)
    var pInit = params.bounceBendInit * params.bounceBend ** n
    for (var i = Math.floor(bounceStart); i < sound.length; ++i) {
      var pitch = pEnv.process()
      if (pEnv.isReleasing() && pitch < 1e-5) break
      pitchEnv[i] += pInit * pitch
    }

    bounceStart += interval * (1 + params.wander * (rnd.random() - 1))
  }

  // Initialize harmonics parameters.
  var harmonics = []
  for (var n = 0; n < params.nHarmonics; ++n) {
    harmonics.push({
      amp: params.harmonicsAmp ** n,
      bend: params.bendAmount * params.harmonicsBend ** n,
      f0: params.baseFrequency * (n + 1),
      phase: 0,
    })
  }

  // Render sound.
  var omega_per_freq = TWO_PI / sampleRate
  for (var i = 0; i < sound.length; ++i) {
    for (ha of harmonics) {
      ha.phase += omega_per_freq * (ha.f0 + ha.bend * pitchEnv[i])
      sound[i] += ha.amp * Math.sin(ha.phase)
    }
    sound[i] *= ampEnv[i]
  }

  if (params.overSampling > 1) {
    sound = downSampling(sound, params.overSampling)
  }

  postMessage(sound)
}
