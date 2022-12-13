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

/* Wave2d */
class Solver {
  // Ax = b を解く。
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

    this.aDiagonal = new Array(a.length)
    for (var i = 0; i < a.length; ++i) {
      this.aDiagonal[i] = a[i][i]
    }

    this.x_prev = new Array(a.length).fill(0)
  }

  setA(aReduced, aDiagonal) {
    this.aReduced = aReduced
    this.aDiagonal = aDiagonal
    this.x_prev = new Array(aDiagonal.length).fill(0)
  }

  isInTolerance(x) {
    for (var i = 0; i < x.length; ++i) {
      if (Math.abs(x.array[i].value - this.x_prev[i]) > this.tolerance) {
        return false
      }
    }
    return true
  }

  solveBXNode(b, x) {
    for (var i = 0; i < x.length; ++i) {
      x.array[i].value = 0
    }

    for (var iter = 0; iter < this.maxIteration; ++iter) {
      for (var i = 0; i < x.length; ++i) {
        this.x_prev[i] = x.array[i].value
      }

      for (var i = 0; i < x.length; ++i) {
        var sum = b.array[i].value
        for (var j = 0; j < this.aReduced[i].length; ++j) {
          sum -= this.aReduced[i][j][0] * x.array[this.aReduced[i][j][1]].value
        }
        x.array[i].value = sum / this.aDiagonal[i]
      }

      for (var i = 0; i < x.length; ++i) {
        this.x_prev[i] = x.array[i].value
      }

      for (var i = x.length - 1; i >= 0; --i) {
        var sum = b.array[i].value
        for (var j = 0; j < this.aReduced[i].length; ++j) {
          sum -= this.aReduced[i][j][0] * x.array[this.aReduced[i][j][1]].value
        }
        x.array[i].value = sum / this.aDiagonal[i]
      }

      if (this.isInTolerance(x)) break
    }
  }

  solveBXNodeJacobi(b, x) {
    for (var i = 0; i < x.length; ++i) {
      x.array[i].value = 0
    }

    var omega = 2 / 3
    var omega1 = 1 - omega

    for (var iter = 0; iter < this.maxIteration; ++iter) {
      for (var i = 0; i < x.length; ++i) {
        this.x_prev[i] = x.array[i].value
      }

      for (var i = 0; i < x.length; ++i) {
        var sum = b.array[i].value
        for (var j = 0; j < this.aReduced[i].length; ++j) {
          sum -= this.aReduced[i][j][0] * this.x_prev[this.aReduced[i][j][1]]
        }
        x.array[i].value
          = omega * sum / this.aDiagonal[i]
          + omega1 * this.x_prev[i]
      }

      for (var i = 0; i < x.length; ++i) {
        this.x_prev[i] = x.array[i].value
      }

      for (var i = x.length - 1; i >= 0; --i) {
        var sum = b.array[i].value
        for (var j = 0; j < this.aReduced[i].length; ++j) {
          sum -= this.aReduced[i][j][0] * this.x_prev[this.aReduced[i][j][1]]
        }
        x.array[i].value
          = omega * sum / this.aDiagonal[i]
          + omega1 * this.x_prev[i]
      }

      if (this.isInTolerance(x)) break
    }
  }
}

class Array2D {
  constructor(width, height) {
    this.width = width
    this.height = height
    this.length = width * height

    this.lattice = new Array(this.width)
    this.array = new Array(this.length)
    for (var x = 0; x < this.width; ++x) {
      this.lattice[x] = new Array(this.height)
      for (var y = 0; y < this.height; ++y) {
        var node = { value: 0 }
        this.lattice[x][y] = node
        this.array[x + y * this.width] = node
      }
    }
  }
}

class DampedWave2DNewmarkBeta {
  constructor(width, height, c, dx, dt, a, k) {
    this.width = width
    this.height = height
    this.length = width * height
    this.xLast = width - 1
    this.yLast = height - 1
    this.initArrays()

    this.c = c
    this.dt = dt
    this.dx = dx
    this.a = a
    this.k = k

    this.beta = 1 / 4

    this.boundary = 1 // 1: constant, 2: free.

    this.solver = new Solver()
    this.solver.tolerance = 1e-9
    this.solver.maxIteration = 4
    this.vectorB = new Array2D(this.width, this.height)

    this.refreshConstants()

    this.isPicked = false
    this.pickX = 0
    this.pickY = 0
    this.pickForce = 0
  }

  initArrays() {
    this.wave = new Array2D(this.width, this.height)
    this.velocity = new Array2D(this.width, this.height)

    this.acceleration = []
    for (var i = 0; i < 2; ++i) {
      this.acceleration.push(new Array2D(this.width, this.height))
    }
  }

  refreshConstants() {
    var dt2 = this.dt * this.dt

    this.C2 = this.c * this.c / this.dx / this.dx
    this.C3 = dt2 * (0.5 - this.beta)
    this.C7 = this.dt / 2
    this.C8 = dt2 * this.beta
    this.C1 = - this.C2 * this.C8
    this.C6 = this.k + 4 * this.C2
    this.C0 = 1 + this.a * this.C7 + this.C6 * this.C8
    this.C4 = this.C3 * this.C6 + this.a * this.C7
    this.C5 = this.a + this.dt * this.C6

    this.initMatrix()
  }

  initMatrix() {
    // aReduced = [[value, index], ...]
    var aReduced = new Array(this.length)
    for (var i = 0; i < aReduced.length; ++i) {
      aReduced[i] = []
    }

    for (var x = 0; x < this.width; ++x) {
      for (var y = 0; y < this.height; ++y) {
        var index = x + y * this.width
        if (x === 0) {
          aReduced[index].push([this.boundary * this.C1, index + 1])
        }
        else if (x === this.xLast) {
          aReduced[index].push([this.boundary * this.C1, index - 1])
        }
        else {
          aReduced[index].push([this.C1, index - 1])
          aReduced[index].push([this.C1, index + 1])
        }
        if (y === 0) {
          aReduced[index].push([this.boundary * this.C1, index + this.width])
        }
        else if (y === this.yLast) {
          aReduced[index].push([this.boundary * this.C1, index - this.width])
        }
        else {
          aReduced[index].push([this.C1, index - this.width])
          aReduced[index].push([this.C1, index + this.width])
        }
      }
    }

    var aDiagonal = new Array(this.length).fill(this.C0)

    this.solver.setA(aReduced, aDiagonal)
  }

  sumNeighbor(array, x, y) {
    // console.log(array, x, y)
    const sumX = x === 0
      ? this.boundary * array.lattice[x + 1][y].value
      : x === this.xLast
        ? this.boundary * array.lattice[x - 1][y].value
        : array.lattice[x - 1][y].value + array.lattice[x + 1][y].value
    const sumY = y === 0
      ? this.boundary * array.lattice[x][y + 1].value
      : y === this.yLast
        ? this.boundary * array.lattice[x][y - 1].value
        : array.lattice[x][y - 1].value + array.lattice[x][y + 1].value
    return sumX + sumY
  }

  step() {
    this.acceleration.unshift(this.acceleration.pop())

    var last = this.length - 1

    for (var x = 0; x < this.width; ++x) {
      for (var y = 0; y < this.height; ++y) {
        this.vectorB.lattice[x][y].value
          = this.C2 * (
            this.sumNeighbor(this.wave, x, y)
            + this.dt * this.sumNeighbor(this.velocity, x, y)
            + this.C3 * this.sumNeighbor(this.acceleration[1], x, y)
          )
          - this.C4 * this.acceleration[1].lattice[x][y].value
          - this.C5 * this.velocity.lattice[x][y].value
          - this.C6 * this.wave.lattice[x][y].value
      }
    }

    this.solver.solveBXNode(this.vectorB, this.acceleration[0])
    // this.solver.solveBXNodeJacobi(this.vectorB, this.acceleration[0])

    for (var i = 0; i < this.length; ++i) {
      this.wave.array[i].value += this.dt * this.velocity.array[i].value
        + this.C3 * this.acceleration[1].array[i].value
        + this.C8 * this.acceleration[0].array[i].value
      this.velocity.array[i].value += this.C7 * (
        this.acceleration[1].array[i].value
        + this.acceleration[0].array[i].value
      )
    }

    if (this.isPicked) {
      this.acceleration[0].lattice[this.pickX][this.pickY].value = this.pickForce
    }
  }

  reset() {
    for (var i = 0; i < this.length; ++i) {
      this.wave.array[i].value = 0
      this.velocity.array[i].value = 0
      this.acceleration[0].array[i].value = 0
      this.acceleration[1].array[i].value = 0
    }
  }

  pick(x, y, force) {
    this.isPicked = force != 0
      && x >= 0 && x < this.width
      && y >= 0 && y < this.height
    if (this.isPicked) {
      this.pickX = x
      this.pickY = y
      this.pickForce = force
    }
  }
}

class Array3D {
  constructor(width, height, depth) {
    this.width = width
    this.height = height
    this.depth = depth
    this.length = width * height * depth

    this.lattice = new Array(this.width)
    this.array = new Array(this.length)

    var widthHeight = this.width * this.height
    for (var x = 0; x < this.width; ++x) {
      this.lattice[x] = new Array(this.height)
      for (var y = 0; y < this.height; ++y) {
        this.lattice[x][y] = new Array(this.depth)
        for (var z = 0; z < this.depth; ++z) {
          var node = { value: 0 }
          this.lattice[x][y][z] = node
          this.array[x + y * this.width + z * widthHeight] = node
        }
      }
    }
  }
}

class DampedWave3DNewmarkBeta {
  constructor(width, height, depth, dx, dy, dz, dt, c, a, k) {
    this.width = width
    this.height = height
    this.depth = depth
    this.xyLength = width * height
    this.length = width * height * depth
    this.xLast = width - 1
    this.yLast = height - 1
    this.zLast = depth - 1
    this.initArrays()

    this.dx = dx
    this.dy = dy
    this.dz = dz
    this.dt = dt
    this.c = this.createArray()
    this.a = this.createArray()
    this.k = this.createArray()

    // 中央と周縁で密度を変える。
    var xHalf = this.xLast / 2
    var yHalf = this.yLast / 2
    var zHalf = this.zLast / 2
    for (var x = 0; x < this.width; ++x) {
      var xVal = Math.abs(x - xHalf) / this.xLast
      for (var y = 0; y < this.height; ++y) {
        var yVal = Math.abs(y - yHalf) / this.yLast
        for (var z = 0; z < this.depth; ++z) {
          var zVal = 0.999 + 0.001 * z / this.zLast

          var tri = (1 - xVal * yVal) * zVal
          this.c.lattice[x][y][z].value = c
          this.a.lattice[x][y][z].value = a / tri
          this.k.lattice[x][y][z].value = k / tri
          this.a.lattice[x][y][z].value = a * tri
          this.k.lattice[x][y][z].value = k * tri
        }
      }
    }

    this.beta = 1 / 4

    this.boundary = 1 // 1: constant, 2: free.

    this.solver = new Solver()
    this.solver.tolerance = 1e-9
    this.solver.maxIteration = 1
    this.vectorB = this.createArray()

    this.refreshConstants()

    this.isPicked = false
    this.pickX = 0
    this.pickY = 0
    this.pickForce = 0
  }

  createArray() {
    return new Array3D(this.width, this.height, this.depth)
  }

  initArrays() {
    this.wave = this.createArray()
    this.velocity = this.createArray()

    this.acceleration = []
    for (var i = 0; i < 2; ++i) {
      this.acceleration.push(this.createArray())
    }
  }

  refreshConstants() {
    var dt2 = this.dt ** 2

    this.constant = []
    for (var i = 0; i < 11; ++i) {
      this.constant.push(this.createArray())
    }

    for (var i = 0; i < this.length; ++i) {
      this.constant[2].array[i].value = this.c.array[i].value ** 2
      this.constant[5].array[i].value = - this.k.array[i].value
      this.constant[6].array[i].value = - (
        this.a.array[i].value + this.k.array[i].value * this.dt)
      this.constant[8].array[i].value = this.dt / 2
      this.constant[9].array[i].value = dt2 * (1 / 2 - this.beta)
      this.constant[10].array[i].value = dt2 * this.beta
      this.constant[0].array[i].value = 1
        + this.a.array[i].value * this.constant[8].array[i].value
        + this.k.array[i].value * this.constant[10].array[i].value
      this.constant[1].array[i].value = - this.constant[2].array[i].value
        * this.constant[10].array[i].value
      this.constant[3].array[i].value = this.constant[2].array[i].value
        * this.dt
      this.constant[4].array[i].value = this.constant[2].array[i].value
        * this.constant[9].array[i].value
      this.constant[7].array[i].value = - (
        this.a.array[i].value * this.constant[8].array[i].value
        + this.k.array[i].value * this.constant[9].array[i].value)
    }

    this.invDx2 = 1 / this.dx ** 2
    this.invDy2 = 1 / this.dy ** 2
    this.invDz2 = 1 / this.dz ** 2

    this.initMatrix()
  }

  initMatrix() {
    // aReduced = [[value, index], ...]
    var aReduced = new Array(this.length)
    for (var i = 0; i < aReduced.length; ++i) {
      aReduced[i] = []
    }

    for (var x = 0; x < this.width; ++x) {
      for (var y = 0; y < this.height; ++y) {
        for (var z = 0; z < this.depth; ++z) {
          var index = x + y * this.width + z * this.xyLength

          var c1x = this.constant[1].lattice[x][y][z].value * this.invDx2
          var c1y = this.constant[1].lattice[x][y][z].value * this.invDy2
          var c1z = this.constant[1].lattice[x][y][z].value * this.invDz2

          if (x === 0) {
            aReduced[index].push([this.boundary * c1x, index + 1])
          }
          else if (x === this.xLast) {
            aReduced[index].push([this.boundary * c1x, index - 1])
          }
          else {
            aReduced[index].push([c1x, index - 1])
            aReduced[index].push([c1x, index + 1])
          }

          if (y === 0) {
            aReduced[index].push([this.boundary * c1y, index + this.width])
          }
          else if (y === this.yLast) {
            aReduced[index].push([this.boundary * c1y, index - this.width])
          }
          else {
            aReduced[index].push([c1y, index - this.width])
            aReduced[index].push([c1y, index + this.width])
          }

          if (z === 0) {
            aReduced[index].push([this.boundary * c1z, index + this.xyLength])
          }
          else if (z === this.zLast) {
            aReduced[index].push([this.boundary * c1z, index - this.xyLength])
          }
          else {
            aReduced[index].push([c1z, index - this.xyLength])
            aReduced[index].push([c1z, index + this.xyLength])
          }
        }
      }
    }

    var aDiagonal = new Array(this.length)
    for (var i = 0; i < aDiagonal.length; ++i) {
      aDiagonal[i] = this.constant[0].array[i].value - 2 * (c1x + c1y + c1z)
    }

    this.solver.setA(aReduced, aDiagonal)
  }

  laplacian(array, x, y, z) {
    const sumX = x === 0
      ? this.boundary * array.lattice[x + 1][y][z].value
      : x === this.xLast
        ? this.boundary * array.lattice[x - 1][y][z].value
        : array.lattice[x - 1][y][z].value + array.lattice[x + 1][y][z].value
    const sumY = y === 0
      ? this.boundary * array.lattice[x][y + 1][z].value
      : y === this.yLast
        ? this.boundary * array.lattice[x][y - 1][z].value
        : array.lattice[x][y - 1][z].value + array.lattice[x][y + 1][z].value
    const sumZ = z === 0
      ? this.boundary * array.lattice[x][y][z + 1].value
      : z === this.zLast
        ? this.boundary * array.lattice[x][y][z - 1].value
        : array.lattice[x][y][z - 1].value + array.lattice[x][y][z + 1].value
    return (sumX - 2 * array.lattice[x][y][z].value) * this.invDx2
      + (sumY - 2 * array.lattice[x][y][z].value) * this.invDy2
      + (sumZ - 2 * array.lattice[x][y][z].value) * this.invDz2
  }

  step() {
    this.acceleration.unshift(this.acceleration.pop())

    var last = this.length - 1

    for (var x = 0; x < this.width; ++x) {
      for (var y = 0; y < this.height; ++y) {
        for (var z = 0; z < this.depth; ++z) {
          this.vectorB.lattice[x][y][z].value
            = this.constant[2].lattice[x][y][z].value * this.laplacian(this.wave, x, y, z)
            + this.constant[3].lattice[x][y][z].value * this.laplacian(this.velocity, x, y, z)
            + this.constant[4].lattice[x][y][z].value * this.laplacian(this.acceleration[1], x, y, z)
            + this.constant[5].lattice[x][y][z].value * this.wave.lattice[x][y][z].value
            + this.constant[6].lattice[x][y][z].value * this.velocity.lattice[x][y][z].value
            + this.constant[7].lattice[x][y][z].value * this.acceleration[1].lattice[x][y][z].value
        }
      }
    }

    this.solver.solveBXNode(this.vectorB, this.acceleration[0])
    // this.solver.solveBXNodeJacobi(this.vectorB, this.acceleration[0])

    for (var i = 0; i < this.length; ++i) {
      this.wave.array[i].value += this.dt * this.velocity.array[i].value
        + this.constant[9].array[i].value * this.acceleration[1].array[i].value
        + this.constant[10].array[i].value * this.acceleration[0].array[i].value
      this.velocity.array[i].value += this.constant[8].array[i].value * (
        this.acceleration[1].array[i].value
        + this.acceleration[0].array[i].value
      )
    }

    if (this.isPicked) {
      this.acceleration[0].lattice[this.pickX][this.pickY][0].value
        = this.pickForce
    }
  }

  reset() {
    for (var i = 0; i < this.length; ++i) {
      this.wave.array[i].value = 0
      this.velocity.array[i].value = 0
      this.acceleration[0].array[i].value = 0
      this.acceleration[1].array[i].value = 0
    }
  }

  pick(x, y, force) {
    this.isPicked = force != 0
      && x >= 0 && x < this.width
      && y >= 0 && y < this.height
    if (this.isPicked) {
      this.pickX = x
      this.pickY = y
      this.pickForce = force
    }
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
  wave[0] = 1

  // Render wave.
  var width = 16
  var height = 16
  var depth = 16

  // var plate = new DampedWave2DNewmarkBeta(
  //   width,
  //   height,
  //   params.waveSpeed,
  //   params.dx,
  //   1 / sampleRate,
  //   params.damping,
  //   params.stiffness
  // )
  var plate = new DampedWave3DNewmarkBeta(
    width,
    height,
    depth,
    params.dx,
    params.dx,
    params.dx * 0.1,
    1 / sampleRate,
    params.waveSpeed,
    params.damping,
    params.stiffness
  )

  if (params.boundaryCondition === "Free") {
    plate.boundary = 2; plate.refreshConstants()
  }

  var pickX = Math.floor(width * rnd.random())
  var pickY = Math.floor(height * rnd.random())
  var surfaceLength = width * height
  for (var iter = 0; iter < 1; ++iter) {
    for (var i = 0; i < wave.length; ++i) {
      plate.pick(pickX, pickY, wave[i] * 10000)
      if (params.scatterImpulse) {
        pickX = Math.floor(width * rnd.random())
        pickY = Math.floor(height * rnd.random())
      }

      plate.step()

      wave[i] = 0
      for (var j = 0; j < surfaceLength; ++j) {
        wave[i] += plate.wave.array[j].value
      }

      if (i % 1000 == 0) console.log(`rendered/total samples: ${i}/${wave.length}`)
    }
  }

  // var highpass = new BiQuadStack(8, sampleRate, "highpass", 10, 0.1, 1)
  // for (var i = 0; i < wave.length; ++i) {
  //   wave[i] = highpass.process(wave[i])
  // }

  // down sampling.
  if (params.overSampling > 1) {
    wave = Resampler.pass(wave, sampleRate, params.sampleRate)
  }

  postMessage(wave)
}
