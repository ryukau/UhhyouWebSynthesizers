class Resampler {
  static pass(source, sourceRate, destRate) {
    var destLength = Math.floor(destRate * source.length / sourceRate)
    var dest = new Array(destLength).fill(0)
    var win = this.blackmanHarrisWindow(this.windowLength)
    // var win = new Array(this.windowLength).fill(1)
    var halfWinLength = Math.floor(win.length / 2)

    var cutoff = destRate / sourceRate

    for (var i = 0; i < win.length; ++i) {
      var t = i - halfWinLength
      win[i] *= cutoff * this.sinc(cutoff * t)
    }

    var ratio = sourceRate / destRate

    for (var i = 0; i < dest.length; ++i) {
      var floor = Math.floor(i * ratio)
      for (var j = 0; j < win.length; ++j) {
        var n = floor + (j - halfWinLength)
        if (n >= 0 && n < source.length) {
          dest[i] += source[n] * win[j]
        }
      }
    }
    return dest
  }

  static stretch(source, destLength) {
    var dest = new Array(destLength).fill(0)
    var win = this.blackmanHarrisWindow(this.windowLength)
    var halfWinLength = Math.floor(win.length / 2)

    var cutoff = dest.length / source.length
    var ratio = 1 / cutoff

    for (var i = 0; i < dest.length; ++i) {
      var pos = i * ratio
      var floor = Math.floor(pos)
      for (var j = 0; j < win.length; ++j) {
        var n = floor + (j - halfWinLength)
        if (n >= 0 && n < source.length) {
          dest[i] += source[n] * cutoff * this.sinc(cutoff * (pos - n)) * win[j]
        }
      }
    }
    return dest
  }

  static reduce(source, sourceRate, destRate) {
    var ratio = sourceRate / destRate
    var destLength = Math.floor(source.length / ratio)
    var dest = new Array(destLength).fill(0)
    var i = 0
    var j = 0
    while (i < dest.length) {
      dest[i] = source[j]
      j = Math.floor(++i * ratio)
    }
    return dest
  }

  static get windowLength() {
    return 512
  }

  static sinc(x) {
    var a = Math.PI * x
    if (a === 0) {
      return 1
    }
    return Math.sin(a) / a
  }

  // https://en.wikipedia.org/wiki/Window_function
  static blackmanHarrisWindow(size) {
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
}