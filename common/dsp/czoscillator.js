// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

/*
Reference: https://forum.pdpatchrepo.info/topic/5992/casio-cz-oscillators

Note that opening post doesn't contain `cz-osc~.pd`. It is available on the link
provided by @whale-av which is far below on the thread.

As discussed in the reference, resonant oscillators are combination of hard-sync and
amplitude modulation (AM). Hard-synced cosine is used as carrier, and waveforms like
saw-tooth, triangle, trapezoid are used as modulator.

This implementation tries to resemble original Pure Data patch, so to make it easy to
figure out what's going on when adding more variations later. That's why intermediate
variables are used everywhere.

Amplitude of `Res*` variants are normalized in [-1, 0]. Others are in [-1, 1].

Parameters:
- `phase` is normalized phase in [0, 1).
- `mod` is waveform shape in [0, 1).

From the comments on original Pd patch:
- "modulation for non-res oscillators is in the range of 0-.99".
- "modulation for resonant oscillators are multiples of the fundamental".
*/

import {clamp} from "../util.js";

export const czOscillatorTypeItems = [
  "Saw",
  "Square",
  "Pulse",
  "Pulse2",
  "SinePulse",
  "HalfSine",
  "ResSaw",
  "ResTriangle",
  "ResTrapezoid",
  "ByteWaveQuadratic",
  "ByteWaveXor",
  "ByteWaveAnd",
];

export function selectCzOscillator(czOscillatorType) {
  switch (czOscillatorTypeItems[czOscillatorType]) {
    default:
    case "Saw":
      return czSaw;
    case "Square":
      return czSquare;
    case "Pulse":
      return czPulse;
    case "Pulse2":
      return czPulse2;
    case "SinePulse":
      return czSinePulse;
    case "HalfSine":
      return czHalfSine;
    case "ResSaw":
      return (phase, mod) => czResSaw(phase, Math.floor(64 * mod));
    case "ResTriangle":
      return (phase, mod) => czResTriangle(phase, Math.floor(64 * mod));
    case "ResTrapezoid":
      return (phase, mod) => czResTrapezoid(phase, Math.floor(64 * mod));
    case "ByteWaveQuadratic":
      return byteWaveQuadratic;
    case "ByteWaveXor":
      return byteWaveXor;
    case "ByteWaveAnd":
      return byteWaveAnd;
  }
};

export function czSaw(phase, mod) {
  const v1 = phase;
  const v2 = clamp(0.5 - 0.5 * Math.cbrt(mod), 0.01, 0.5);

  const sig1 = (0.5 - v2) * v1 / v2;
  const sig2 = (0.5 - v2) * (1 - v1) / (1 - v2);

  const phs = phase + Math.min(sig1, sig2);
  return Math.cos(2 * Math.PI * phs);
}

export function czSquare(phase, mod) {
  let v1 = 2 * phase + 1;
  v1 -= Math.floor(v1);

  const v2 = clamp(Math.cbrt(mod), 0, 0.99);

  const sig1 = v1;
  const sig2 = v2 * (1 - v1) / (1 - v2);

  const phs = (phase >= 0.5 ? 1 : 0) + v1 - Math.min(sig1, sig2);
  return Math.cos(Math.PI * phs);
}

export function czPulse(phase, mod) {
  const v1 = phase;
  const v2 = clamp(Math.cbrt(mod), 0, 0.99);

  const sig1 = v1;
  const sig2 = v2 * (1 - v1) / (1 - v2);

  const phs = phase - Math.min(sig1, sig2);
  return Math.cos(Math.PI * phs);
}

export function czPulse2(phase, mod) {
  const v1 = phase;
  const v2 = clamp(Math.cbrt(mod), 0, 0.99);

  const sig1 = v1;
  const sig2 = v2 * (1 - v1) / (1 - v2);

  const phs = (phase >= 0.5 ? 1 : 0) + v1 - Math.min(sig1, sig2);
  return Math.cos(2 * Math.PI * phs);
}

export function czSinePulse(phase, mod) {
  const v1 = phase;
  const v2 = clamp(0.5 - 0.5 * Math.cbrt(mod), 0.01, 0.5);

  const sig1 = (0.5 - v2) * v1 / v2;
  const sig2 = (0.5 - v2) * (1 - v1) / (1 - v2);

  const phs = phase + Math.min(sig1, sig2);
  return Math.cos(4 * Math.PI * phs);
}

export function czHalfSine(phase, mod) {
  const v1 = phase;
  const v2 = clamp(0.5 - 0.5 * Math.cbrt(mod), 0.01, 0.5);

  const sig = v1 < 0.5             //
    ? v1                           //
    : 0.5 * (v1 - 0.5) / v2 + 0.5; //

  const phs = phase + Math.min(sig, 1);
  return Math.cos(2 * Math.PI * phs);
}

export function czResSaw(phase, mod) {
  const phs = phase * Math.max(1, mod) + 1;
  const cos = 0.5 - 0.5 * Math.cos(2 * Math.PI * (phs - Math.floor(phs)));

  const am = phase - 1;

  return cos * am;
}

export function czResTriangle(phase, mod) {
  const phs = phase * Math.max(1, mod) + 1;
  const cos = Math.cos(2 * Math.PI * (phs - Math.floor(phs))) - 1;

  const am = phase < 0.5 ? phase : 1 - phase;

  return cos * am;
}

export function czResTrapezoid(phase, mod) {
  const phs = phase * Math.max(1, mod) + 1;
  const cos = 1 - Math.cos(2 * Math.PI * (phs - Math.floor(phs)));

  const am = clamp(phase - 1, -0.5, 0.5);

  return cos * am;
}

export function byteWaveQuadratic(phase, mod) {
  let phi = phase;
  phi -= Math.floor(phi);
  phi = Math.floor(phi * (2 + mod * mod * 1022));
  phi *= phi;
  return (phi % 257) / 128 - 1;
}

export function byteWaveXor(phase, mod) {
  const pow2 = 256;
  const phi = Math.floor(phase * pow2);
  const mask = Math.floor(mod * pow2);
  return (phi ^ mask) * 2 / pow2 - 1;
}

export function byteWaveAnd(phase, mod) {
  const pow2 = 256;
  const phi = Math.floor(phase * pow2);
  const mask = Math.floor(mod * pow2);
  return (phi & mask) * 2 / pow2 - 1;
}
