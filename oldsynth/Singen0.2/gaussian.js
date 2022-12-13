// https://en.wikipedia.org/wiki/Gaussian_function
// http://mathworld.wolfram.com/GaussianFunction.html
// tableが欲しいときはcurveを使う。
// var gaussian = new Gaussian(1, 0)
// var table = gaussian.curve(512, 1, -10, 10)
class Gaussian {
  constructor(sigma, mu) {
    this.sigma = sigma
    this.mu = mu
  }

  set sigma(s) {
    this.a = 1 / (s * Math.sqrt(Math.PI * 2))
    this.c = 2 * s * s
  }

  value(x) {
    var numer = x - this.mu
    return Math.exp(-numer * numer / this.c)
  }

  curve(width, height, min, max) {
    var array = new Array(width)
    var step = (max - min) / (array.length - 1)
    for (let x = 0; x < array.length; ++x) {
      array[x] = this.value(x * step + min) * height
    }
    return array
  }
}

// length = Math.floor(time * samplerate)
function makeClickTable(length, peaks, sigmaStart, sigmaEnd) {
  var table = new Array(length).fill(0)
  var stepMu = 20 / (peaks - 1)
  var gaussian = new Gaussian(1, -10)
  for (var i = 0; i < peaks; ++i) {
    gaussian.sigma = (sigmaEnd - sigmaStart) * i / peaks + sigmaStart
    var gaussianTable = gaussian.curve(length, 1, -10, 10)
    for (var j = 0; j < table.length; ++j) {
      table[j] += gaussianTable[j]
    }
    gaussian.mu += stepMu
  }

  // normalize
  var peak = 0
  for (var i = 0; i < table.length; ++i) {
    var tableAbs = Math.abs(table[i])
    if (tableAbs > peak) peak = tableAbs
  }
  for (var i = 0; i < table.length; ++i) {
    table[i] = -table[i] / peak
  }

  var easing = halfSin(length)
  for (var i = 0; i < table.length; ++i) {
    table[i] = table[i] * (easing[i] - 1) + easing[i]
  }

  return table
}

function halfSin(length) {
  var table = new Array(length)
  var step = Math.PI / table.length
  var halfPi = Math.PI / 2
  for (var i = 0; i < table.length; ++i) {
    table[i] = (Math.sin(Math.PI * (i / table.length - 0.5)) + 1) / 2
  }
  return table
}

// var GAMMA_P = [
//   676.5203681218851,
//   -1259.1392167224028,
//   771.32342877765313,
//   -176.61502916214059,
//   12.507343278686905,
//   -0.13857109526572012,
//   9.9843695780195716e-6,
//   1.5056327351493116e-7
// ]

// function gamma(z) {
//   if (z < 0.5) {
//     return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z))
//   }
//   z -= 1
//   var x = 0.99999999999980993
//   for (var i = 0; i < GAMMA_P.length; ++i) {
//     x += GAMMA_P[i] / (z + i + 1)
//   }
//   var t = z + GAMMA_P.length - 0.5
//   return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x
// }

// function modifiedBessel1(x, a) {
//   var sum = Math.pow(x / 2, a) / gamma(a + 1)
//   var factor = 1
//   for (var m = 1; m < 16; ++m) {
//     factor *= m
//     sum += Math.pow(x / 2, 2 * m + a) / (factor * gamma(m + a + 1))
//   }
//   return sum
// }
