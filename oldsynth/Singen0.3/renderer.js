importScripts(
  "lib/bezier-easing.js",
  "lib/fft.js",
  "lib/mersenne-twister.js",
  "./envelope.js",
  "./filter.js",
  "./osc.js",
)

function createEnvelope(params) {
  var env = new Envelope(params.x1, params.y1, params.x2, params.y2)
  var factor = (params.amount >= 0
    ? params.max - params.bias
    : params.bias - params.min
  ) * params.amount
  return { env, factor, bias: params.bias }
}

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

function downSample(sound, sampleRate, overSampling) {
  filterPass(sound, 1, 20 / sampleRate, 255, "lowpass")

  var reduced = new Array(Math.floor(sound.length / overSampling)).fill(0)
  for (var i = 0; i < reduced.length; ++i) {
    reduced[i] = sound[i * overSampling]
  }
  return reduced
}

function selectClip(type) {
  switch (type) {
    case "HardClip":
      return (sig) => Math.max(-1, Math.min(sig, 1))
    case "tanh":
      return (sig) => Math.tanh(sig)
    case "Logistic":
      return (sig) => 1 / (1 + Math.exp(sig))
    case "HalfRect":
      return (sig) => sig > 0 ? sig : 0
    case "2^(-abs(sig))":
      return (sig) => Math.pow(6, (-Math.abs(sig)))
  }
  return (sig) => sig
}

onmessage = (event) => {
  var params = event.data
  var sampleRate = params.sampleRate * params.overSampling
  var rnd = new MersenneTwister(params.seed)

  var sound = new Array(Math.floor(sampleRate * params.length)).fill(0)

  // PADsynth
  var envPadGain = new Envelope(
    params.envPadGain.x1, params.envPadGain.y1,
    params.envPadGain.x2, params.envPadGain.y2)

  var padCutoff = createEnvelope(params.envPadCutoff)
  var padQ = createEnvelope(params.envPadQ)

  var padsynth = new PADSynth(
    sampleRate,
    rnd,
    params.ratioPad * params.frequency,
    params.overtonePad,
    params.bandWidth)
  var padLP = new SVFStack(sampleRate, 1000, 0.5, 4)

  for (var i = 0; i < sound.length; ++i) {
    var envTime = i / sound.length

    padLP.cutoff = padCutoff.factor * padCutoff.env.decay(envTime) + padCutoff.bias
    padLP.q = padQ.factor * padQ.env.decay(envTime) + padQ.bias

    sound[i] = padLP.lowpass(envPadGain.decay(envTime) * padsynth.oscillate())
  }

  sound = normalize(sound)

  // Modulator
  var clip = selectClip(params.clipType)

  var delta = 2 * Math.PI * params.ratioMod * params.frequency / sampleRate
  var phase = 0
  for (var i = 0; i < sound.length; ++i) {
    var sigMod = clip(params.clipGain * Math.sin(phase))
    phase += delta

    sound[i] = params.modPadMix * (sound[i] - sigMod) + sigMod
  }

  // Carrier
  var envCarGain = new Envelope(
    params.envCarGain.x1, params.envCarGain.y1,
    params.envCarGain.x2, params.envCarGain.y2)
  var envCarGainExp = new ExpDecay(sound.length, 10 ** params.gainCarTension)

  var biquad = new BiQuadStack(
    params.carFilterStack, sampleRate, "lowpass", 1000, 0.5, 0)
  var envBiquadCutoff = new ExpDecay(sound.length, 10 ** params.carCutoffTension)
  var envBiquadQ = new ExpDecay(sound.length, 10 ** params.carQTension)

  var carrier = new AdditiveSin(
    sampleRate, rnd, params.frequency, params.detuneCar, params.overtoneCar)

  var modIndex = params.modIndex / params.overSampling
  var carCutoffAmount = params.carCutoffAmount * (20000 - params.carCutoffBias)
  var carQAmount = params.carQAmount * (1 - params.carQBias)
  for (var i = 0; i < sound.length; ++i) {
    sound[i]
      = envCarGain.decay(i / sound.length)
      * carrier.oscillate(modIndex * sound[i])

    biquad.cutoff = envBiquadCutoff.env() * carCutoffAmount + params.carCutoffBias
    biquad.q = envBiquadQ.env() * carQAmount + params.carQBias
    sound[i] = envCarGainExp.env() * biquad.process(sound[i])

    if (!Number.isFinite(sound[i])) sound[i] = 0
  }

  if (params.overSampling !== 1) {
    sound = downSample(sound, sampleRate, params.overSampling)
  }

  postMessage(sound)
}
