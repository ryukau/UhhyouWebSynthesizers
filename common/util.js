// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

//
// Don't import any other code to avoid circular dependency.
//

export function clamp(value, low, high) { return Math.max(low, Math.min(value, high)); }
export function lerp(v0, v1, t) { return v0 + t * (v1 - v0); }

export function dbToAmp(dB) { return Math.pow(10, dB / 20); }
export function ampToDB(amplitude) { return 20 * Math.log10(amplitude); }

export function midiPitchToFreq(pitch) { return 440 * Math.pow(2, (pitch - 69) / 12); }
export function freqToMidiPitch(freq) { return 69 + 12 * Math.log2(freq / 440); }

export const syntonicCommaRatio = 81 / 80;
export const syntonicCommaCents = Math.log2(81 / 80) * 1200;

// `v1` and `v2` are in [0, 1).
export function normalDistributionMap(v1, v2, mu = 0, sigma = 1) {
  return sigma * Math.sqrt(-2 * Math.log(1 - v1)) * Math.cos(2 * Math.PI * v2) + mu;
}

// `value` is in [0, 1).
export function uniformFloatMap(value, low, high) { return low + value * (high - low); }

// `value` is in [0, 1).
export function triangleDistributionMap(v1, v2, low, high) {
  return low + 0.5 * (high - low) * (v1 + v2);
}

// `value` is in [0, 1).
// `low` and `high` are integer. Output interval is [low, high].
export function uniformIntMap(value, low, high) {
  return Math.floor(low + value * (high + 1 - low));
}

// `value` is in [0, 1).
export function exponentialMap(value, low, high) {
  const logL = Math.log2(low);
  const logH = Math.log2(high);
  return Math.pow(2, logL + value * (logH - logL));
}

// Shuffle `array` only in range of [start, end), in-place. `end` is exclusive.
export function shuffleArray(rng, array, start, end) {
  if (start === undefined) start = 0;
  if (end === undefined) end = array.length;

  for (let i = start; i < end - 1; ++i) {
    const j = start + Math.floor(rng.number() * (end - start));
    const tmp = array[i];
    array[i] = array[j];
    array[j] = tmp;
  }
  return array;
}

// `x` in [0, 1].
export function superellipse(x, n) { return x < 0 ? 1 : (1 - x ** n) ** (1 / n); }

export function chebyshev1_2(x) { return 2 * x * x; }
export function chebyshev1_3(x) { return 4 * x * x * x - 3 * x; }
export function chebyshev1_4(x) { return 8 * x * x * x * x - 8 * x * x; }
export function chebyshev1_5(x) {
  return 16 * x * x * x * x * x - 20 * x * x * x + 5 * x;
}

// Range of t is in [0, 1]. Interpoltes between y1 and y2.
// y0 is current, y3 is earlier sample.
export function lagrange3Interp(y0, y1, y2, y3, t) {
  const u = 1 + t;
  const d0 = y0 - y1;
  const d1 = d0 - (y1 - y2);
  const d2 = d1 - ((y1 - y2) - (y2 - y3));
  return y0 - u * (d0 + (1 - u) / 2 * (d1 + (2 - u) / 3 * d2));
}

// `a` is an array of polynomial coefficients.
// `x` in [0, 1].
export function computePolynomial(x, a) {
  if (a.length <= 0) return 0;
  let v = a.at(-1);
  for (let i = a.length - 2; i >= 0; --i) v = v * x + a[i];
  return v;
}

// Frequency ratio of circular membrane modes. Generated using
// `MaybeSnare/circularmembranemode.py`.
export const circularModes = [
  1.00000000000000,   1.593340505695112,  2.1355487866494034, 2.295417267427694,
  2.6530664045492145, 2.9172954551172228, 3.155464815408362,  3.5001474903090264,
  3.5984846739581138, 3.6474511791052775, 4.058931883331434,  4.131738159726707,
  4.230439127905234,  4.6010445344331075, 4.610051645437306,  4.831885262930598,
  4.903280573212368,  5.1307689067016575, 5.412118429982582,  5.5403985098530635,
  5.650842376925684,  5.976540221648715,  6.152609171589257,  6.1631367313038865,
  6.208732130572546,  6.528612451522295,  6.746213299505839,  6.848991602808508,
  7.0707081490386905, 7.325257332462771,  7.468242109085181,  7.514500962483965,
  7.604536126938166,  7.892520026843893,  8.071028338967128,  8.1568737689496,
  8.45000551018646,   8.66047555520746,   8.781093075730398,  8.820447105611922,
  8.999214496283312,  9.238840557670077,  9.390589484063241,  9.464339027734203,
  9.807815107462856,  9.98784275554081,   10.092254814868133, 10.126502295693772,
  10.368705458854519, 10.574713443493692, 10.706875023386747, 10.77153891878896,
  11.152639282954734, 11.310212368186301, 11.402312929615599, 11.722758172320448,
  11.903823217314876, 12.020976194473256, 12.48894011894477,  12.6291936518746,
  13.066558649839825, 13.228284530761863, 13.819314942198952, 14.40316086180383
];

export class DebugProbe {
  constructor(label) {
    this.label = label;
    this.frame = 0;

    this.min = {value: Number.POSITIVE_INFINITY, frame: -1};
    this.max = {value: Number.NEGATIVE_INFINITY, frame: -1};

    this.firstNonFinite = {value: 0, frame: -1};
  }

  print() {
    let text = `--- ${this.label} (Signal Debugger)
min: ${this.min.value} at frame ${this.min.frame}
max: ${this.max.value} at frame ${this.max.frame}`;

    if (this.firstNonFinite.frame >= 0) {
      text += `\nNon finite number at ${label}, in frame ${this.frame}`;
    }

    console.log(text);
  }

  process(input) {
    if (!Number.isFinite(input)) {
      this.firstNonFinite.value = input;
      this.firstNonFinite.frame = this.frame;
      this.observedNonFinite = true;
    }

    if (input < this.min.value) {
      this.min.value = input;
      this.min.frame = this.frame;
    }
    if (input > this.max.value) {
      this.max.value = input;
      this.max.frame = this.frame;
    }

    ++this.frame;
    return input;
  }
}

export function getTimeStamp() {
  const date = new Date();

  const Y = `${date.getFullYear()}`.padStart(4, "0");
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  const H = `${date.getHours()}`.padStart(2, "0");
  const M = `${date.getMinutes()}`.padStart(2, "0");
  const S = `${date.getSeconds()}`.padStart(2, "0");
  const milli = `${date.getMilliseconds()}`.padStart(3, "0");

  const localTime = `${Y}-${m}-${d}T${H}${M}${S}.${milli}`;

  const tzOffsetMinute = -date.getTimezoneOffset();
  if (tzOffsetMinute === 0) return `${localTime}Z`;
  const tzSign = tzOffsetMinute < 0 ? "-" : "+";
  const tzHour = `${Math.floor(Math.abs(tzOffsetMinute) / 60)}`.padStart(2, "0");
  const tzMinute = `${Math.abs(tzOffsetMinute) % 60}`.padStart(2, "0");
  return `${localTime}${tzSign}${tzHour}${tzMinute}`;
}
