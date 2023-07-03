// Copyright 2023 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import PocketFFT from "./pocketfft.js";

export function r2c(fft, x) {
  let signal = new fft.vector_f64();
  signal.resize(x.length, 0);
  for (let i = 0; i < x.length; ++i) signal.set(i, x[i]);

  const spc = fft.r2c(signal);
  signal.delete();

  let spectrum = new Array(spc.size());
  for (let i = 0; i < spc.size(); ++i) {
    spectrum[i] = {re: spc.getReal(i), im: spc.getImag(i)};
  }
  spc.delete();
  return spectrum;
}

export function c2r(fft, spectrum) {
  let spc = new fft.vector_complex128();
  spc.resize(spectrum.length);
  for (let i = 0; i < spc.size(); ++i) {
    spc.setValue(i, spectrum[i].re, spectrum[i].im);
  }
  const signal = fft.c2r(spc);
  spc.delete();

  let x = new Array(signal.size());
  for (let i = 0; i < signal.size(); ++i) x[i] = signal.get(i);
  signal.delete();
  return x;
}

// Constructor is using a hack described at: https://stackoverflow.com/a/50885340
// PocketFFTHelper must be called with await.
//
// const fft = await new PocketFFTHelper(...);
//
export class PocketFFTHelper {
  constructor(fft) { this.fft = fft; }
  r2c(signal) { return r2c(this.fft, signal); }
  c2r(spectrum) { return c2r(this.fft, spectrum); }
}

export async function newPocketFFTHelper() {
  const fft = await PocketFFT();
  return new PocketFFTHelper(fft);
}
