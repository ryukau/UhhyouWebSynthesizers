importScripts(
  "lib/bezier-easing.js",
  "lib/fft.js",
  "lib/mersenne-twister.js",
  "delay.js",
  "envelope.js",
  "resampler.js",
)

function normalize(wave) {
  var max = 0.0
  for (var t = 0; t < wave.length; ++t) {
    var value = Math.abs(wave[t])
    if (max < value) {
      max = value
    }
  }

  if (max === 0.0) {
    console.log("renderer.js normalize(): max === 0.")
    return wave
  }

  var amp = 1.0 / max
  for (var t = 0; t < wave.length; ++t) {
    wave[t] *= amp
  }

  return wave
}

// Karplus-Strong string synthesis.
class KSString {
  constructor(sampleRate, frequency, filterBias) {
    this.delay = new Delay(sampleRate, 1.0 / frequency)
    this.lowpass = new OneZeroLP(filterBias)
    this.highpass = new RCHP(0.5)
    this.feedback = 0
  }

  process(input) {
    var output = this.delay.process(input + this.feedback)
    this.feedback = this.lowpass.process(output)
    return this.highpass.process(output)
  }
}

class OneZeroLP {
  // One-Zero filter
  // https://ccrma.stanford.edu/~jos/filters/One_Zero.html
  //
  // b1 = [-1, 1]
  constructor(b1) {
    this.z1 = 0
    this.b1 = b1
  }

  process(input) {
    // var output = this.b1 * (this.z1 - input) + input
    var output = this.b1 * (input - this.z1) + this.z1
    this.z1 = input
    return output
  }
}

class AverageFilter {
  constructor(bufferSize) {
    this.buffer = new Array(bufferSize).fill(0)
    this.sum = 0.0
    this.denom = bufferSize + 1
  }

  process(input) {
    var output = (this.sum + input) / this.denom
    this.buffer.unshift(input)
    this.sum += input - this.buffer.pop()
    return output
  }
}

class RCHP {
  // https://en.wikipedia.org/wiki/High-pass_filter
  // alpha is smoothing factor.
  constructor(alpha) {
    this.alpha = alpha
    this.y = 0
    this.z1 = 0
  }

  process(input) {
    this.y = this.alpha * this.y + this.alpha * (input - this.z1)
    this.z1 = input
    return this.y
  }
}

function toFrequency(semitone) {
  return 440.0 * Math.pow(2.0, semitone / 12.0)
}

function render(params, tone, sampleRate, waveLength, rnd) {
  var wave = new Array(waveLength).fill(0)
  var frequency = toFrequency(params.transpose + params.chord[tone])

  // Render excitation.
  var preFilter = []
  for (var i = 0; i < 8; ++i) {
    preFilter.push(new Comb(
      sampleRate,
      params.pickCombTime / frequency * rnd.random(),
      -1,
      params.pickCombFB
    ))
  }
  var period = Math.floor(sampleRate / frequency) * params.pickTime
  var delay = Math.floor(
    tone * params.delayTime * (params.jitter * rnd.random() + 1) * sampleRate)
  var attackLength = period / 2
  var attackTime = delay + attackLength
  var endPick = delay + period
  endPick = (endPick < wave.length) ? endPick : wave.length
  for (var i = delay; i < endPick; ++i) {
    wave[i] = rnd.random() - 0.5
  }
  for (var i = delay; i < wave.length; ++i) {
    var sig = wave[i]
    if (i < attackTime) {
      sig *= (1 - Math.cos((i - delay) * Math.PI / attackLength)) / 2
    }
    for (f of preFilter) {
      sig = f.process(sig)
    }
    wave[i] = sig
  }

  // Render string.
  var string = []
  for (var i = 0; i < params.stack; ++i) {
    string.push(new KSString(
      sampleRate,
      frequency * Math.pow(params.stackDetune, i),
      0.5
    ))
  }

  var phase = new Array(string.length)
  for (var i = 0; i < phase.length; ++i) {
    phase[i] = (params.stackDetune < 1.1)
      ? Math.floor(period * rnd.random())
      : Math.floor(rnd.random()) // 乱数を消費。
  }
  var waveLastIndex = wave.length - 1
  for (var i = 0; i < wave.length; ++i) {
    var sig = 0
    for (var j = 0; j < string.length; ++j) {
      var index = Math.min(i + phase[j], waveLastIndex)
      sig += string[j].process(wave[index])
    }
    wave[i] += sig
  }

  if (params.cutoff < 1.0) {
    var lowpass = new SVFStack(sampleRate, 4)
    lowpass.cutoff = params.cutoff
      + params.cutoffVariation * (1.0 - params.cutoff) * rnd.random()
    lowpass.q = params.qVariation * rnd.random()
    for (var i = 0; i < wave.length; ++i) {
      wave[i] = lowpass.lowpass(wave[i])
    }
  }

  return wave
}

// params = {
//   length,
//   sampleRate,
//   overSampling,
//   transpose,
//   seed,
//   chord,
//   delayTime,
//   jitter,
//   stack,
//   stackDetune,
//   cutoff,
//   cutoffVariation,
//   qVariation,
//   pickTime,
//   pickCombFB,
//   pickCombTime,
// }

onmessage = (event) => {
  var params = event.data
  // console.log(params)

  var sampleRate = params.sampleRate * params.overSampling
  var waveLength = Math.floor(sampleRate * params.length)
  var wave = new Array(waveLength).fill(0)
  var rnd = new MersenneTwister(params.seed)

  for (var tone = 0; tone < params.chord.length; ++tone) {
    var waveTemp = render(params, tone, sampleRate, waveLength, rnd)
    for (var i = 0; i < wave.length; ++i) {
      wave[i] += waveTemp[i]
    }
  }

  // down sampling.
  if (params.overSampling > 1) {
    wave = Resampler.pass(wave, sampleRate, params.sampleRate)
  }

  postMessage(wave)
}
