importScripts(
  'resampler.js',
  'rnd.js',
  'delay.js'
)

// params = {
//   length,
//   sampleRate,
//   stack,
//   density,
//   lpOrder,
//   lpStart,
//   lpEnd,
//   hpOrder,
//   hpStart,
//   hpEnd,
//   seed,
// }

class ExpDecay {
  // https://en.wikipedia.org/wiki/Exponential_decay
  constructor(length) {
    this.gamma = Math.pow(1e-5, 1 / length)
    this.value = 1
  }

  process(input) {
    var output = input * this.value
    this.value *= this.gamma
    return output
  }
}

onmessage = (event) => {
  var params = event.data
  // console.log(params)

  var waveLength = Math.floor(params.sampleRate * params.length)
  var wave = new Array(waveLength).fill(0)

  var minLength = Math.floor(params.sampleRate * Math.pow(2, -10)) // ~= 1 ms
  var density = params.sampleRate * Math.pow(2, params.density)

  var stack = Math.pow(2, params.stack)
  var impulse = []
  for (var i = 0; i < stack; ++i) {
    impulse.push(new Impulse(density))
  }
  var rnd = new Rnd(params.seed)

  var lowpass = []
  for (var i = 0; i < params.lpOrder; ++i) {
    lowpass.push(new StateVariableFilter(params.sampleRate))
    lowpass[i].cutoff = params.lpStart
  }
  var highpass = []
  for (var i = 0; i < params.hpOrder; ++i) {
    highpass.push(new StateVariableFilter(params.sampleRate))
    highpass[i].cutoff = params.hpStart
  }
  var lpDiff = params.lpStart - params.lpEnd
  var hpDiff = params.hpStart - params.hpEnd

  var gamma = Math.pow(1e-5, 1 / waveLength)
  var decay = 1
  for (var t = 0; t < wave.length; ++t) {
    var pulseLength = minLength + density * decay
    for (var i = 0; i < impulse.length; ++i) {
      impulse[i].length = 1 + rnd.random() * pulseLength
      wave[t] += impulse[i].oscillate(t)
    }
    wave[t] *= decay

    for (var i = 0; i < lowpass.length; ++i) {
      lowpass[i].cutoff = params.lpEnd + lpDiff * decay
      wave[t] = lowpass[i].process(wave[t]).lowpass
    }
    for (var i = 0; i < highpass.length; ++i) {
      highpass[i].cutoff = params.hpEnd + hpDiff * decay
      wave[t] = highpass[i].process(wave[t]).highpass
    }

    decay *= gamma
  }
  wave[0] = 0

  postMessage(wave)
}
