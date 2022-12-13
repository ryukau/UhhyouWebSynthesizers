/*
    This file is translated from OscilGen.cpp of yoshimi, which is under GPL
    version 2 or any later version.

    Original ZynAddSubFX author Nasca Octavian Paul
    Copyright (C) 2002-2005 Nasca Octavian Paul
    Copyright 2009-2011 Alan Calvert
    Copyright 2009 James Morris
    Copyright 2016-2018 Will Godfrey & others
*/

// lib/fft.jsに依存。

const TWOPI = 2 * Math.PI
const HALFPI = Math.PI / 2
const halfoscilsize = 512

function pulse(x, a) {
  return ((x % 1.0) < Math.abs(a)) ? -1.0 : 1.0
}

function saw(x, a) {
  if (a < 0.00001)
    a = 0.00001
  else if (a > 0.99999)
    a = 0.99999
  x = (x % 1.0)
  if (x < a)
    return x / a * 2.0 - 1.0
  else
    return (1.0 - x) / (1.0 - a) * 2.0 - 1.0
}

function triangle(x, a) {
  x = (x + 0.25) % 1.0
  a = 1 - a
  if (a < 0.00001)
    a = 0.00001
  if (x < 0.5)
    x = x * 4.0 - 1.0
  else
    x = (1.0 - x) * 4.0 - 1.0
  x /= -a
  if (x < -1.0)
    x = - 1.0
  if (x > 1.0)
    x = 1.0
  return x
}

function power(x, a) {
  x = (x % 1.0)
  if (a < 0.00001)
    a = 0.00001
  else if (a > 0.99999)
    a = 0.99999
  return Math.pow(x, (Math.exp((a - 0.5) * 10.0))) * 2.0 - 1.0
}

function gauss(x, a) {
  x = (x % 1.0) * 2.0 - 1.0
  if (a < 0.00001)
    a = 0.00001
  return Math.exp(-x * x * (Math.exp(a * 8.0) + 5.0)) * 2.0 - 1.0
}

function diode(x, a) {
  if (a < 0.00001)
    a = 0.00001
  else if (a > 0.99999)
    a = 0.99999
  a = a * 2.0 - 1.0
  x = Math.cos((x + 0.5) * TWOPI) - a
  if (x < 0.0)
    x = 0.0
  return x / (1.0 - a) * 2.0 - 1.0
}

function abssine(x, a) {
  x = x % 1.0
  if (a < 0.00001)
    a = 0.00001
  else if (a > 0.99999)
    a = 0.99999
  return Math.sin(Math.pow(x, (Math.exp((a - 0.5) * 5.0))) * Math.PI) * 2.0 - 1.0
}

function pulsesine(x, a) {
  if (a < 0.00001)
    a = 0.00001
  x = ((x % 1.0) - 0.5) * Math.exp((a - 0.5) * Math.log(128.0))
  if (x < -0.5)
    x = -0.5
  else if (x > 0.5)
    x = 0.5
  x = Math.sin(x * TWOPI)
  return x
}

function stretchsine(x, a) {
  x = ((x + 0.5) % 1.0) * 2.0 - 1.0
  a = (a - 0.5) * 4.0
  if (a > 0.0)
    a *= 2.0
  a = Math.pow(3.0, a)
  var b = Math.pow(Math.abs(x), a)
  if (x < 0.0)
    b = -b
  return -Math.sin(b * Math.PI)
}

function chirp(x, a) {
  x = ((x) % (1.0)) * TWOPI
  a = (a - 0.5) * 4.0
  if (a < 0.0)
    a *= 2.0
  a = Math.pow(3.0, a)
  return Math.sin(x / 2.0) * Math.sin(a * x * x)
}

function absstretchsine(x, a) {
  x = ((x + 0.5) % (1.0)) * 2.0 - 1.0
  a = (a - 0.5) * 9.0
  a = Math.pow(3.0, a)
  var b = Math.pow(Math.abs(x), a)
  if (x < 0.0)
    b = -b
  return -Math.pow(Math.sin(b * Math.PI), 2.0)
}

function chebyshev(x, a) {
  a = a * a * a * 30.0 + 1.0
  return Math.cos(Math.acos(x * 2.0 - 1.0) * a)
}

function sqr(x, a) {
  a = a * a * a * a * 160.0 + 0.001
  return -Math.atan(Math.sin(x * TWOPI) * a)
}

function spike(x, a) {
  // The idea is to discard the signal outside of range [0.5 - b/2, 0.5 + b/2].
  // Then transform residue to some audible signal.
  var b = Math.abs(a * 0.6666666666666666) + 0.01
  if (x < 0.5) {
    if (x < 0.5 - b / 2) {
      return 0.0
    }
    else {
      x = (x + b / 2 - 0.5) * 2 / b
      return x * 2 / b
    }
  }
  if (x > 0.5 + b / 2) {
    return 0.0
  }
  x = (x - 0.5) * 2 / b
  return (1 - x) * 2 / b
}

function circle(x, a) {
  // a is parameter: 0 -> 0.5 -> 1 // O.5 = circle

  var b = 2 - (a * 2) // b goes from 2 to 0
  x = x * 4

  var y
  if (x < 2) {
    x = x - 1 // x goes from -1 to 1
    if ((x < -b) || (x > b))
      y = 0
    else
      y = Math.sqrt(1 - (Math.pow(x, 2) / Math.pow(b, 2))) // normally * a^2, but a stays 1
  }
  else {
    x = x - 3 // x goes from -1 to 1 as well
    if ((x < -b) || (x > b))
      y = 0
    else
      y = -Math.sqrt(1 - (Math.pow(x, 2) / Math.pow(b, 2)))
  }
  return y
}

function selectOscFunc(oscType) {
  switch (oscType) {
    case 1:
      return triangle
      break

    case 2:
      return pulse
      break

    case 3:
      return saw
      break

    case 4:
      return power
      break

    case 5:
      return gauss
      break

    case 6:
      return diode
      break

    case 7:
      return abssine
      break

    case 8:
      return pulsesine
      break

    case 9:
      return stretchsine
      break

    case 10:
      return chirp
      break

    case 11:
      return absstretchsine
      break

    case 12:
      return chebyshev
      break

    case 13:
      return sqr
      break

    case 14:
      return spike
      break

    case 15:
      return circle
      break

    default:
      break
  }
  return (x, a) => -Math.sin(TWOPI * x)
}

// Pbasefuncmodulation in getbasefunction
function makeTimeTable(length, type, p1, p2, p3) {
  var tFunc = (t) => t
  switch (type) {
    case 1: // rev
      p1 = (Math.pow(2.0, p1 * 5.0) - 1.0) / 10.0
      p3 = Math.floor((Math.pow(2.0, p3 * 5.0) - 1.0))
      if (p3 < 0.9999)
        p3 = -1.0
      tFunc = (t, p1, p2, p3) => {
        return t * p3 + Math.sin((t + p2) * TWOPI) * p1
      }
      break

    case 2: // sine
      p1 = (Math.pow(2.0, p1 * 5.0) - 1.0) / 10.0
      p3 = 1.0 + Math.floor((Math.pow(2.0, p3 * 5.0) - 1.0))
      tFunc = (t, p1, p2, p3) => {
        return t + Math.sin((t * p3 + p2) * TWOPI * p1)
      }
      break

    case 3: // power
      p1 = (Math.pow(2.0, p1 * 7.0) - 1.0) / 10.0
      p3 = 0.01 + (Math.pow(2.0, p3 * 16.0) - 1.0) / 10.0
      tFunc = (t, p1, p2, p3) => {
        return t + Math.pow(((1 - Math.cos((t + p2) * TWOPI)) * 0.5), p3) * p1
      }
      break

    default: // none
      break
  }

  var time = new Array(length)
  for (var i = 0; i < time.length; ++i) {
    var t = tFunc(i / length, p1, p2, p3)
    time[i] = t - Math.floor(t)
  }
  return time
}

// oscilfilter
function trunc(arg) {
  return (arg > 0) ? Math.floor(arg) : Math.ceil(arg)
}

function oscilfilter(spectrum, type, p1, p2) {
  if (type === 0)
    return
  var par = 1.0 - p1
  var par2 = p2
  var max = 0.0
  var tmp = 0.0

  for (var i = 1; i < halfoscilsize; ++i) {
    var gain = 1.0
    switch (type) {
      case 1: // lp
        gain = Math.pow((1.0 - par * par * par * 0.99), i)
        tmp = par2 * par2 * par2 * par2 * 0.5 + 0.0001
        if (gain < tmp)
          gain = Math.pow(gain, 10.0) / Math.pow(tmp, 9.0)
        break

      case 2: // hp1
        gain = 1.0 - Math.pow((1.0 - par * par), (i + 1))
        gain = Math.pow(gain, (par2 * 2.0 + 0.1))
        break

      case 3: // hp1b
        if (par < 0.2)
          par = par * 0.25 + 0.15
        gain = 1.0 - Math.pow(1.0 - par * par * 0.999 + 0.001,
          i * 0.05 * i + 1.0)
        tmp = Math.pow(5.0, (par2 * 2.0))
        gain = Math.pow(gain, tmp)
        break

      case 4: // bp1
        gain = (i + 1) - Math.pow(2.0, ((1.0 - par) * 7.5))
        gain = 1.0 / (1.0 + gain * gain / (i + 1.0))
        tmp = Math.pow(5.0, (par2 * 2.0))
        gain = Math.pow(gain, tmp)
        if (gain < 1e-5)
          gain = 1e-5
        break

      case 5: // bs1
        gain = i + 1 - Math.pow(2.0, (1.0 - par) * 7.5)
        gain = Math.pow(Math.atan(gain / (i / 10.0 + 1.0)) / 1.57, 6.0)
        gain = Math.pow(gain, (par2 * par2 * 3.9 + 0.1))
        break

      case 6: // lp2
        tmp = Math.pow(par2, 0.33)
        gain = (i + 1 > Math.pow(2.0, (1.0 - par) * 10.0) ? 0.0 : 1.0)
          * par2 + (1.0 - par2)
        break

      case 7: // hp2
        tmp = Math.pow(par2, 0.33)
        gain = (i + 1 > Math.pow(2.0, (1.0 - par) * 7.0) ? 1.0 : 0.0)
          * par2 + (1.0 - par2)
        if (p1 == 0)
          gain = 1.0
        break

      case 8: // bp2
        tmp = Math.pow(par2, 0.33)
        gain = (
          Math.abs(Math.pow(2.0, (1.0 - par) * 7.0) - i) > i / 2 + 1
            ? 0.0 : 1.0
        ) * par2 + (1.0 - par2)
        break

      case 9: // bs2
        tmp = Math.pow(par2, 0.33)
        gain = (
          Math.abs(Math.pow(2.0, (1.0 - par) * 7.0) - i) < i / 2 + 1
            ? 0.0 : 1.0
        ) * par2 + (1.0 - par2)
        break

      case 10: // cos
        tmp = Math.pow(5.0, par2 * 2.0 - 1.0)
        tmp = Math.pow((i / 32.0), tmp) * 32.0
        if (p2 == 64)
          tmp = i
        gain = Math.cos(par * par * HALFPI * tmp)
        gain *= gain
        break

      case 11: // sin
        tmp = Math.pow(5.0, par2 * 2.0 - 1.0)
        tmp = Math.pow((i / 32.0), tmp) * 32.0
        if (p2 == 64)
          tmp = i
        gain = Math.sin(par * par * HALFPI * tmp)
        gain *= gain
        break

      case 12: // low shelf
        var a = 1.0 - par + 0.2
        var x = i / (64.0 * a * a)
        x = (x > 1.0) ? 1.0 : x
        tmp = Math.pow(1.0 - par2, 2.0)
        gain = Math.cos(x * Math.PI) * (1.0 - tmp) + 1.01 + tmp
        break

      case 13:
        tmp = trunc(Math.pow(2.0, ((1.0 - par) * 7.2)))
        gain = 1.0
        if (i == tmp)
          gain = Math.pow(2.0, par2 * par2 * 8.0)
        break
    }

    spectrum.real[i] *= gain
    spectrum.imag[i] *= gain
    var tmp = spectrum.real[i] * spectrum.real[i]
      + spectrum.imag[i] * spectrum.imag[i]
    if (max < tmp)
      max = tmp
  }

  max = Math.sqrt(max)
  if (max < 1e-10)
    max = 1.0
  var imax = 1.0 / max
  for (var i = 1; i < halfoscilsize; ++i) {
    spectrum.real[i] *= imax
    spectrum.imag[i] *= imax
  }
}

// shiftharmonics
function shiftharmonics(spectrum, shift) {
  if (shift == 0)
    return

  var hc, hs
  var harmonicshift = -shift

  if (harmonicshift > 0) {
    for (var i = halfoscilsize - 2; i >= 0; i--) {
      var oldh = i - harmonicshift
      if (oldh < 0)
        hc = hs = 0.0
      else {
        hc = spectrum.imag[oldh + 1]
        hs = spectrum.real[oldh + 1]
      }
      spectrum.imag[i + 1] = hc
      spectrum.real[i + 1] = hs
    }
  }
  else {
    for (var i = 0; i < halfoscilsize - 1; ++i) {
      var oldh = i + Math.abs(harmonicshift)
      if (oldh >= halfoscilsize - 1)
        hc = hs = 0.0
      else {
        hc = spectrum.imag[oldh + 1]
        hs = spectrum.real[oldh + 1]

        if (Math.abs(hc) < Number.EPSILON) hc = 0.0
        if (Math.abs(hs) < Number.EPSILON) hs = 0.0
      }

      spectrum.imag[i + 1] = hc
      spectrum.real[i + 1] = hs
    }
  }

  spectrum.imag[0] = 0.0
}

// adaptiveharmonic
function adaptiveharmonic(
  f,
  freq,
  Padaptiveharmonicsbasefreq,
  Padaptiveharmonicspower
) {
  if (freq < 1.0)
    freq = 440.0

  var inf = {
    real: new Array(halfoscilsize),
    imag: new Array(halfoscilsize),
  }
  for (var i = 0; i < halfoscilsize; ++i) {
    inf.real[i] = f.real[i]
    inf.imag[i] = f.imag[i]
    f.real[i] = f.imag[i] = 0.0
  }
  inf.imag[0] = inf.real[0] = 0.0

  var hc = 0.0
  var hs = 0.0
  var basefreq = 30.0 * Math.pow(10.0, Padaptiveharmonicsbasefreq)
  var power = (Padaptiveharmonicspower * 127 + 1.0) / 101.0
  var rap = Math.pow(freq / basefreq, power)
  var down = false
  if (rap > 1.0) {
    rap = 1.0 / rap
    down = true
  }

  for (var i = 0; i < halfoscilsize - 2; ++i) {
    var h = i * rap
    var high = trunc(i * rap) // integer part.
    var low = h % 1.0 // fractional part.

    if (high >= halfoscilsize - 2) {
      break
    }
    else {
      if (down) {
        f.imag[high] += inf.imag[i] * (1.0 - low)
        f.real[high] += inf.real[i] * (1.0 - low)
        f.imag[high + 1] += inf.imag[i] * low
        f.real[high + 1] += inf.real[i] * low
      }
      else {
        hc = inf.imag[high] * (1.0 - low) + inf.imag[high + 1] * low
        hs = inf.real[high] * (1.0 - low) + inf.real[high + 1] * low

        if (Math.abs(hc) < Number.EPSILON) hc = 0.0
        if (Math.abs(hs) < Number.EPSILON) hs = 0.0
      }
    }

    if (!down) {
      if (i == 0) { //corect the amplitude of the first harmonic
        hc *= rap
        hs *= rap
      }
      f.imag[i] = hc
      f.real[i] = hs
    }
  }

  f.imag[1] += f.imag[0]
  f.real[1] += f.real[0]
  f.imag[0] = f.real[0] = 0.0
}

function toSpectrum(signal) {
  const fft = new FFT(signal.length)

  var array = fft.createComplexArray() // [real0, imag0, real1, imag1, ...]
  fft.realTransform(array, signal)

  spectrum = {
    real: new Array(signal.length),
    imag: new Array(signal.length),
  }
  for (var i = 0; i < spectrum.real.length; ++i) {
    spectrum.real[i] = array[2 * i]
    spectrum.imag[i] = array[2 * i + 1]
  }
  return spectrum
}

function toSignal(spectrum) {
  const fft = new FFT(spectrum.real.length)

  var array = fft.createComplexArray()
  for (var i = 0; i < spectrum.real.length; ++i) {
    array[2 * i] = spectrum.real[i]
    array[2 * i + 1] = spectrum.imag[i]
  }

  var signalComplex = fft.createComplexArray()
  fft.inverseTransform(signalComplex, array)

  var signal = new Array(spectrum.real.length)
  for (var i = 0; i < signal.length; ++i) {
    signal[i] = signalComplex[i * 2]
  }
  return signal
}

// #oscType
// 0: sine, 1: triangle, 2: pulse, 3: saw, 4: power, 5: gauss, 6: diode,
// 7: abssine, 8: pulsesine, 9: stretchsine, 10: chirp, 11: absstretchsine,
// 12: chebyshev, 13: sqr, 14: spike, 15: circle
//
// #modulationType
// 0: none, 1: rev, 2: sine, 3: power
//
// #filtType
// 0: none, 1: lp1, 2: hp1a, 3: hp1b, 4: bp1, 5: bs1, 6: lp2, 7: hp2, 8: bp2,
// 9: bs2, 10: cos, 11: sin, 12: low shelf, 13: S (peaking)
//
// lp: low-pass, hp: high-pass, bp: band-pass, bs: band-stop
//
function renderWaveTable(
  freqhz,
  oscType,
  oscP1,
  modulationType,
  modP1,
  modP2,
  modP3,
  filtType,
  filtCutoff,
  filtQ,
  harmonicshift,
  adapt,
  adaptBaseFreq,
  adaptPower,
  overtone
) {
  var oscFunc = selectOscFunc(oscType)
  var timeTable = makeTimeTable(halfoscilsize, modulationType, modP1, modP2, modP3)
  var table = new Array(timeTable.length).fill(0)

  for (var i = 0; i < overtone.length; ++i) {
    if (overtone[i] === 0) continue
    var step = i + 1
    var phase = 0
    for (var j = 0; j < table.length; ++j) {
      phase += step
      table[j] += overtone[i] * oscFunc(timeTable[phase % table.length], oscP1)
    }
  }

  for (var i = 0; i < table.length; ++i) {
    table[i] /= overtone.length
  }

  var spec = toSpectrum(table)
  oscilfilter(spec, filtType, filtCutoff, filtQ)
  shiftharmonics(spec, harmonicshift)
  if (adapt) adaptiveharmonic(spec, freqhz, adaptBaseFreq, adaptPower)
  return spec
}

// Yoshimi のパラメータを直接入力するときに使う。
function renderWaveTableYoshimiParams(
  freqhz,
  oscType,
  oscP1,
  modulationType,
  modP1,
  modP2,
  modP3,
  filtType,
  filtCutoff,
  filtQ,
  harmonicshift,
  adapt,
  adaptBaseFreq,
  adaptPower
) {
  oscP1 += 64
  return render(
    freqhz,
    oscType,
    oscP1 === 64 ? 0.5 : (oscP1 + 0.5) / 128,
    modulationType,
    modP1 / 127,
    modP2 / 127,
    modP3 / 127,
    filtType,
    filtCutoff / 128.0,
    filtQ / 127.0,
    harmonicshift,
    adapt,
    adaptBaseFreq / 128.0,
    adaptPower / 127
  )
}
