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

function kaiserWindow(length, alpha) {
  var win = new Array(length).fill(0)
  var pi_alpha = Math.PI * alpha
  var last = win.length - 1
  for (var i = 0; i < win.length; ++i) {
    var a = 2 * i / last - 1
    win[i] = modifiedBesselI(0, pi_alpha * Math.sqrt(1 - a * a))
      / modifiedBesselI(0, pi_alpha)
  }
  return win
}

function modifiedBesselI(alpha, x) {
  var sum = Math.pow(x / 2, 2 * alpha) / gamma(alpha + 1)
  var factorial = 1
  for (var m = 1; m < 45; ++m) { // 45 iteration is only accurate if x <= 10.
    sum += Math.pow(x / 2, 2 * m + alpha) / (factorial * gamma(m + alpha + 1))
    factorial *= m
  }
  return sum
}

// Lanczos approximation of gamma function.
// https://en.wikipedia.org/wiki/Lanczos_approximation
function gamma(z) {
  var p = [
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7
  ]

  if (z < 0.5) {
    return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z))
  }

  z -= 1
  var a = 0.99999999999980993
  for (var i = 0; i < p.length; ++i) {
    a += p[i] / (z + i + 1)
  }
  var t = z + p.length - 0.5
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * a
}
