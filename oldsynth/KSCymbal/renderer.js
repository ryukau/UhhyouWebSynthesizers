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

class SimpleHat {
  constructor(
    sampleRate,
    rnd,
    minFrequency,
    maxFrequency,
    filterBias,
    distance,
    stack
  ) {
    var diffFrequency = maxFrequency - minFrequency
    this.string = []
    for (var i = 0; i < stack; ++i) {
      this.string.push(new KSString(
        sampleRate,
        minFrequency + diffFrequency * (1.0 - rnd.random()),
        filterBias
      ))
    }

    this.output = new Array(this.string.length).fill(0)

    this.distance = distance
  }

  mod(n, m) {
    return ((n % m) + m) % m
  }

  process(input) {
    var output = 0
    for (var i = 0; i < this.string.length; ++i) {
      var distance = (i < 1) ? this.distance : this.distance - this.output[i - 1]
      var leftover = (input <= distance) ? 0 : input - distance
      input -= leftover
      this.output[i] = this.string[i].process(input)
      output += this.output[i]
    }
    return output
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

// params = {
//   length,
//   sampleRate,
//   overSampling,
//   minFrequency,
//   maxFrequency,
//   distance,
//   seed,
//   stack,
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

  // Render excitation.
  var preFilter = []
  for (var i = 0; i < 8; ++i) {
    preFilter.push(new Comb(
      sampleRate,
      params.pickCombTime * 0.002 * rnd.random(),
      -1,
      params.pickCombFB
    ))
  }
  var attackLength = Math.floor(0.001 * sampleRate)
  for (var i = 0; i < attackLength; ++i) {
    wave[i] = rnd.random() - 0.5
  }
  for (var i = 0; i < wave.length; ++i) {
    var sig = wave[i]
    for (f of preFilter) {
      sig = f.process(sig)
    }
    if (i < attackLength) {
      sig *= (1 - Math.cos(i * Math.PI / attackLength)) / 2
    }
    wave[i] = sig
  }
  wave[0] = 0

  // Render string.
  var string = new SimpleHat(
    sampleRate,
    rnd,
    params.minFrequency,
    params.maxFrequency,
    0.5,
    params.distance,
    params.stack
  )
  var waveLastIndex = wave.length - 1
  for (var i = 0; i < wave.length; ++i) {
    wave[i] += string.process(wave[i])
  }

  // down sampling.
  if (params.overSampling > 1) {
    wave = Resampler.pass(wave, sampleRate, params.sampleRate)
  }

  postMessage(wave)
}
