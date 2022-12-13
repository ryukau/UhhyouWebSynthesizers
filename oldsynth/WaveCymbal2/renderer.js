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

class Solver {
  // Ax = b の A が固定で 0 が多く含まれているなら速い。
  constructor(a = []) {
    this.prepareA(a)
    this.tolerance = 1e-9
    this.maxIteration = 1024
  }

  prepareA(a) {
    this.aReduced = new Array(a.length)
    for (var i = 0; i < a.length; ++i) {
      this.aReduced[i] = []
      for (var j = 0; j < a[i].length; ++j) {
        if (a[i][j] === 0 || i === j) {
          continue
        }
        this.aReduced[i].push([a[i][j], j])
      }
    }

    this.aDiag = new Array(a.length)
    for (var i = 0; i < a.length; ++i) {
      this.aDiag[i] = a[i][i]
    }

    this.x = new Array(a.length).fill(0)
    this.x_prev = new Array(a.length).fill(0)
  }

  solve(b) {
    this.x.fill(0)
    for (var iter = 0; iter < this.maxIteration; ++iter) {
      this.x_prev = [...this.x]
      for (var i = 0; i < this.x.length; ++i) {
        var sum = b[i]
        for (var j = 0; j < this.aReduced[i].length; ++j) {
          sum -= this.aReduced[i][j][0] * this.x[this.aReduced[i][j][1]]
        }
        this.x[i] = sum / this.aDiag[i]
      }
      if (this.isInTolerance(this.x)) {
        break
      }
    }
    return this.x
  }

  solveBX(b, x) {
    x.fill(0)
    for (var iter = 0; iter < this.maxIteration; ++iter) {
      this.x_prev = [...x]
      for (var i = 0; i < x.length; ++i) {
        var sum = b[i]
        for (var j = 0; j < this.aReduced[i].length; ++j) {
          sum -= this.aReduced[i][j][0] * x[this.aReduced[i][j][1]]
        }
        x[i] = sum / this.aDiag[i]
      }

      this.x_prev = [...x]
      for (var i = x.length - 1; i >= 0; --i) {
        var sum = b[i]
        for (var j = 0; j < this.aReduced[i].length; ++j) {
          sum -= this.aReduced[i][j][0] * x[this.aReduced[i][j][1]]
        }
        x[i] = sum / this.aDiag[i]
      }

      if (this.isInTolerance(x)) {
        break
      }
    }
    return x
  }

  isInTolerance(vecX) {
    for (var i = 0; i < vecX.length; ++i) {
      if (Math.abs(vecX[i] - this.x_prev[i]) > this.tolerance) return false
    }
    return true
  }

  solveAB(a, b) {
    this.prepareA(a)
    return this.solve(b)
  }
}

class DampedWave1DNewmarkBeta {
  constructor(length, pulsePosition, pulseWidth, c, dx, dt, a, k) {
    this.length = length
    this.reset()

    this.pulsePosition = pulsePosition // [0, 1)
    this.pulseWidth = pulseWidth // [0, 1]

    this.c = c
    this.dt = dt
    this.dx = dx
    this.a = a
    this.k = k

    this.beta = 1 / 4
    this.vectorB = new Array(this.length).fill(0)

    this.boundary = 1 // 1: 固定端, 2: 自由端。

    this.refreshConstants()
  }

  set pulsePosition(value) {
    this._position = Math.floor(value * this.acceleration[0].length)
  }

  set pulseWidth(value) {
    var pw = Math.floor(value * this.acceleration[0].length)
    this._pulseWidth = pw < 4 ? 4 : pw
  }

  get position() {
    return this.acceleration[0]
  }

  refreshConstants() {
    var dt2 = this.dt * this.dt

    this.C2 = this.c * this.c / this.dx / this.dx // dx が小さいと金属感が増す。
    this.C3 = dt2 * (0.5 - this.beta)
    this.C7 = this.dt / 2
    this.C8 = dt2 * this.beta
    this.C1 = - this.C2 * this.C8
    this.C6 = this.k + 2 * this.C2
    this.C0 = 1 + this.a * this.C7 + this.C6 * this.C8
    this.C4 = this.C3 * this.C6 + this.a * this.C7
    this.C5 = this.a + this.dt * this.C6

    this.L = this.boundary * this.C1
    this.R = this.boundary * this.C1

    this.initMatrix()
  }

  initMatrix() {
    var mat = []
    for (var i = 0; i < this.length; ++i) {
      mat.push(new Array(this.length).fill(0))
    }

    mat[0][0] = this.C0
    mat[0][1] = this.L

    var last = this.length - 1
    for (var i = 1; i < last; ++i) {
      mat[i][i - 1] = this.C1
      mat[i][i] = this.C0
      mat[i][i + 1] = this.C1
    }

    mat[last][last - 1] = this.R
    mat[last][last] = this.C0

    if (this.solver === undefined) {
      this.solver = new Solver(mat)
      this.solver.tolerance = 1e-9
      this.solver.maxIteration = 128
    }
    else {
      this.solver.prepareA(mat)
    }
  }

  step() {
    this.acceleration.unshift(this.acceleration.pop())

    var last = this.length - 1

    // 左端。
    var right = 1
    this.vectorB[0]
      = this.boundary * this.C2 * (
        this.wave[right]
        + this.dt * this.velocity[right]
        + this.C3 * this.acceleration[1][right]
      )
      - this.C4 * this.acceleration[1][0]
      - this.C5 * this.velocity[0]
      - this.C6 * this.wave[0]

    // 右端。
    var left = last - 1
    this.vectorB[last]
      = this.boundary * this.C2 * (
        this.wave[left]
        + this.dt * this.velocity[left]
        + this.C3 * this.acceleration[1][left]
      )
      - this.C4 * this.acceleration[1][last]
      - this.C5 * this.velocity[last]
      - this.C6 * this.wave[last]

    for (var x = 1; x < last; ++x) {
      left = x - 1
      right = x + 1
      this.vectorB[x]
        = this.C2 * (
          (this.wave[left] + this.wave[right])
          + this.dt * (this.velocity[left] + this.velocity[right])
          + this.C3 * (this.acceleration[1][left] + this.acceleration[1][right])
        )
        - this.C4 * this.acceleration[1][x]
        - this.C5 * this.velocity[x]
        - this.C6 * this.wave[x]
    }

    this.solver.solveBX(this.vectorB, this.acceleration[0])

    for (var x = 0; x < this.length; ++x) {
      this.wave[x] += this.dt * this.velocity[x]
        + this.C3 * this.acceleration[1][x]
        + this.C8 * this.acceleration[0][x]
      this.velocity[x] += this.C7
        * (this.acceleration[1][x] + this.acceleration[0][x])
    }
  }

  reset() {
    this.wave = new Array(this.length).fill(0)
    this.velocity = new Array(this.length).fill(0)

    this.acceleration = []
    for (var i = 0; i < 2; ++i) {
      this.acceleration.push(new Array(this.length).fill(0))
    }
  }

  pulse(height) {
    // Hanning window.
    var left = Math.floor(this._position - this._pulseWidth / 2)
    var twoPi_N1 = 2 * Math.PI / (this._pulseWidth - 1)
    height /= this._pulseWidth / 2
    for (let i = 0; i < this._pulseWidth; ++i) {
      this.acceleration[0][(left + i) % this.acceleration[0].length] +=
        height * (1 - Math.cos(twoPi_N1 * i))
    }
  }

  process(input) {
    if (input !== 0) {
      this.pulse(input)
    }
    this.step()
    return this.acceleration[0]
  }
}

class DampedWave1D {
  constructor(length, pulsePosition, pulseWidth, c, dx, dt, a, k) {
    this.length = length
    this.reset()

    this.pulsePosition = pulsePosition // [0, 1)
    this.pulseWidth = pulseWidth // [0, 1]

    this.c = c
    this.dt = dt
    this.dx = dx
    this.a = a
    this.k = k

    this.refreshConstants()
  }

  set pulsePosition(value) {
    this._position = Math.floor(value * this.wave[0].length)
  }

  set pulseWidth(value) {
    var pw = Math.floor(value * this.wave[0].length)
    this._pulseWidth = pw < 4 ? 4 : pw
  }

  get position() {
    return this.wave[0]
  }

  refreshConstants() {
    this.C0 = (this.c * this.dt / this.dx) ** 2
    this.C1 = this.a * this.dt - 1
    this.C2 = 1 - this.C1 - 2 * this.C0 - this.k * this.dt ** 2
  }

  reset() {
    this.wave = []
    for (var i = 0; i < 4; ++i) {
      this.wave.push(new Array(this.length).fill(0))
    }
  }

  step() {
    this.wave.unshift(this.wave.pop())

    var last = this.wave[0].length - 1
    for (var x = 1; x < last; ++x) {
      this.wave[0][x]
        = this.C0 * (this.wave[1][x + 1] + this.wave[1][x - 1])
        + this.C1 * this.wave[2][x]
        + this.C2 * this.wave[1][x]
    }

    this.wave[0][0]
      = this.C0 * (this.wave[1][1] + this.wave[1][last])
      + this.C1 * this.wave[2][0]
      + this.C2 * this.wave[1][0]

    this.wave[0][last]
      = this.C0 * (this.wave[1][0] + this.wave[1][last - 1])
      + this.C1 * this.wave[2][last]
      + this.C2 * this.wave[1][last]
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
    dx,
    damping,
    stiffness,
    decay,
    bandSplit,
    bandpassQ,
    simulator
  ) {
    if (simulator === "Newmark-β") {
      this.wave1d = new DampedWave1DNewmarkBeta(
        frequency.length,
        pulsePosition,
        pulseWidth,
        0.7071067811865476, // Math.sqrt(0.5)
        dx,
        1 / sampleRate,
        damping,  //10,
        stiffness //100000
      )
    }
    else {
      this.wave1d = new DampedWave1D(
        frequency.length,
        pulsePosition,
        pulseWidth,
        0.7071067811865476, // Math.sqrt(0.5)
        dx,
        1 / sampleRate,
        damping,  //10,
        stiffness //100000
      )
    }

    this.string = []
    this.bandpass = []

    var low = 0
    var high = 0
    for (var i = 0; i < frequency.length; ++i) {
      this.string.push(new KSString(sampleRate, frequency[i], 0.5, decay))

      high = this.getCrossoverFrequency(
        20, 20000, i + 1, frequency.length, bandSplit)
      this.bandpass.push(new Biquad(
        sampleRate,
        "bandpass",
        low + (high - low) * rnd.random(),
        bandpassQ,
        0.0
      ))
      low = high
    }

    this.denom = this.bandpass.length * 1024
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
    var wave = this.wave1d.process(input)
    var output = 0
    for (var i = 0; i < this.bandpass.length; ++i) {
      var rendered = this.string[i].process(
        this.bandpass[i].process(wave[i])
      )
      wave[i] += rendered / this.denom
      output += rendered
    }
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
    dx,
    damping,
    stiffness,
    decay,
    bandSplit,
    bandpassQ,
    simulator
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
        dx,
        damping,
        stiffness,
        decay,
        bandSplit,
        bandpassQ,
        simulator
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
        this.string[i].wave1d.position,
        this.string[i + 1].wave1d.position
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

  var sampleRate = params.sampleRate * params.overSampling
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
    params.dx,
    params.damping,
    params.stiffness,
    params.decay,
    params.bandSplit,
    params.bandpassQ,
    params.simulator
  )
  for (var i = 0; i < wave.length; ++i) {
    wave[i] = string.process(wave[i])
  }

  // down sampling.
  if (params.overSampling > 1) {
    wave = Resampler.pass(wave, sampleRate, params.sampleRate)
  }

  // high pass.
  if (params.highpass) {
    var highpass = new BiQuadStack(8, sampleRate, "highpass", 10, 0.1, 1)
    for (var i = 0; i < wave.length; ++i) {
      wave[i] = highpass.process(wave[i])
    }
  }

  postMessage(wave)
}
