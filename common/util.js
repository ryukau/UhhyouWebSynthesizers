// Copyright 2022 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

export function clamp(value, low, high) { return Math.max(low, Math.min(value, high)); }
export function lerp(v0, v1, t) { return v0 + t * (v1 - v0); }

export function dbToAmp(dB) { return Math.pow(10, dB / 20); }
export function ampToDB(amplitude) { return 20 * Math.log10(amplitude); }

export function midiPitchToFreq(pitch) { return 440 * Math.pow(2, (pitch - 69) / 12); }
export function freqToMidiPitch(freq) { return 69 + 12 * Math.log2(freq / 440); }

// `v1` and `v2` are in [0, 1).
export function normalDistributionMap(v1, v2, mu = 0, sigma = 1) {
  return sigma * Math.sqrt(-2 * Math.log(1 - v1)) * Math.cos(2 * Math.PI * v2) + mu;
}

// `value` is in [0, 1).
export function uniformDistributionMap(value, low, high) {
  return low + value * (high - low);
}

// `value` is in [0, 1).
// `low` and `high` are integer. Output interval is [low, high].
export function uniformIntDistributionMap(value, low, high) {
  return Math.floor(low + value * (high + 1 - low));
}

export function exponentialMap(value, low, high) {
  const logL = Math.log2(low);
  const logH = Math.log2(high);
  return Math.pow(2, logL + value * (logH - logL));
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
