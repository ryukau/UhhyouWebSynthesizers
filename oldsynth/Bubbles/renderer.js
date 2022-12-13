importScripts(
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

// start is index of sound array.
function renderBubble(sampleRate, rnd, sound, start, params) {
  var rand = rnd.random()
  var radius = params.radius * (1 + params.radiusRange * (1 - rand * rand))
  var decay = (0.13 + 0.0072 / Math.sqrt(radius)) / radius

  var c0 = 6 * Math.PI / radius
  var amp = rnd.random() ** params.beta
  var xi_d = params.xi * (1 - params.xiRange * rnd.random() ** 1.5) * decay
  var attack = params.attack * (1 + 3 * rnd.random())

  var dec = Math.exp(-decay / sampleRate)
  var gain = 1

  for (var i = Math.floor(start); i < sound.length; ++i) {
    var t = (i - start) / sampleRate

    gain *= dec
    if (gain < 1e-5) break

    if (t < attack) {
      sound[i] += 0.5 * (1 - Math.cos(Math.PI * t / attack))
        * gain * amp * Math.sin(c0 * t * (1 + xi_d * t))
      continue
    }
    sound[i] += gain * amp * Math.sin(c0 * t * (1 + xi_d * t))
  }
}

// Poisson process.
// https://preshing.com/20111007/how-to-generate-random-timings-for-a-poisson-process/
function next(rnd, rate) {
  return -Math.log(1 - rnd.random()) / rate
}

onmessage = (event) => {
  var params = event.data
  var sampleRate = params.sampleRate
  var rnd = new MersenneTwister(params.seed + params.channel)

  var sound = new Array(Math.floor(sampleRate * params.length)).fill(0)

  var bubbleRate = params.bubbleRate / sampleRate // bubbles per second.

  var start = 0
  while (start < sound.length) {
    renderBubble(sampleRate, rnd, sound, start, params)
    start += next(rnd, bubbleRate)
  }

  postMessage(sound)
}
