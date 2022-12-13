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

    // this.buf = new Array(Math.floor(sampleRate / 8)).fill(0)
    this.buf = new Array(
      Math.max(4, Math.min(Math.ceil(time * sampleRate), sampleRate)) + 1
    ).fill(0)

    this.wptr = 0
    this.time = time
  }

  set time(value) {
    var rptr = this.mod(this.wptr - this.sampleRate * value, this.buf.length)
    this.fraction = rptr % 1
    this.rptr = Math.floor(rptr)
  }

  mod(n, m) {
    while (n < 0)
      n += m
    return n % m
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

class FeedbackDelayNetwork {
  constructor(sampleRate, time, gain, matrix, filter) {
    if (matrix.length !== matrix[0].length) {
      this.printError("Matrix must be square.")
    }
    else if (matrix.length !== time.length) {
      this.printError("Size of time and matrix must be same.")
    }

    this.delay = []
    for (var i = 0; i < time.length; ++i) {
      this.delay.push(new Delay(sampleRate, time[i]))
    }

    this.gain = gain
    this.matrix = matrix
    this.filter = filter

    this.buffer = new Array(this.delay.length).fill(0)
    this.delayOutput = new Array(this.delay.length).fill(0)
  }

  printError(message) {
    console.log(message)
    console.trace()
  }

  process(input) {
    for (var i = 0; i < this.matrix.length; ++i) {
      this.buffer[i] = 0
      for (var j = 0; j < this.matrix[i].length; ++j) {
        this.buffer[i] += this.matrix[i][j] * this.delayOutput[j]
      }
      this.buffer[i] = this.filter[i].process(this.buffer[i])
    }

    var output = 0
    for (var i = 0; i < this.delay.length; ++i) {
      this.delayOutput[i] = this.delay[i].process(
        this.gain[i] * (this.buffer[i] + input))
      output += this.delayOutput[i]
    }

    return output
  }
}

function createEmptyFeedbackDelayNetwork(
  sampleRate,
  rnd,
  size,
  maxTime = 1,
  maxFilterGain = 20,
  maxFilterQ = 0.01
) {
  var time = new Array(size).fill(maxTime)
  var gain = new Array(size).fill(1 / size)
  var matrix = new Array(size)
  for (var i = 0; i < matrix.length; ++i) {
    matrix[i] = new Array(size).fill(0)
  }
  var filter = []
  for (var i = 0; i < time.length; ++i) {
    filter.push(new Biquad(
      sampleRate,
      "highshelf",
      (sampleRate / 2) ** rnd.random(),
      1e-10 + maxFilterQ * rnd.random(),
      maxFilterGain * rnd.random()
    ))
  }
  return new FeedbackDelayNetwork(sampleRate, time, gain, matrix, filter)
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
