importScripts(
  'resampler.js',
  'rnd.js',
  'delay.js'
)

// params = {
//   length,
//   sampleRate,
//   overSampling,
//   damp,
//   roomsize,
//   combLength,
//   combDelayMin,
//   combDelayRange,
//   allpassLength,
//   allpassGain,
//   allpassDelayMin,
//   allpassDelayRange,
//   allpassMixStepe,
//   erRatio,
//   erTaps,
//   erRange,
//   feedback,
//   highpassCutoff,
//   seed
// }

onmessage = (event) => {
  var params = event.data
  // console.log(params)

  var sampleRate = params.sampleRate * params.overSampling
  var waveLength = Math.floor(sampleRate * params.length)
  var wave = new Array(waveLength).fill(0)

  var freeverb = new Freeverb(
    sampleRate,
    params.damp,
    params.roomsize,
    params.combLength,
    params.combDelayMin,
    params.combDelayRange,
    params.allpassLength,
    params.allpassGain,
    params.allpassDelayMin,
    params.allpassDelayRange,
    params.allpassMixStepe,
    params.feedback,
    params.highpassCutoff
  )
  var earlyReflection = new EarlyReflection(
    sampleRate,
    params.erTaps,
    params.erRange
  )
  var rnd = new Rnd(params.seed)

  // impulse -> early reflection -> freeverb。
  wave[0] = 1

  earlyReflection.random(rnd)
  var erLength = (sampleRate < wave.length) ? sampleRate : wave.length
  for (var t = 0; t < erLength; ++t) {
    wave[t] = earlyReflection.process(wave[t])
  }

  freeverb.random(rnd)
  for (var t = 0; t < wave.length; ++t) {
    var reverb = freeverb.process(wave[t])
    wave[t] = reverb + params.erRatio * (wave[t] - reverb)
  }

  // down sampling.
  if (params.overSampling > 1) {
    wave = Resampler.pass(wave, sampleRate, params.sampleRate)
  }

  postMessage(wave)
}
