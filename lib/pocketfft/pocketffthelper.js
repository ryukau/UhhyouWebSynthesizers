import PocketFFT from "./pocketfft.js";

export function r2c(fft, x) {
  const signal = x instanceof Float64Array ? x : new Float64Array(x);
  const spc = fft.r2c_fast(signal); // Float64Array [re0, im0, re1, im1...]
  const size = spc.length / 2;
  const spectrum = new Array(size);
  for (let i = 0; i < size; ++i) { spectrum[i] = {re: spc[2 * i], im: spc[2 * i + 1]}; }
  return spectrum;
}

export function c2r(fft, spectrum) {
  const spc = new Float64Array(spectrum.length * 2);
  for (let i = 0; i < spectrum.length; ++i) {
    spc[2 * i] = spectrum[i].re;
    spc[2 * i + 1] = spectrum[i].im;
  }
  const signal = fft.c2r_fast(spc); // Float64Array
  return Array.from(signal);
}

export class PocketFFTHelper {
  constructor(fft) { this.fft = fft; }
  r2c(signal) { return r2c(this.fft, signal); }
  c2r(spectrum) { return c2r(this.fft, spectrum); }

  r2cDirect(float64Array) { return this.fft.r2c_fast(float64Array); }
  c2rDirect(interleavedFloat64Array) { return this.fft.c2r_fast(interleavedFloat64Array); }
}

export async function newPocketFFTHelper() {
  const fft = await PocketFFT();
  return new PocketFFTHelper(fft);
}
