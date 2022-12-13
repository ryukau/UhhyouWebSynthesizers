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

class OnePole {
  // http://www.earlevel.com/main/2012/12/15/a-one-pole-filter/
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
  constructor(sampleRate, cutoff, q) {
    this.sampleRate = sampleRate
    this.buffer = new Array(2).fill(0)

    this.cutoff = cutoff
    this._q = 0
    this.q = q
  }

  // value の範囲は [0, 1]。
  set cutoff(value) {
    value = value * 0.52
    value *= value * value
    this.fc = 2 * Math.sin(Math.PI * value)
  }

  // 返ってくる q の範囲は [0.5, infinity]。
  get q() {
    return 1 / this._q
  }

  // value の範囲は [0, 1]。
  set q(value) {
    value = Math.max(0, Math.min(value, 1))
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

class SVFStack {
  constructor(sampleRate, cutoff, q, stack = 4) {
    this.svf = []
    for (var i = 0; i < stack; ++i) {
      this.svf[i] = new StateVariableFilter(sampleRate, cutoff, q)
    }
    this.cutoff = cutoff
    this.q = q
  }

  set cutoff(value) {
    for (var svf of this.svf) {
      svf.cutoff = value
    }
  }

  set q(value) {
    for (var svf of this.svf) {
      svf.q = value
    }
  }

  lowpass(input) {
    for (var svf of this.svf) {
      input = svf.process(input).lowpass
    }
    return input
  }

  highpass(input) {
    for (var svf of this.svf) {
      input = svf.process(input).highpass
    }
    return input
  }

  bandpass(input) {
    for (var svf of this.svf) {
      input = svf.process(input).bandpass
    }
    return input
  }

  bandreject(input) {
    for (var svf of this.svf) {
      input = svf.process(input).bandreject
    }
    return input
  }
}

class Biquad {
  // http://www.musicdsp.org/files/Audio-EQ-Cookbook.txt
  constructor(sampleRate, type, cutoff, q, gain) {
    this.fs = sampleRate
    this._type = type
    this.f0 = cutoff
    this._gain = gain // dB.
    this._q = q

    this.clearBuffer()
    this.setCoefficient()
  }

  clearBuffer() {
    this.b0 = 0
    this.b1 = 0
    this.b2 = 0

    this.a0 = 0
    this.a1 = 0
    this.a2 = 0

    this.x1 = 0
    this.x2 = 0

    this.y1 = 0
    this.y2 = 0
  }

  set type(value) {
    this._type = value
    this.setCoefficient()
  }

  set cutoff(value) {
    this.f0 = value
    this.setCoefficient()
  }

  set gain(value) {
    this._gain = value
    this.setCoefficient()
  }

  set q(value) {
    this._q = value
    this.setCoefficient()
  }

  setCoefficient() {
    var A = Math.pow(10, this._gain / 40)
    var w0 = 2 * Math.PI * this.f0 / this.fs
    var cos_w0 = Math.cos(w0)
    var sin_w0 = Math.sin(w0)

    switch (this._type) {
      case "lowpass":
        var alpha = sin_w0 / (2 * this._q)
        this.b0 = (1 - cos_w0) / 2
        this.b1 = 1 - cos_w0
        this.b2 = (1 - cos_w0) / 2
        this.a0 = 1 + alpha
        this.a1 = -2 * cos_w0
        this.a2 = 1 - alpha
        break
      case "highpass":
        var alpha = sin_w0 / (2 * this._q)
        this.b0 = (1 + cos_w0) / 2
        this.b1 = -(1 + cos_w0)
        this.b2 = (1 + cos_w0) / 2
        this.a0 = 1 + alpha
        this.a1 = -2 * cos_w0
        this.a2 = 1 - alpha
        break
      case "bandpass":
        var alpha = sin_w0 * Math.sinh(Math.log(2) / 2 * this._q * w0 / sin_w0)
        this.b0 = alpha
        this.b1 = 0
        this.b2 = -alpha
        this.a0 = 1 + alpha
        this.a1 = -2 * cos_w0
        this.a2 = 1 - alpha
        break
      case "notch":
        var alpha = sin_w0 * Math.sinh(Math.log(2) / 2 * this._q * w0 / sin_w0)
        this.b0 = 1
        this.b1 = -2 * cos_w0
        this.b2 = 1
        this.a0 = 1 + alpha
        this.a1 = -2 * cos_w0
        this.a2 = 1 - alpha
        break
      case "peaking":
        var alpha = sin_w0 * Math.sinh(Math.log(2) / 2 * this._q * w0 / sin_w0)
        this.b0 = 1 + alpha * A
        this.b1 = -2 * cos_w0
        this.b2 = 1 - alpha * A
        this.a0 = 1 + alpha / A
        this.a1 = -2 * cos_w0
        this.a2 = 1 - alpha / A
        break
      case "allpass":
        var alpha = sin_w0 * Math.sinh(Math.log(2) / 2 * this._q * w0 / sin_w0)
        this.b0 = 1 - alpha
        this.b1 = -2 * cos_w0
        this.b2 = 1 + alpha
        this.a0 = 1 + alpha
        this.a1 = -2 * cos_w0
        this.a2 = 1 - alpha
        break
      case "lowshelf":
        var alpha = sin_w0 / 2 * Math.sqrt((A + 1 / A) * (1 / this._q - 1) + 2)
        var two_sqrt_A_alpha =
          sin_w0 * Math.sqrt((A * A + 1) * (1 / this._q - 1) + 2 * A)
        this.b0 = A * ((A + 1) - (A - 1) * cos_w0 + two_sqrt_A_alpha)
        this.b1 = 2 * A * ((A - 1) - (A + 1) * cos_w0)
        this.b2 = A * ((A + 1) - (A - 1) * cos_w0 - two_sqrt_A_alpha)
        this.a0 = (A + 1) + (A - 1) * cos_w0 + two_sqrt_A_alpha
        this.a1 = -2 * ((A - 1) + (A + 1) * cos_w0)
        this.a2 = (A + 1) + (A - 1) * cos_w0 - two_sqrt_A_alpha
        break
      case "highshelf":
        var alpha = sin_w0 / 2 * Math.sqrt((A + 1 / A) * (1 / this._q - 1) + 2)
        var two_sqrt_A_alpha =
          sin_w0 * Math.sqrt((A * A + 1) * (1 / this._q - 1) + 2 * A)
        this.b0 = A * ((A + 1) + (A - 1) * cos_w0 + two_sqrt_A_alpha)
        this.b1 = -2 * A * ((A - 1) + (A + 1) * cos_w0)
        this.b2 = A * ((A + 1) + (A - 1) * cos_w0 - two_sqrt_A_alpha)
        this.a0 = (A + 1) - (A - 1) * cos_w0 + two_sqrt_A_alpha
        this.a1 = 2 * ((A - 1) - (A + 1) * cos_w0)
        this.a2 = (A + 1) - (A - 1) * cos_w0 - two_sqrt_A_alpha
        break
    }
  }

  process(input) {
    var output = (this.b0 / this.a0) * input
      + (this.b1 / this.a0) * this.x1
      + (this.b2 / this.a0) * this.x2
      - (this.a1 / this.a0) * this.y1
      - (this.a2 / this.a0) * this.y2

    this.x2 = this.x1
    this.x1 = input

    this.y2 = this.y1
    this.y1 = output

    return output
  }
}

class BiQuadStack {
  constructor(stack, sampleRate, type, cutoff, q, gain) {
    this.biquad = []
    for (var i = 0; i < stack; ++i) {
      this.biquad.push(new Biquad(sampleRate, type, cutoff, q, gain))
    }
  }

  clearBuffer() {
    for (var i = 0; i < this.biquad.length; ++i) {
      this.biquad[i].clearBuffer()
    }
  }

  set type(value) {
    for (var i = 0; i < this.biquad.length; ++i) {
      this.biquad[i].type = value
    }
  }

  set cutoff(value) {
    for (var i = 0; i < this.biquad.length; ++i) {
      this.biquad[i].cutoff = value
    }
  }

  set gain(value) {
    for (var i = 0; i < this.biquad.length; ++i) {
      this.biquad[i].gain = value
    }
  }

  set q(value) {
    for (var i = 0; i < this.biquad.length; ++i) {
      this.biquad[i].q = value
    }
  }

  process(input) {
    for (var i = 0; i < this.biquad.length; ++i) {
      input = this.biquad[i].process(input)
    }
    return input
  }
}

function makeLowpassWindow(win, cutoff) {
  // cutoff の範囲は [0, 1]
  var halfWinPoint = (win.length % 2 === 0 ? win.length - 1 : win.length) / 2
  var omega_c = 2 * Math.PI * cutoff
  for (var i = 0; i < win.length; ++i) {
    var n = i - halfWinPoint
    win[i] *= (n === 0) ? 1 : Math.sin(omega_c * n) / (Math.PI * n)
  }
  return win
}

function makeHighpassWindow(win, cutoff) {
  var halfWinPoint = (win.length % 2 === 0 ? win.length - 1 : win.length) / 2
  var omega_c = 2 * Math.PI * cutoff
  for (var i = 0; i < win.length; ++i) {
    var n = i - halfWinPoint
    win[i] *= (n === 0)
      ? 1
      : (Math.sin(Math.PI * n) - Math.sin(omega_c * n)) / (Math.PI * n)
  }
  return win
}

function makeBandpassWindow(win, low, high) {
  var halfWinPoint = (win.length % 2 === 0 ? win.length - 1 : win.length) / 2
  var two_pi = 2 * Math.PI
  var A = two_pi * low
  var B = two_pi * high
  for (var i = 0; i < win.length; ++i) {
    var n = i - halfWinPoint
    win[i] *= (n === 0)
      ? 1
      : (Math.sin(B * n) - Math.sin(A * n)) / (Math.PI * n)
  }
  return win
}

function makeBandrejectWindow(win, low, high) {
  var halfWinPoint = (win.length % 2 === 0 ? win.length - 1 : win.length) / 2
  var two_pi = 2 * Math.PI
  var A = two_pi * low
  var B = two_pi * high
  for (var i = 0; i < win.length; ++i) {
    var n = i - halfWinPoint
    win[i] *= (n === 0)
      ? 1
      : (Math.sin(A * n) - Math.sin(B * n) + Math.sin(Math.PI * n))
      / (Math.PI * n)
  }
  return win
}

// https://en.wikipedia.org/wiki/Window_function
function blackmanHarrisWindow(size) {
  var win = new Array(size)
  var a0 = 0.35875
  var a1 = 0.48829
  var a2 = 0.14128
  var a3 = 0.01168
  var twopi = 2 * Math.PI
  var fourpi = 4 * Math.PI
  var sixpi = 6 * Math.PI
  var N1 = win.length
  for (var n = 0; n < win.length; ++n) {
    var a1cos = a1 * Math.cos(n * twopi / N1)
    var a2cos = a2 * Math.cos(n * fourpi / N1)
    var a3cos = a3 * Math.cos(n * sixpi / N1)
    win[n] = a0 - a1cos + a2cos - a3cos
  }
  return win
}

// cutoff は Hz.
function filterPass(
  wave,
  cutoffLow,
  cutoffHigh,
  windowLength = 1025,
  filterType = "lowpass"
) {
  var win = blackmanHarrisWindow(windowLength)

  switch (filterType) {
    case "lowpass":
      win = makeLowpassWindow(win, cutoffLow)
      break
    case "highpass":
      win = makeHighpassWindow(win, cutoffLow)
      break
    case "bandpass":
      win = makeBandpassWindow(win, cutoffLow, cutoffHigh)
      break
    case "bandreject":
      win = makeBandrejectWindow(win, cutoffLow, cutoffHigh)
      break
    default:
      console.log("Invalid filterType.")
      break
  }

  var buffer = new Array(win.length).fill(0)
  var ptr = 0
  for (var i = 0; i < wave.length; ++i) {
    if (ptr < wave.length) {
      buffer.push(wave[ptr++])
    }
    else {
      buffer.push(0)
    }
    buffer.shift()

    wave[i] = 0
    for (var j = 0; j < win.length; ++j) {
      wave[i] += win[j] * buffer[j]
    }
  }

  return wave
}

class IdealBandpass {
  constructor(low, high, windowLength) {
    this.win = makeBandpassWindow(blackmanHarrisWindow(windowLength), low, high)
    this.halfWinLength = Math.ceil(this.win.length / 2)

    this.buffer = new Array(this.win.length).fill(0)
    this.ptr = 0
  }

  process(input) {
    this.buffer[this.ptr] = input
    this.ptr = (this.ptr + 1) % this.buffer.length

    var output = 0
    for (var i = 0; i < this.win.length; ++i) {
      output += this.win[i] * this.buffer[(i + this.ptr) % this.buffer.length]
    }
    return output
  }
}
