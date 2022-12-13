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

class Delay {
  constructor(sampleRate, time) {
    this.sampleRate = sampleRate
    this.buf = new Array(Math.floor(sampleRate / 8)).fill(0)
    this.wptr = 0
    this.time = time
  }

  set time(value) {
    var rptr = this.mod(this.wptr - this.sampleRate * value, this.buf.length)
    this.fraction = rptr % 1
    this.rptr = Math.floor(rptr)
  }

  mod(n, m) {
    return ((n % m) + m) % m
  }

  clearBuffer() {
    this.buf.fill(0)
  }

  process(input) {
    this.buf[this.wptr] = input
    this.wptr = (this.wptr + 1) % this.buf.length

    var rptr = this.rptr
    this.rptr = (this.rptr + 1) % this.buf.length
    return this.buf[rptr]
      + this.fraction * (this.buf[this.rptr] - this.buf[rptr])
  }
}

class DelayS {
  // Windowed sinc interpolated delay.
  constructor(sampleRate, time) {
    this.halfWinLength = 16
    this.sampleRate = sampleRate
    this.buf = new Array(sampleRate * 5).fill(0)
    this.wptr = 0
    this.time = time
  }

  set time(value) {
    var rptr = this.mod(
      this.wptr - this.sampleRate * value - this.halfWinLength,
      this.buf.length
    )
    this.fraction = rptr % 1
    this.rptr = Math.floor(rptr)
    this.makeWindow()
  }

  makeWindow(fraction) {
    // HannWindow * sinc.
    this.win = new Array(this.halfWinLength * 2).fill(0)
    var length = this.win.length - 1
    for (var i = 0; i < this.win.length; ++i) {
      this.win[i] = Math.sin(Math.PI * i / length)
      this.win[i] *= this.win[i]
      this.win[i] *= this.sinc(this.fraction + i - this.halfWinLength)
    }
    return this.win
  }

  sinc(x) {
    var a = Math.PI * x
    return (a === 0) ? 1 : Math.sin(a) / a
  }

  mod(n, m) {
    return ((n % m) + m) % m
  }

  clearBuffer() {
    this.buf.fill(0)
  }

  process(input) {
    this.buf[this.wptr] = input
    this.wptr = (this.wptr + 1) % this.buf.length

    var rptr = this.rptr
    var output = 0
    for (var i = 0; i < this.win.length; ++i) {
      output += this.buf[rptr] * this.win[i]
      rptr = (rptr + 1) % this.buf.length
    }
    this.rptr = (this.rptr + 1) % this.buf.length
    return output
  }
}

class Allpass {
  constructor(sampleRate, time, gain) {
    this.gain = gain
    this.delay = new Delay(sampleRate, time)
    this.buf = 0
  }

  set time(value) {
    this.delay.time = value
  }

  clearBuffer() {
    this.delay.clearBuffer()
    this.buf = 0
  }

  process(input) {
    input += this.gain * this.buf
    var output = this.buf - this.gain * input
    this.buf = this.delay.process(input)
    return output
  }
}

class Comb {
  constructor(sampleRate, time, gain, feedback) {
    this.delay = new Delay(sampleRate, time)
    this.gain = gain
    this.feedback = feedback
    this.buf = 0
  }

  set time(value) {
    this.delay.time = value
  }

  clearBuffer() {
    this.delay.clearBuffer()
    this.buf = 0
  }

  process(input) {
    // feedback.
    input -= this.feedback * this.buf
    this.buf = this.delay.process(input)
    return this.gain * input
  }

  processFF(input) {
    // feed forward.
    return this.gain * (input + this.feedback * this.delay.process(input))
  }
}

class OnePoleHighpass {
  constructor(sampleRate, freq) {
    this.sampleRate = sampleRate
    this.cutoff = freq
    this.z1 = 0
  }

  set cutoff(freq) {
    this.b1 = -Math.exp(-2.0 * Math.PI * freq / this.sampleRate)
    this.a0 = 1.0 - this.b1
  }

  process(input) {
    this.z1 = input * this.a0 + this.z1 * this.b1
    return this.z1
  }
}

class StateVariableFilter {
  // http://www.earlevel.com/main/2003/03/02/the-digital-state-variable-filter/
  constructor(sampleRate) {
    this.sampleRate = sampleRate
    this.buffer = new Array(2).fill(0)

    this.fc
    this.cutoff = this.sampleRate / 2

    this._q
    this.q = 0.5
  }

  // cutoff の範囲は [0, 1]
  set cutoff(value) {
    value *= 0.5
    var cutoff = value * value * value
    this.fc = 2 * Math.sin(Math.PI * cutoff)
    // this.fc = 2 * Math.sin(Math.PI * this._cutoff / this.sampleRate)
  }

  // 返ってくる q の範囲は [0.5, infinity]
  get q() {
    return 1 / this._q
  }

  // q の範囲は [0, 1]
  set q(value) {
    this._q = 2 - value * 2
  }

  process(input) {
    var A = input - this.buffer[0] * this._q - this.buffer[1]
    var B = A * this.fc + this.buffer[0]
    var C = B * this.fc + this.buffer[1]

    this.buffer[0] = B
    this.buffer[1] = C

    return { lowpass: C, highpass: A, bandpass: B, bandreject: A + C }
  }

  refresh() {
    this.buffer.fill(0)
  }
}

class LPComb {
  // https://ccrma.stanford.edu/~jos/pasp/Lowpass_Feedback_Comb_Filter.html
  // damp = 0.2
  // roomsize = 0.84
  constructor(sampleRate, time, damp, roomsize) {
    this.delay = new Delay(sampleRate, time)
    this.damp = damp
    this.roomsize = roomsize
    this.x = 0
    this.buf = 0
  }

  set time(value) {
    this.delay.time = value
  }

  clearBuffer() {
    this.delay.clearBuffer()
    this.x = 0
    this.buf = 0
  }

  process(input) {
    var gain = this.roomsize * (1 - this.damp) / (1 - this.damp * this.x)
    this.x = input

    input -= gain * this.buf
    this.buf = this.delay.process(input)
    return input
  }
}

class SerialAllpass {
  // params = [{time: t, gain: g}, ...]
  constructor(sampleRate, params) {
    this.allpass = []
    for (var i = 0; i < params.length; ++i) {
      this.allpass.push(new Allpass(
        sampleRate, params[i].time, params[i].gain))
    }
  }

  set params(params) {
    for (var i = 0; i < this.allpass.length; ++i) {
      this.allpass[i].time = params[i].time
      this.allpass[i].gain = params[i].gain
    }
  }

  randomTime(min, max, rnd) {
    var range = max - min
    for (var i = 0; i < this.allpass.length; ++i) {
      this.allpass[i].time = rnd.random() * range + min
    }
  }

  clearBuffer() {
    this.allpass.forEach((v) => v.clearBuffer())
  }

  process(input) {
    for (var i = 0; i < this.allpass.length; ++i) {
      input = this.allpass[i].process(input)
    }
    return input
  }

  processMix(input, step) {
    var mix = 0
    for (var i = 0; i < this.allpass.length; ++i) {
      input = this.allpass[i].process(input)
      if (i % step === 1) {
        mix += input
      }
    }
    return input + mix / 12
  }
}

class Freeverb {
  constructor(
    sampleRate,
    damp,
    roomsize,
    combLength,
    combDelayMin,
    combDelayRange,
    apLength,
    apGain,
    apDelayMin,
    apDelayRange,
    apStep,
    feedback,
    hpCutoff
  ) {
    this.lpcomb = []
    this.damp = damp
    this.roomsize = roomsize
    this.combDelayMin = combDelayMin
    this.combDelayRange = combDelayRange
    this.apDelayMin = apDelayMin
    this.apDelayRange = apDelayRange
    this.apStep = apStep
    this.feedback = feedback

    this.highpass = []
    for (var i = 0; i < 3; ++i) {
      this.highpass.push(new StateVariableFilter(sampleRate))
      this.highpass[i].cutoff = hpCutoff
    }
    this.buf = 0 // for feedback.

    for (var i = 0; i < combLength; ++i) {
      this.lpcomb.push(new LPComb(
        sampleRate,
        Math.random() * this.apDelayRange + this.apDelayMin,
        this.damp,
        this.roomsize
      ))
    }

    var params = []
    for (var i = 0; i < apLength; ++i) {
      params.push({
        time: Math.random(),
        gain: apGain //0.1 + Math.random() * apGain
      })
    }
    this.allpass = new SerialAllpass(sampleRate, params)
  }

  random(rnd) {
    for (var i = 0; i < this.lpcomb.length; ++i) {
      this.lpcomb[i].time = rnd.random() * this.combDelayMin
        + this.combDelayRange
    }
    this.allpass.randomTime(this.apDelayRange, this.apDelayMin, rnd)
  }

  clearBuffer() {
    this.buf = 0
    this.lpcomb.forEach((v) => v.clearBuffer())
    this.allpass.clearBuffer()
  }

  process(input) {
    var output = 0
    input += this.buf * this.feedback
    for (var i = 0; i < this.lpcomb.length; ++i) {
      output += this.lpcomb[i].process(input)
    }
    if (this.apStep < 2) {
      output = this.allpass.process(output)
    }
    output = this.allpass.processMix(output, this.apStep)
    this.buf = output
    if (this.feedback <= 0) {
      return this.buf
    }
    for (var i = 0; i < this.highpass.length; ++i) {
      this.buf = this.highpass[i].process(this.buf).highpass
    }
    return this.buf + output
  }
}

class EarlyReflection {
  constructor(sampleRate, taps, range) {
    this.delay = []
    this.range = range

    var denom = taps * 2
    for (var i = 0; i < taps; ++i) {
      this.delay.push(new Allpass(
        sampleRate,
        0.0001 + Math.random() * this.range,
        (i + 1) / denom
      ))
    }
  }

  random(rnd) {
    for (var i = 0; i < this.delay.length; ++i) {
      this.delay[i].time = 0.001 + rnd.random() * this.range
    }
  }

  clearBuffer() {
    this.delay.forEach((v) => v.clearBuffer())
  }

  process(input) {
    var mix = input
    for (var i = 0; i < this.delay.length; ++i) {
      input = this.delay[i].process(input)
      mix += input
    }
    return mix
  }
}

class ParallelComb {
  // params = [{time: t, gain: g, feedback: f}, ...]
  constructor(sampleRate, params) {
    this.comb = []
    for (var i = 0; i < params.length; ++i) {
      this.comb.push(new Comb(
        sampleRate,
        params[i].time,
        params[i].gain,
        params[i].feedback
      ))
    }
  }

  set params(params) {
    for (var i = 0; i < this.comb.length; ++i) {
      this.comb[i].time = params[i].time
      this.comb[i].gain = params[i].gain
      this.comb[i].feedback = params[i].feedback
    }
  }

  process(input) {
    var output = 0
    for (var i = 0; i < this.comb.length; ++i) {
      output += this.comb[i].process(input)
    }
    return output
  }
}

class SchroederReverberator {
  constructor(sampleRate, paramsAllpass, paramsComb) {
    this.allpass = new SerialAllpass(sampleRate, paramsAllpass)
    this.comb = new ParallelComb(sampleRate, paramsComb)
  }

  random() {

  }

  process(input) {
    return this.comb.process(this.allpass.process(input))
  }
}
