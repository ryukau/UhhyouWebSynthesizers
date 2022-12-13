//
// oscillate(n) は n の範囲が [0, 1) で1周期分の波形を生成する。
//

class Impulse {
  // band limited impulse.
  // length はサンプル数。
  constructor(length) {
    this.length = length
  }

  set length(value) {
    this.P = Math.floor(value)
    this.piPerP = Math.PI / this.P
    var M = (value % 2 === 0) ? value - 1 : value
    this.mPiPerP = M * this.piPerP
  }

  // oscillate(0) === 1
  oscillate(n) {
    var A = Math.sin(this.piPerP * n)
    if (A === 0) { return 1 }
    var B = Math.sin(this.mPiPerP * n) / (A * this.P)
    return Math.max(-1, Math.min(B, 1))
  }
}

class AdditiveSin {
  constructor(
    sampleRate,
    rnd,
    frequency,
    detune,
    overtones,
    randomizePhase = true
  ) {
    this.sampleRate = sampleRate
    this.frequency = frequency

    this.omega_per_f = 2 * Math.PI / sampleRate

    this.frequencies = []
    for (var i = 0; i < overtones.length; ++i) {
      if (overtones[i] <= 0) continue

      // convert overtones[i] to decibel. [0, 1] map to [-20, 0].
      var salt = 1 - detune + 2 * detune * rnd.random()
      this.frequencies.push({
        phase: randomizePhase ? rnd.random() : 0,
        deltaPhase: this.omega_per_f * frequency * (i + 1) * salt,
        gain: Math.pow(10, -(1 - overtones[i]) * 20 / 20),
      })
    }
  }

  setFrequency(frequency) {
    this.frequency = frequency
    for (var i = 0; i < this.frequencies.length; ++i) {
      this.frequencies[i].deltaPhase = this.omega_per_f * frequency * (i + 1)
    }
  }

  oscillate(modulation = 0) {
    var sig = 0
    for (var freq of this.frequencies) {
      sig += freq.gain * Math.sin(freq.phase)
      freq.phase += freq.deltaPhase + modulation
    }
    return sig
  }
}

class PADSynth {
  // PadSynth from ZynAddSubFX
  // http://zynaddsubfx.sourceforge.net/doc/PADsynth/PADsynth.htm
  constructor(sampleRate, rnd, frequency, overtones, bandWidth, cycle = 64) {
    var frequencies = []
    for (var i = 0; i < overtones.length; ++i) {
      if (overtones[i] <= 0) continue

      // convert overtones[i] to decibel. [0, 1] map to [-40, 0].
      frequencies.push({
        freq: cycle * (i + 1),
        gain: Math.pow(10, -(1 - overtones[i]) * 40 / 20),
      })
    }

    this.buffer = this.render(sampleRate, frequencies, bandWidth, rnd)

    this.cycle = cycle
    this.sampleRate = sampleRate
    this.frequency = frequency
    this.phase = 0
  }

  oscillate() {
    this.phase += this.frequency / this.cycle
    return this.buffer[Math.floor(this.phase % this.buffer.length)]
  }

  linterp(a, b, ratio) {
    return ratio * (a - b) + b
  }

  profile(fi, bwi) {
    var x = fi / bwi
    return Math.exp(-x * x) / bwi
  }

  normalize(sound) {
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

  // frequencies = [{freq: f, gain: g}, {freq: f, gain: g}, ...]
  render(sampleRate, frequencies, bandWidth, rnd) {
    var TWO_PI = 2 * Math.PI
    var size = Math.pow(2, 18)
    var fft = new FFT(size)
    var table = fft.createComplexArray()
    for (let elem of frequencies) {
      var bandWidthHz = (Math.pow(2, bandWidth / 1200) - 1) * elem.freq
      var bandWidthI = bandWidthHz / (2 * sampleRate)
      bandWidthI = bandWidthI < 1e-5 ? 1e-5 : bandWidthI

      var sigma = Math.sqrt(Math.pow(bandWidthI, 2) / TWO_PI)
      var profileSizeHalf = Math.max(Math.floor(5 * size * sigma), 1)

      var freqI = elem.freq / sampleRate

      var center = Math.floor(freqI * size)
      var start = Math.max(center - profileSizeHalf, 0)
      var end = Math.min(center + profileSizeHalf, size)

      for (var i = start; i < end; ++i) {
        table[i * 2] += elem.gain * this.profile(i / size - freqI, bandWidthI)
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
    return this.normalize(sound)
  }
}
