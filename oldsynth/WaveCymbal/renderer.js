importScripts(
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

// Karplus-Strong string synthesis.
class KSString {
  constructor(sampleRate, frequency, filterBias, decay) {
    this.delay = new Delay(sampleRate, 1.0 / frequency)
    this.lowpass = new OneZeroLP(filterBias)
    this.highpass = new RCHP(0.5)
    this.feedback = 0

    this.attenuation = frequency < 1e-17 ? 1 : Math.pow(0.5, decay / frequency)
  }

  process(input) {
    var output = this.delay.process(input + this.feedback)
    this.feedback = this.lowpass.process(output) * this.attenuation
    return this.highpass.process(output)
  }
}

class BandedKSString {
  constructor(sampleRate, frequency) {
    this.string = []
    this.bandpass = []
    this.feedback = 0

    var low = 0
    var high = 0
    for (var i = 0; i < frequency.length; ++i) {
      this.string.push(new KSString(sampleRate, frequency[i], 0.5, 0))

      high = this.getCrossoverFrequency(20, 20000, i + 1, frequency.length)
      this.bandpass.push(new Biquad(
        sampleRate,
        "bandpass",
        (low + high) / 2,
        0.02,
        0.0
      ))
      low = high
    }
  }

  getCrossoverFrequency(low, high, index, length) {
    return Math.exp(Math.log(high / low) * index / length + Math.log(low))
  }

  process(input) {
    input += this.feedback
    var output = 0
    for (var i = 0; i < this.bandpass.length; ++i) {
      output += this.string[i].process(this.bandpass[i].process(input))
    }
    this.feedback = output / (this.bandpass.length * this.bandpass.length)
    return this.feedback
  }
}

// 1d wave equation.
// http://www.mtnmath.com/whatrh/node66.html
// https://wiki.seg.org/wiki/Solving_the_wave_equation_in_1D
class Wave1D {
  constructor(sampleRate, length, position, width, attenuation) {
    this.wave = []
    for (let i = 0; i < 3; ++i) {
      this.wave.push(new Array(length).fill(0))
    }

    var ratio = 44100 / sampleRate

    this.attenuation = Math.pow(attenuation, ratio)
    this.position = position // [0, 1)
    this.pulseWidth = width // [0, 1]

    this.alpha = 0.5 * ratio * ratio
    this.beta = 2 - 2 * this.alpha
    // this.damping = 0.003 * (44100 / sampleRate)
    // this.b1 = this.beta - this.damping
    // this.b2 = this.damping - 1
    // this.c1 = this.beta + this.damping
    // this.c2 = this.attenuation / (1 + this.attenuation * this.damping)
  }

  set position(value) {
    this._position = Math.floor(value * this.wave[0].length)
  }

  set pulseWidth(value) {
    var pw = Math.floor(value * this.wave[0].length)
    this._pulseWidth = pw < 4 ? 4 : pw
  }

  mod(n, m) {
    while (n < 0)
      n += m
    return n
  }

  step() {
    this.swapWave()

    var end = this.wave[0].length - 1

    this.wave[0][0] = this.attenuation * (
      this.alpha * (this.wave[1][end] + this.wave[1][1])
      + this.beta * this.wave[1][0]
      - this.wave[2][0]
    )

    for (var i = 1; i < end; ++i) {
      this.wave[0][i] = this.attenuation * (
        this.alpha * (this.wave[1][i - 1] + this.wave[1][i + 1])
        + this.beta * this.wave[1][i]
        - this.wave[2][i]
      )
    }

    this.wave[0][end] = this.attenuation * (
      this.alpha * (this.wave[1][end - 1] + this.wave[1][0])
      + this.beta * this.wave[1][end]
      - this.wave[2][end]
    )
  }

  swapWave() {
    var temp = this.wave[2]
    this.wave[2] = this.wave[1]
    this.wave[1] = this.wave[0]
    this.wave[0] = temp
  }

  pulse(height) {
    // Hanning window.
    var left = Math.floor(this._position - this._pulseWidth / 2)
    var twoPi_N1 = 2 * Math.PI / (this._pulseWidth - 1)
    height /= this._pulseWidth / 2
    for (let i = 0; i < this._pulseWidth; ++i) {
      this.wave[0][(left + i) % this.wave[0].length] +=
        height * (1 - Math.cos(twoPi_N1 * i))
    }

    // Sine window.
    // var left = Math.floor(this._position - this._pulseWidth / 2)
    // var pi_N1 = Math.PI / (this._pulseWidth - 1)
    // height /= this._pulseWidth / 2
    // for (let i = 0; i < this._pulseWidth; ++i) {
    //   this.wave[0][(left + i) % this.wave[0].length] +=
    //     height * Math.sin(pi_N1 * i)
    // }
  }

  process(input) {
    if (input !== 0) {
      this.pulse(input)
    }
    this.step()
    return this.wave[0]
  }
}

class WaveString {
  constructor(
    sampleRate,
    rnd,
    frequency,
    pulsePosition,
    pulseWidth,
    attenuation,
    decay,
    bandSplit,
    bandpassQ
  ) {
    this.string = []
    this.bandpass = []
    this.wave1d = new Wave1D(
      sampleRate,
      frequency.length,
      pulsePosition,
      pulseWidth,
      attenuation
    )
    this.feedback = 0

    var low = 0
    var high = 0
    for (var i = 0; i < frequency.length; ++i) {
      this.string.push(new KSString(sampleRate, frequency[i], 0.5, decay))

      high = this.getCrossoverFrequency(
        20, 20000, i + 1, frequency.length, bandSplit)
      this.bandpass.push(new Biquad(
        sampleRate,
        "bandpass",
        // (low + high) / 2,
        low + (high - low) * rnd.random(),
        bandpassQ,
        0.0
      ))
      low = high
    }
  }

  getCrossoverFrequency(low, high, index, length, type) {
    switch (type) {
      case "Linear":
        return low + (high - low) * index / length
    }
    // case "Log" and default.
    return Math.exp(Math.log(high / low) * index / length + Math.log(low))
  }

  process(input) {
    // input += this.feedback
    var wave = this.wave1d.process(input)
    var output = 0
    var denom = this.bandpass.length * 1024
    for (var i = 0; i < this.bandpass.length; ++i) {
      var rendered = this.string[i].process(
        // wave[i]
        this.bandpass[i].process(wave[i])
      )
      wave[i] += rendered / denom
      // wave[i] /= 2
      output += rendered
    }
    this.feedback = output / denom
    return output
  }
}

class WaveHat {
  constructor(
    sampleRate,
    rnd,
    cymbalCount,
    stack,
    distance,
    minFrequency,
    maxFrequency,
    pulsePosition,
    pulseWidth,
    attenuation,
    decay,
    bandSplit,
    bandpassQ
  ) {
    this.distance = distance

    this.string = []
    for (var cym = 0; cym < cymbalCount; ++cym) {
      var frequency = []
      for (var i = 0; i < stack; ++i) {
        frequency.push(rnd.random() * maxFrequency + minFrequency)
      }
      this.string.push(new WaveString(
        sampleRate,
        rnd,
        frequency,
        pulsePosition,
        pulseWidth,
        attenuation,
        decay,
        bandSplit,
        bandpassQ
      ))
    }
  }

  collide(w1, w2) {
    for (var i = 0; i < w1.length; ++i) {
      var intersection = w1[i] - w2[i] + this.distance / 1024
      if (intersection < 0) {
        w1[i] = -w1[i]
        // w2[i] += intersection
        // w2[i] = -w2[i]
      }
    }
  }

  process(input) {
    var output = 0
    for (var i = 0; i < this.string.length; ++i) {
      output += this.string[i].process(input)
    }

    var end = this.string.length - 1
    for (var i = 0; i < end; ++i) {
      this.collide(
        this.string[i].wave1d.wave[0],
        this.string[i + 1].wave1d.wave[0]
      )
    }

    return output
  }
}

class Excitation {
  constructor(sampleRate, rnd, params, index = 0) {
    this.gain = 1 / 1.002 ** index
    this.filter = []
    for (var i = 0; i < 8; ++i) {
      this.filter.push(new Comb(
        sampleRate,
        params.pickCombTime * 0.002 * rnd.random(),
        // params.pickCombTime * 0.002 * rnd.random() * 2 * (index + 1) / 16,
        -1,
        params.pickCombFB ** this.gain
      ))
    }
  }

  process(input) {
    for (let f of this.filter) {
      input = f.process(input)
    }
    return this.gain * input
  }
}

onmessage = (event) => {
  var params = event.data

  var sampleRate = params.sampleRate //* params.overSampling
  var waveLength = Math.floor(sampleRate * params.length)
  var wave = new Array(waveLength).fill(0)
  var rnd = new MersenneTwister(params.seed)

  // Render excitation.
  var attackLength = Math.floor(0.001 * sampleRate)
  for (var i = 0; i < attackLength; ++i) {
    wave[i] = rnd.random() - 0.5
  }
  var excitation = []
  for (var i = 0; i < 1; ++i) {
    excitation.push(new Excitation(sampleRate, rnd, params, i))
  }
  var excitationLength = sampleRate < wave.length ? sampleRate : wave.length
  var decay = new CosDecay(excitationLength)
  for (var i = 0; i < excitationLength; ++i) {
    var sig = 0
    for (var e of excitation) {
      sig += e.process(wave[i])
    }
    if (i < attackLength) {
      sig *= (1 - Math.cos(i * Math.PI / attackLength)) / 2
    }
    wave[i] = decay.process(sig)
  }
  wave[0] = 0

  // Render string.
  var frequency = []
  for (var i = 0; i < params.stack; ++i) {
    frequency.push(rnd.random() * params.maxFrequency + params.minFrequency)
  }
  var string = new WaveHat(
    sampleRate,
    rnd,
    params.cymbalCount,
    params.stack,
    params.distance,
    params.minFrequency,
    params.maxFrequency,
    params.pulsePosition,
    params.pulseWidth,
    params.attenuation,
    params.decay,
    params.bandSplit,
    params.bandpassQ
  )
  for (var i = 0; i < wave.length; ++i) {
    wave[i] = string.process(wave[i])
  }

  // var w1d = new Wave1D(
  //   sampleRate,
  //   params.stack,
  //   params.pulsePosition,
  //   params.pulseWidth,
  //   params.attenuation
  // )
  // for (var i = 0; i < wave.length; ++i) {
  //   var a = w1d.process(wave[i])
  //   var sig = 0
  //   for (var j = 0; j < a.length; ++j) {
  //     sig += a[j]
  //   }
  //   // wave[i] = sig
  //   wave[i] = w1d.process(wave[i])[0]
  // }

  // down sampling.
  if (params.overSampling > 1) {
    wave = Resampler.pass(wave, sampleRate, params.sampleRate)
  }

  postMessage(wave)
}

/*
TODO

WaveHat.collide() の解き方。

プルダウンメニューの CSS を調整。

Excitation の改善。
- PickCombFB の値が異なる複数の Excitation を並列にレンダリングして重ねる。
- PickCombFB の値が大きいほど Excitation の音量を小さくする。

高速化。

*/
