importScripts(
  "lib/bezier-easing.js",
  "lib/mersenne-twister.js",
  "delay.js",
  "envelope.js",
  "filter.js",
  "resampler.js",
  "windowfunction.js",
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

function renderTestSignal(sampleRate, params, wave) {
  var omegaPerFs = 2 * Math.PI * params.seed / sampleRate
  var decay = new ExpDecay(wave.length, 1e-5)
  for (var i = 0; i < wave.length; ++i) {
    wave[i] = Math.sin(i * omegaPerFs)
    wave[i] = decay.process(wave[i])
  }
  return wave
}

function renderFeedbackDelayNetwork(
  sampleRate,
  wave,
  rnd,
  size,
  cascade,
  diagPower,
  nonDiagPower,
  fdnReferenceDelayTime,
  fdnFeedback,
  fdnCascadeMix,
  fdnFilterSeed,
  fdnMaxFilterGain,
  fdnMaxFilterQ
) {
  var feedbackDelayNetworks = []
  var filterRnd = new MersenneTwister(fdnFilterSeed)
  for (var n = 0; n < cascade; ++n) {
    var fdn = createEmptyFeedbackDelayNetwork(
      sampleRate,
      filterRnd,
      size,
      1,
      fdnMaxFilterGain,
      fdnMaxFilterQ
    )

    var delayTimeMod = ((n + 1) * 2 / cascade) ** 0.8
    var diagMod = (n + 1) / cascade
    for (var i = 0; i < size; ++i) {
      for (var j = 0; j < size; ++j) {
        if (i === j) {
          fdn.matrix[i][j] = (
            1 - diagMod - 0.5 * (rnd.random() - diagMod)
          ) ** diagPower
        }
        else {
          fdn.matrix[i][j] = -((0.5 * rnd.random()) ** nonDiagPower)
        }
      }
      fdn.gain[i] = (rnd.random() < 0.5 ? 1 : -1)
        * (0.1 + rnd.random()) / size
      fdn.delay[i].time = rnd.random() * fdnReferenceDelayTime * delayTimeMod
    }
    feedbackDelayNetworks.push(fdn)
  }

  var sig = 0
  for (var i = 0; i < wave.length; ++i) {
    sig = feedbackDelayNetworks[0].process(
      wave[i] + fdnFeedback * Math.tanh(sig))
    for (var j = 1; j < feedbackDelayNetworks.length; ++j) {
      sig = sig + fdnCascadeMix
        * (feedbackDelayNetworks[j].process(sig * 2) - sig)
    }
    wave[i] = sig
  }

  return wave
}

onmessage = (event) => {
  var params = event.data

  var sampleRate = params.sampleRate * params.overSampling
  var waveLength = Math.floor(sampleRate * params.length)
  var wave = new Array(waveLength).fill(0)
  var rnd = new MersenneTwister(params.seed)


  // Excitation.
  wave[0] = 1
  wave[1] = -1

  // Feedback delay network section.
  var waveFdn1 = renderFeedbackDelayNetwork(
    sampleRate,
    wave.slice(0),
    rnd,
    16,
    8,
    params.diagPower,
    params.nonDiagPower,
    params.fdnReferenceDelayTime,
    params.fdnFeedback,
    params.fdnCascadeMix,
    params.fdnFilterSeed,
    params.fdnMaxFilterGain,
    params.fdnMaxFilterQ
  )

  var attackReferenceTime = params.fdnReferenceDelayTime * params.fdnAttackTimeRatio
  var waveFdn2 = renderFeedbackDelayNetwork(
    sampleRate,
    wave.slice(0),
    rnd,
    16,
    8,
    params.diagPower * 0.98,
    params.nonDiagPower,
    attackReferenceTime,
    params.fdnFeedback,
    params.fdnCascadeMix,
    params.fdnFilterSeed + 1,
    params.fdnMaxFilterGain,
    Math.tanh(params.fdnMaxFilterQ * 4)
  )

  var waveFdn3 = renderFeedbackDelayNetwork(
    sampleRate,
    wave.slice(0),
    rnd,
    16,
    4,
    params.diagPower * 4,
    params.nonDiagPower / 4,
    attackReferenceTime * params.fdnTickTimeRatio,
    params.fdnFeedback,
    params.fdnCascadeMix,
    params.fdnFilterSeed + 2,
    params.fdnMaxFilterGain,
    params.fdnMaxFilterQ
  )

  var tickMix = params.fdnTickMix * params.fdnAttackMix
  for (var i = 0; i < wave.length; ++i) {
    wave[i] = waveFdn1[i]
      + params.fdnAttackMix * waveFdn2[i]
      + tickMix * waveFdn3[i]
  }

  // Allpass section.
  if (params.allpassMix !== 0) {
    var allpassParams = []
    var minTime = 0.001 * rnd.random()
    for (var i = 0; i < 8; ++i) {
      allpassParams.push({
        time: minTime + 0.001 * rnd.random(),
        gain: -rnd.random()
      })
    }
    var allpass = new SerialAllpass(sampleRate, allpassParams)
    var allpassHighPass = new Biquad(
      sampleRate, "highpass", params.allpassHighpassFrequency, 0.01, 0)
    var allpassLowShelf = new Biquad(sampleRate, "lowshelf", 1200, 0.01, -6)

    var allpassFeedback = 0
    var allpassSig = 0
    for (var i = 0; i < wave.length; ++i) {
      allpassFeedback = allpass.process(
        wave[i] + params.allpassFeedback * allpassFeedback)
      allpassSig = allpassHighPass.process(allpassFeedback)
      allpassSig = allpassLowShelf.process(allpassSig)

      wave[i] += params.allpassMix * (allpassSig - wave[i])
    }
  }

  wave = normalize(wave)

  // Post processing.
  var highshelf = new Biquad(
    sampleRate,
    "highshelf",
    params.postHighShelfFrequency,
    params.postHighShelfQ,
    params.postHighShelfGain
  )
  for (var i = 0; i < wave.length; ++i) {
    wave[i] = Math.tanh(4 * wave[i])
    wave[i] = highshelf.process(wave[i])
  }

  // down sampling.
  if (params.overSampling > 1) {
    wave = Resampler.pass(wave, sampleRate, params.sampleRate)
  }

  postMessage(wave)
}
