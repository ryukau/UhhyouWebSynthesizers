importScripts(
  "lib/bezier-easing.js",
  "lib/fft.js",
  "lib/mersenne-twister.js",
  "envelope.js",
  "resampler.js",
)

function profile(fi, bwi) {
  var x = fi / bwi
  return Math.exp(-x * x) / bwi
}

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

// PadSynth from ZynAddSubFX
// http://zynaddsubfx.sourceforge.net/doc/PADsynth/PADsynth.htm
//
// frequencies = [{freq: f, gain: g}, {freq: f, gain: g}, ...]
//
function padsynth(sampleRate, frequencies, bandWidth, rnd, overSampling) {
  var TWO_PI = 2 * Math.PI
  var size = Math.pow(2, 18 + Math.log2(overSampling))
  var fft = new FFT(size)
  var table = fft.createComplexArray()
  for (let elem of frequencies) {
    var bandWidthHz = (Math.pow(2, bandWidth / 1200) - 1) * elem.freq
    var bandWidthI = bandWidthHz / (2 * sampleRate)

    var sigma = Math.sqrt(Math.pow(bandWidthI, 2) / TWO_PI)
    var profileSizeHalf = Math.max(Math.floor(6 * size * sigma), 1)

    var freqI = elem.freq / sampleRate

    var center = Math.floor(freqI * size)
    var start = Math.max(center - profileSizeHalf, 0)
    var end = Math.min(center + profileSizeHalf, size)

    for (var i = start; i < end; ++i) {
      table[i * 2] += elem.gain * profile(i / size - freqI, bandWidthI)
    }
  }

  // Remove direct current.
  table[0] = 0
  table[1] = 0

  // Randomize phase.
  for (var i = 0; i < table.length; i += 2) {
    var theta = rnd.random() * TWO_PI
    var sin = Math.sin(theta)
    var cos = Math.cos(theta)
    var real = table[i]
    table[i] = real * cos
    table[i + 1] = real * sin
  }

  var soundComplex = fft.createComplexArray()
  fft.inverseTransform(soundComplex, table)

  var sound = new Array(size)
  for (var i = 0; i < sound.length; ++i) {
    sound[i] = soundComplex[i * 2]
  }
  return normalize(sound)
}

onmessage = (event) => {
  var params = event.data
  var sampleRate = params.sampleRate * params.overSampling
  var rnd = new MersenneTwister(params.seed)

  var frequencies = []
  for (var i = 0; i < params.overtone.length; ++i) {
    if (params.overtone[i] <= 0)
      continue

    // convert params.overtone[i] to decibel. [0, 1] map to [-60, 0].
    frequencies.push({
      freq: params.baseFreq * (i + 1),
      gain: Math.pow(10, -(1 - params.overtone[i]) * 40 / 20),
    })
  }

  console.log(frequencies)

  var sound = padsynth(
    sampleRate, frequencies, params.bandWidth, rnd, params.overSampling)

  // down sampling.
  if (params.overSampling > 1) {
    sound = Resampler.pass(sound, sampleRate, params.sampleRate)
  }

  postMessage(sound)
}
