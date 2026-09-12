// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

/*
IIR filters in modified `scipy.signal` sos format. Sos stands for second order sections.

Sos format is `[b0, b1, b2, a1, a2]`. It represents following transfer function:

```
        b0 + b1*z^-1 + b2*z^-2
H(z) = ------------------------
         1 + a1*z^-1 + a2*z^-2
```

To construct filter from sos, use `SosFilterImmediate`. `SosFilterMultiRate` in
`multirate.js` is also used, if latency is acceptable.

Common parameter:
- `cutoffNormalized`: cutoffHz / sampleRate.
- `gainAmp`: 10^(decibel / 20).

Reference:
- https://www.w3.org/TR/audio-eq-cookbook/
- https://ryukau.github.io/filter_notes/matched_iir_filter/matched_iir_filter.html
*/

import {clamp} from "../util.js";

// Transposed direct form II.
export class SosFilterImmediate {
  #v1;
  #v2;

  //
  // Format: coefficent = [[b0, b1, b2, a1, a2], ...].
  //
  // Transfer function of a second order section (sos):
  // H(z) = (b0 + b1 * z^-1 + b2 * z^-2) / (1 + a1 * z^-1 + a2 * z^-2).
  //
  constructor(coefficent) {
    this.co = structuredClone(coefficent);
    if (typeof this.co[0] === "number") this.co = [this.co];

    for (let i = 0; i < this.co.length; ++i) { // `scipy.signal` sos format case.
      if (this.co[i].length == 6) this.co[i].splice(3, 1);
    }

    if (this.co.length > 0 && this.co[0].length != 5) {
      console.error("SosFilterImmediate coefficient is ill formatted.", this.co);
    }

    this.#v1 = new Array(this.co.length).fill(0);
    this.#v2 = new Array(this.co.length).fill(0);
  }

  reset() {
    this.#v1.fill(0);
    this.#v2.fill(0);
  }

  process(input) {
    for (let i = 0; i < this.co.length; ++i) {
      const co = this.co[i];
      const y0 = co[0] * input + this.#v1[i];

      this.#v1[i] = co[1] * input - co[3] * y0 + this.#v2[i];
      this.#v2[i] = co[2] * input - co[4] * y0;

      input = y0;
    }
    return input;
  }
}

// Direct form I.
export class SosFilterImmediateDF1 {
  #x1;
  #x2;
  #y1;
  #y2;

  // Refer to `SosFilterImmediate` for the format of `coefficent`.
  constructor(coefficent) {
    this.co = structuredClone(coefficent);
    if (typeof this.co[0] === "number") this.co = [this.co];

    for (let i = 0; i < this.co.length; ++i) { // `scipy.signal` sos format case.
      if (this.co[i].length == 6) this.co[i].splice(3, 1);
    }

    if (this.co.length > 0 && this.co[0].length != 5) {
      console.error("SosFilterImmediateDirectFormI coefficient is ill formatted.", this.co);
    }

    this.#x1 = new Array(this.co.length).fill(0);
    this.#x2 = new Array(this.co.length).fill(0);
    this.#y1 = new Array(this.co.length).fill(0);
    this.#y2 = new Array(this.co.length).fill(0);
  }

  reset() {
    this.#x1.fill(0);
    this.#x2.fill(0);
    this.#y1.fill(0);
    this.#y2.fill(0);
  }

  process(input) {
    for (let i = 0; i < this.co.length; ++i) {
      const y0 = this.co[i][0] * input + this.co[i][1] * this.#x1[i] + this.co[i][2] * this.#x2[i]
        - this.co[i][3] * this.#y1[i] - this.co[i][4] * this.#y2[i];

      this.#x2[i] = this.#x1[i];
      this.#x1[i] = input;
      this.#y2[i] = this.#y1[i];
      this.#y1[i] = y0;

      input = y0;
    }
    return input;
  }
}

function getBiquadQParam(cutoffNormalized, Q) {
  const ω0 = 2 * Math.PI * cutoffNormalized;
  const cs = Math.cos(ω0);
  const α = Math.sin(ω0) / (2 * Q);
  return [ω0, cs, α];
}

export function sosBiquadLowpass(cutoffNormalized, Q) {
  const [ω0, cs, α] = getBiquadQParam(cutoffNormalized, Q);
  const b0 = (1 - cs) / 2;
  const b1 = 1 - cs;
  const b2 = (1 - cs) / 2;
  const a0 = 1 + α;
  const a1 = -2 * cs;
  const a2 = 1 - α;
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}

export function sosBiquadHighpass(cutoffNormalized, Q) {
  const [ω0, cs, α] = getBiquadQParam(cutoffNormalized, Q);
  const b0 = (1 + cs) / 2;
  const b1 = -(1 + cs);
  const b2 = (1 + cs) / 2;
  const a0 = 1 + α;
  const a1 = -2 * cs;
  const a2 = 1 - α;
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}

// Peak gain = Q.
export function sosBiquadBandpass(cutoffNormalized, Q) {
  const [ω0, cs, α] = getBiquadQParam(cutoffNormalized, Q);
  const b0 = Q * α;
  const b1 = 0;
  const b2 = -Q * α;
  const a0 = 1 + α;
  const a1 = -2 * cs;
  const a2 = 1 - α;
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}

export function sosBiquadAllpass(cutoffNormalized, Q) {
  const [ω0, cs, α] = getBiquadQParam(cutoffNormalized, Q);
  const b0 = 1 - α;
  const b1 = -2 * cs;
  const b2 = 1 + α;
  const a0 = 1 + α;
  const a1 = -2 * cs;
  const a2 = 1 - α;
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}

function getBiquadBwParam(cutoffNormalized, bandWidth, gainAmp = 1) {
  const ω0 = 2 * Math.PI * cutoffNormalized;
  const cs = Math.cos(ω0);
  const sn = Math.sin(ω0);
  const A = Math.sqrt(gainAmp);
  const α = sn * Math.sinh((Math.log(2) * bandWidth * ω0) / (2 * sn));
  return [ω0, cs, sn, A, α];
}

// Peak gain = 0 dB.
export function sosBiquadBandpassNormalized(cutoffNormalized, bandWidth) {
  const [ω0, cs, sn, A, α] = getBiquadBwParam(cutoffNormalized, bandWidth, 0);
  const b0 = α;
  const b1 = 0;
  const b2 = -α;
  const a0 = 1 + α;
  const a1 = -2 * cs;
  const a2 = 1 - α;
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}

export function sosBiquadNotch(cutoffNormalized, bandWidth) {
  const [ω0, cs, sn, A, α] = getBiquadBwParam(cutoffNormalized, bandWidth, 0);
  const b0 = 1;
  const b1 = -2 * cs;
  const b2 = 1;
  const a0 = 1 + α;
  const a1 = -2 * cs;
  const a2 = 1 - α;
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}

export function sosBiquadPeak(cutoffNormalized, bandWidth, gainAmp) {
  const [ω0, cs, sn, A, α] = getBiquadBwParam(cutoffNormalized, bandWidth, gainAmp);
  const b0 = 1 + α * A;
  const b1 = -2 * cs;
  const b2 = 1 - α * A;
  const a0 = 1 + α / A;
  const a1 = -2 * cs;
  const a2 = 1 - α / A;
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}

function getBiquadSlopeParam(cutoffNormalized, slope, gainAmp = 1) {
  const ω0 = 2 * Math.PI * cutoffNormalized;
  const cs = Math.cos(ω0);
  const sn = Math.sin(ω0);
  const A = Math.sqrt(gainAmp) * Math.SQRT1_2;
  const α = 0.5 * sn * Math.sqrt((A + 1 / A) * (1 / slope - 1) + 2);
  const B = 2 * Math.sqrt(A) * α;
  return [ω0, cs, sn, A, α, B];
}

export function sosBiquadLowShelf(cutoffNormalized, slope, gainAmp) {
  const [ω0, cs, sn, A, α, B] = getBiquadSlopeParam(cutoffNormalized, slope, gainAmp);
  const b0 = A * ((A + 1) - (A - 1) * cs + B);
  const b1 = 2 * A * ((A - 1) - (A + 1) * cs);
  const b2 = A * ((A + 1) - (A - 1) * cs - B);
  const a0 = (A + 1) + (A - 1) * cs + B;
  const a1 = -2 * ((A - 1) + (A + 1) * cs);
  const a2 = (A + 1) + (A - 1) * cs - B;
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}

export function sosBiquadHighShelf(cutoffNormalized, slope, gainAmp) {
  const [ω0, cs, sn, A, α, B] = getBiquadSlopeParam(cutoffNormalized, slope, gainAmp);
  const b0 = A * ((A + 1) + (A - 1) * cs + B);
  const b1 = -2 * A * ((A - 1) + (A + 1) * cs);
  const b2 = A * ((A + 1) - (A - 1) * cs - B);
  const a0 = (A + 1) - (A - 1) * cs + B;
  const a1 = 2 * ((A - 1) - (A + 1) * cs);
  const a2 = (A + 1) - (A - 1) * cs - B;
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}

function getMatchedFilterParams(cutoffNormalized, Q) {
  const ω0 = 2 * Math.PI * cutoffNormalized;

  const q = 0.5 / Q;
  let a1 = -2 * Math.exp(-q * ω0);
  if (q <= 1)
    a1 *= Math.cos(Math.sqrt(1 - q * q) * ω0);
  else
    a1 *= Math.cosh(Math.sqrt(q * q - 1) * ω0);
  const a2 = Math.exp(-2 * q * ω0);

  const sn = Math.sin(ω0 / 2);
  const φ0 = 1 - sn * sn;
  const φ1 = sn * sn;
  const φ2 = 4 * φ0 * φ1;

  const A0 = (1 + a1 + a2) ** 2;
  const A1 = (1 - a1 + a2) ** 2;
  const A2 = -4 * a2;

  return [ω0, a1, a2, φ0, φ1, φ2, A0, A1, A2];
}

export function sosMatchedLowpass(cutoffNormalized, Q) {
  const [ω0, a1, a2, φ0, φ1, φ2, A0, A1, A2] = getMatchedFilterParams(cutoffNormalized, Q);

  const sqrt_B0 = 1 + a1 + a2;
  const B0 = A0;

  const R1 = Q * Q * (A0 * φ0 + A1 * φ1 + A2 * φ2);
  const B1 = (R1 - B0 * φ0) / φ1;

  const b0 = 0.5 * (sqrt_B0 + Math.sqrt(B1));
  const b1 = sqrt_B0 - b0;

  return [b0, b1, 0, a1, a2];
}

export function sosMatchedHighpass(cutoffNormalized, Q) {
  const [ω0, a1, a2, φ0, φ1, φ2, A0, A1, A2] = getMatchedFilterParams(cutoffNormalized, Q);

  const b0 = Q * Math.sqrt(A0 * φ0 + A1 * φ1 + A2 * φ2) / (4 * φ1);
  const b1 = -2 * b0;
  const b2 = b0;

  return [b0, b1, b2, a1, a2];
}

export function sosMatchedBandpass(cutoffNormalized, Q) {
  const [ω0, a1, a2, φ0, φ1, φ2, A0, A1, A2] = getMatchedFilterParams(cutoffNormalized, Q);

  const R1 = A0 * φ0 + A1 * φ1 + A2 * φ2;
  const R2 = -A0 + A1 + 4 * (φ0 - φ1) * A2;

  const B2 = (R1 - R2 * φ1) / (4 * φ1 * φ1);
  const B1 = R2 - 4 * (φ0 - φ1) * B2;

  const b1 = -0.5 * Math.sqrt(B1);
  const b0 = 0.5 * (Math.sqrt(B2 + b1 * b1) - b1);
  const b2 = -b0 - b1;

  return [b0, b1, b2, a1, a2];
}

export function sosMatchedPeak(cutoffNormalized, Q, gainAmp) {
  const [ω0, a1, a2, φ0, φ1, φ2, A0, A1, A2] = getMatchedFilterParams(cutoffNormalized, Q);
  const G = gainAmp;

  const R1 = G * G * (A0 * φ0 + A1 * φ1 + A2 * φ2);
  const R2 = G * G * (-A0 + A1 + 4 * (φ0 - φ1) * A2);

  const B0 = A0;
  const B2 = (R1 - R2 * φ1 - B0) / (4 * φ1 * φ1);
  const B1 = R2 + B0 - 4 * (φ0 - φ1) * B2;

  const sqrt_B0 = 1 + a1 + a2;
  const sqrt_B1 = Math.sqrt(B1);

  const W = 0.5 * (sqrt_B0 + sqrt_B1);
  const b0 = 0.5 * (W + Math.sqrt(W * W + B2));
  const b1 = 0.5 * (sqrt_B0 - sqrt_B1);
  const b2 = -B2 / (4 * b0);

  return [b0, b1, b2, a1, a2];
}

export function sosMatchedHighShelf1(cutoffNormalized, gainAmp) {
  const fc = 2 * cutoffNormalized;
  const G = gainAmp;

  const fm = 0.9;
  const φm = 1 - Math.cos(Math.PI * fm);

  const pp = 2 / (Math.PI * Math.PI);
  const xi = pp / (φm * φm) - 1 / φm;
  const α = xi + pp / (G * fc * fc);
  const β = xi + (pp * G) / (fc * fc);

  const a1 = -α / (1 + α + Math.sqrt(1 + 2 * α));
  const b = -β / (1 + β + Math.sqrt(1 + 2 * β));
  const b0 = (1 + a1) / (1 + b);
  const b1 = b * b0;

  return [b0, b1, 0, a1, 0];
}

export function getSosGain(sos, normalizedFreq, inDecibel = false) {
  const omega = 2 * Math.PI * normalizedFreq;
  const cos_w = Math.cos(omega);
  const sin_w = Math.sin(omega);
  const cos_2w = 2 * cos_w * cos_w - 1;
  const sin_2w = 2 * sin_w * cos_w;

  let re = 1;
  let im = 0;

  for (let i = 0; i < sos.length; ++i) {
    const co = sos[i];

    const num_re = co[0] + co[1] * cos_w + co[2] * cos_2w;
    const num_im = -co[1] * sin_w - co[2] * sin_2w;

    const den_re = 1.0 + co[3] * cos_w + co[4] * cos_2w;
    const den_im = -co[3] * sin_w - co[4] * sin_2w;

    const den_mag2 = den_re * den_re + den_im * den_im;
    if (den_mag2 <= 0) continue;

    const h_re = (num_re * den_re + num_im * den_im) / den_mag2;
    const h_im = (num_im * den_re - num_re * den_im) / den_mag2;

    const next_re = re * h_re - im * h_im;
    const next_im = re * h_im + im * h_re;
    re = next_re;
    im = next_im;
  }

  const gn = Math.sqrt(re * re + im * im);
  return inDecibel ? 20 * Math.log10(Math.max(gn, 1e-12)) : gn;
}

/**
 * Evaluates the maximum amplitude response across all frequencies [0, 0.5].
 * Uses candidates (DC, Nyquist, filter center frequencies) + log grid + golden section refinement.
 */
export function getSosMaxGain(sos, candidateNormalizedFreqs = [], numGridPoints = 128) {
  if (!sos || sos.length === 0) return 1.0;

  let maxGain = 0.0;
  let bestF = 0.0;

  const testFreq = (f) => {
    const cf = clamp(f, 0.0, 0.49999);
    const g = getSosGain(sos, cf, false);
    if (g > maxGain) {
      maxGain = g;
      bestF = cf;
    }
  };

  testFreq(0.0);
  testFreq(0.49999);
  for (let i = 0; i < candidateNormalizedFreqs.length; ++i) {
    testFreq(candidateNormalizedFreqs[i]);
  }

  const logMin = Math.log(10 / 48000);
  const logMax = Math.log(0.49999);
  const step = (logMax - logMin) / numGridPoints;
  for (let i = 0; i <= numGridPoints; ++i) { testFreq(Math.exp(logMin + i * step)); }

  // Golden section refinement around the best candidate
  if (bestF > 0.0001 && bestF < 0.499) {
    const span = bestF * 0.15;
    let a = Math.max(0.0001, bestF - span);
    let b = Math.min(0.4999, bestF + span);
    const rphi = 2.0 - (1.0 + Math.sqrt(5.0)) / 2.0;
    let c = a + rphi * (b - a);
    let d = b - rphi * (b - a);
    let yc = getSosGain(sos, c, false);
    let yd = getSosGain(sos, d, false);

    for (let iter = 0; iter < 8; ++iter) {
      if (yc > yd) {
        b = d;
        d = c;
        yd = yc;
        c = a + rphi * (b - a);
        yc = getSosGain(sos, c, false);
      } else {
        a = c;
        c = d;
        yc = yd;
        d = b - rphi * (b - a);
        yd = getSosGain(sos, d, false);
      }
    }
    maxGain = Math.max(maxGain, yc, yd);
  }

  return maxGain;
}

/**
 * Computes automatic gain adjustment parameters.
 * Mode:
 * - "ceiling": Attenuates only if peak response > ceilingDB (guarantees <= 0 dB in feedback loops).
 * - "normalize": Always scales so the peak response equals ceilingDB.
 * - "none": Applies no automatic gain adjustment.
 */
export function computeSosAutoGain(
  sos,
  candidateNormalizedFreqs = [],
  mode = "ceiling",
  ceilingDB = 0.0,
) {
  if (mode === "none" || !sos || sos.length === 0) {
    return {maxGainAmp: 1.0, maxGainDB: 0.0, autoGainAmp: 1.0, autoGainDB: 0.0};
  }

  const maxGainAmp = getSosMaxGain(sos, candidateNormalizedFreqs);
  const maxGainDB = 20 * Math.log10(Math.max(maxGainAmp, 1e-12));

  let autoGainDB = 0.0;
  if (mode === "ceiling") {
    autoGainDB = maxGainDB > ceilingDB ? ceilingDB - maxGainDB : 0.0;
  } else if (mode === "normalize") {
    autoGainDB = ceilingDB - maxGainDB;
  }

  const autoGainAmp = 10 ** (autoGainDB / 20);
  return {maxGainAmp, maxGainDB, autoGainAmp, autoGainDB};
}

/**
 * Generic serial second-order section (SOS) equalizer with auto-gain support.
 * Replaces PeakingFilterBank.
 */
export class SerialSosEqualizer {
  constructor(sos, options = {}) {
    const {
      autoGain = "none",
      ceilingDB = 0.0,
      candidateNormalizedFreqs = [],
      masterGainDB = 0.0,
    } = options;

    this.sos = sos ?? [];
    this.hasFilter = this.sos.length > 0;
    this.filter = this.hasFilter ? new SosFilterImmediate(this.sos) : null;

    const auto = computeSosAutoGain(this.sos, candidateNormalizedFreqs, autoGain, ceilingDB);
    const masterAmp = 10 ** (masterGainDB / 20);

    this.gain = masterAmp * auto.autoGainAmp;
    this.autoGainDB = auto.autoGainDB;
    this.maxGainDB = auto.maxGainDB;
  }

  reset() { this.filter?.reset(); }

  process(x) {
    const y = this.filter ? this.filter.process(x) : x;
    return y * this.gain;
  }
}

//
// `filterType` format is <type><order><method>.
// For example, lp2bq means lowpass, order 2, biquad.
//
// Filter types:
// - lp: lowpass
// - hp: highpass
// - bp: bandpass
// - ap: allpass
// - nt: notch
// - pk: peak
// - ls: low shelf
// - hs: high shelf
//
// Design method:
// - bq: biquad
// - mt: matched
//
export function selectSosFilter(filterType) {
  switch (filterType) {
    case "lp2bq":
      return (cut, Q, gain = 1) => sosBiquadLowpass(cut, Q);
    case "hp2bq":
      return (cut, Q, gain = 1) => sosBiquadHighpass(cut, Q);
    case "bp2bq":
      return (cut, BW, gain = 1) => sosBiquadBandpassNormalized(cut, BW);
    case "ap2bq":
      return (cut, Q, gain = 1) => sosBiquadAllpass(cut, Q);
    case "nt2bq":
      return (cut, BW, gain = 1) => sosBiquadNotch(cut, BW);
    case "pk2bq":
      return (cut, BW, gain = 1) => sosBiquadPeak(cut, BW, gain);
    case "ls2bq":
      return (cut, slope, gain = 1) => sosBiquadLowShelf(cut, slope, gain);
    case "hs2bq":
      return (cut, slope, gain = 1) => sosBiquadHighShelf(cut, slope, gain);
    case "lp2mt":
      return (cut, Q, gain = 1) => sosMatchedLowpass(cut, Q);
    case "hp2mt":
      return (cut, Q, gain = 1) => sosMatchedHighpass(cut, Q);
    case "bp2mt":
      return (cut, Q, gain = 1) => sosMatchedBandpass(cut, Q);
    case "pk2mt":
      return (cut, Q, gain = 1) => sosMatchedPeak(cut, Q, gain);
    case "hs1mt":
      return (cut, Q, gain = 1) => sosMatchedHighShelf1(cut, gain);
  }
  console.warn("filterType is invalid.");
  return null;
}

export const sosFilterType = {
  lp2bq: "lp2bq",
  hp2bq: "hp2bq",
  bp2bq: "bp2bq",
  ap2bq: "ap2bq",
  nt2bq: "nt2bq",
  pk2bq: "pk2bq",
  ls2bq: "ls2bq",
  hs2bq: "hs2bq",
  lp2mt: "lp2mt",
  hp2mt: "hp2mt",
  bp2mt: "bp2mt",
  pk2mt: "pk2mt",
  hs1mt: "hs1mt",
};
