// Copyright 2022 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

/*
IIR filters in modified `scipy.signal` sos format. Sos stands for second order sections.

Sos format is `[b0, b1, b2, a1, a2]`. It represents following transfer function:

```
        b0 + b1*z^-1 + b2*z^-2
H(z) = ------------------------
         1 + a1*z^-1 + a2*z^-2
```

To construct filter from sos, use `SosFilter` in `multirate.js`.

Common parameter:
- `cutoffNormalized`: cutoffHz / sampleRate.
- `gainAmp`: 10^(decibel / 20).

Reference:
- https://www.w3.org/TR/audio-eq-cookbook/
- https://ryukau.github.io/filter_notes/matched_iir_filter/matched_iir_filter.html
*/

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
  const b2 = A * ((A + 1) + (A - 1) * cs - B);
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
  const [ω0, a1, a2, φ0, φ1, φ2, A0, A1, A2]
    = getMatchedFilterParams(cutoffNormalized, Q);

  const sqrt_B0 = 1 + a1 + a2;
  const B0 = A0;

  const R1 = Q * Q * (A0 * φ0 + A1 * φ1 + A2 * φ2);
  const B1 = (R1 - B0 * φ0) / φ1;

  const b0 = 0.5 * (sqrt_B0 + Math.sqrt(B1));
  const b1 = sqrt_B0 - b0;

  return [b0, b1, 0, a1, a2];
}

export function sosMatchedHighpass(cutoffNormalized, Q) {
  const [ω0, a1, a2, φ0, φ1, φ2, A0, A1, A2]
    = getMatchedFilterParams(cutoffNormalized, Q);

  const b0 = Q * Math.sqrt(A0 * φ0 + A1 * φ1 + A2 * φ2) / (4 * φ1);
  const b1 = -2 * b0;
  const b2 = b0;

  return [b0, b1, b2, a1, a2];
}

export function sosMatchedBandpass(cutoffNormalized, Q) {
  const [ω0, a1, a2, φ0, φ1, φ2, A0, A1, A2]
    = getMatchedFilterParams(cutoffNormalized, Q);

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
  const [ω0, a1, a2, φ0, φ1, φ2, A0, A1, A2]
    = getMatchedFilterParams(cutoffNormalized, Q);
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

// 1-pole high shelf.
export function sosMatchedHighShelf1(cutoffNormalized, gainAmp) {
  const fc = 2 * cutoffNormalized;
  const G = gainAmp;

  const fm = 0.9;
  const φm = 1 - Math.cos(Math.PI * fm);

  const pp = T(2) / (pi * pi);
  const xi = pp / (φm * φm) - T(1) / φm;
  const α = xi + pp / (G * fc * fc);
  const β = xi + pp * G / (fc * fc);

  const a1 = -α / (1 + α + Math.sqrt(1 + 2 * α));
  const b = -β / (1 + β + Math.sqrt(1 + 2 * β));
  const b0 = (1 + a1) / (1 + b);
  const b1 = b * b0;

  return [b0, b1, 0, a1, 0];
}

export function getSosGain(sos, normalizedFreq, inDecibel = false) {
  // Complex number functions.
  const add = (s, t) => {
    return {
      re: s.re + t.re,
      im: s.im + t.im,
    };
  };
  const mul = (s, t) => {
    return {
      re: s.re * t.re - s.im * t.im,
      im: s.re * t.im + s.im * t.re,
    };
  };
  const div = (s, t) => {
    const denom = t.re * t.re + t.im * t.im;
    return {
      re: (t.re * s.re + t.im * s.im) / denom,
      im: (t.re * s.im - t.im * s.re) / denom,
    };
  };
  const rmul = (re, t) => { return {re: re * t.re, im: re * t.im}; };
  const radd = (re, t) => { return {re: re + t.re, im: t.im}; };

  const omega = 2 * Math.PI * normalizedFreq;
  const z = {re: Math.cos(omega), im: -Math.sin(omega)}; // exp(-1j * omega).
  const z2 = mul(z, z);
  let gain = {re: 1, im: 0};
  for (const co of sos) {
    // Equivalent to:
    // gain += (co[0] + co[1] * z + co[2] * z * z) / (1 + co[3] * z + co[4] * z * z);
    const H = div(
      add(radd(co[0], rmul(co[1], z)), rmul(co[2], z2)),
      add(radd(1, rmul(co[3], z)), rmul(co[4], z2)),
    );
    gain = mul(gain, H);
  }
  const gn = Math.sqrt(gain.re * gain.re + gain.im * gain.im); // abs(gain).
  return inDecibel ? 20 * Math.log10(gn) : gn;
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
  console.warn("filterType is invalid.")
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
