// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {SosFilter} from "../common/dsp/multirate.js";
import {
  sosBiquadHighpass,
  sosBiquadHighShelf,
  sosBiquadLowpass,
  sosBiquadPeak,
  sosMatchedHighpass,
  sosMatchedLowpass,
  sosMatchedPeak
} from "../common/dsp/sos.js";
import {lerp, uniformFloatMap} from "../common/util.js";
import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";
import PocketFFT from "../lib/pocketfft/pocketfft.js";

function toAmp(decibel) { return 10 ** (decibel / 40); }

function sosfilt(sos, x) {
  let filter = new SosFilter(sos);
  for (let i = 0; i < x.length; ++i) x[i] = filter.process(x[i]);
  return x;
}

// IIR filter becomes linear phase when applied forward and backward.
function sosfiltfilt(sos, x) {
  let filter = new SosFilter(sos);
  for (let i = 0; i < x.length; ++i) x[i] = filter.process(x[i]);

  filter.reset();
  for (let i = x.length - 1; i >= 0; --i) x[i] = filter.process(x[i]);

  return x;
}

function rfft(fft, x) {
  let signal = new fft.vector_f64();
  signal.resize(x.length, 0);
  for (let i = 0; i < x.length; ++i) signal.set(i, x[i]);

  const spectrum = fft.r2c(signal);
  signal.delete();

  let real = new Array(spectrum.size());
  let imag = new Array(spectrum.size());
  for (let i = 0; i < spectrum.size(); ++i) {
    real[i] = spectrum.getReal(i);
    imag[i] = spectrum.getImag(i);
  }
  spectrum.delete();
  return [real, imag];
}

function irfft(fft, real, imag) {
  if (imag === undefined || imag === null) imag = new Array(real.length).fill(0);

  let spectrum = new fft.vector_complex128();
  spectrum.resize(real.length);
  for (let i = 0; i < spectrum.size(); ++i) {
    spectrum.setReal(i, real[i]);
    spectrum.setImag(i, imag[i]);
  }
  const signal = fft.c2r(spectrum);
  spectrum.delete();

  let x = new Array(signal.size());
  for (let i = 0; i < signal.size(); ++i) x[i] = signal.get(i);
  signal.delete();
  return x;
}

function rotate(x, m) {
  let y = new Array(x.length);
  for (let i = 0; i < x.length; ++i) {
    let j = i - m;
    if (j < 0) j += x.length;
    y[i] = x[j];
  }
  return y;
}

// "Homomorphic Filtering" in following link.
// - http://dspguru.com/dsp/howtos/how-to-design-minimum-phase-fir-filters/
function toMinPhase(fft, ir, scale = 2) {
  // Padding
  ir = ir.concat(new Array(ir.length * (2 ** scale - 1)).fill(0));

  // `spectrum = 0.5 * log(abs(rfft(ir)))`.
  let [real, imag] = rfft(fft, ir);
  for (let i = 0; i < real.length; ++i) {
    const absed = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
    real[i] = 0.5 * Math.log(Math.max(absed, Number.MIN_VALUE)); // Avoid infinity.
    imag[i] = 0;
  }

  // `irfft(spectrum)`, get first half, then double the values except first element.
  ir = irfft(fft, real, imag).slice(0, Math.floor(ir.length / 2));
  for (let i = 1; i < ir.length; ++i) ir[i] *= 2;

  // `irfft(exp(fft(ir)))`, then return first half.
  [real, imag] = rfft(fft, ir);
  for (let i = 0; i < real.length; ++i) {
    const scale = Math.exp(real[i]);
    real[i] = scale * Math.cos(imag[i]);
    imag[i] = scale * Math.sin(imag[i]);
  }
  return irfft(fft, real, imag).slice(0, Math.floor(ir.length / 2));
}

onmessage = async (event) => {
  // spc: spectrum, ir: impulse response.
  const fft = await PocketFFT();
  const pv = event.data; // Parameter values.

  const baseLength = Math.floor(pv.renderSamples);
  const sourceLowpassCutoff = Math.min(pv.sourceLowpassCutoffHz / pv.sampleRate, 0.5);

  let rng = new PcgRandom(BigInt(pv.seed + pv.channel * 65537));
  let spectrumNoise = () => uniformFloatMap(rng.number(), 0, 2);

  let real = new Array(baseLength).fill(0);
  for (let i = 0; i < real.length; ++i) real[i] = spectrumNoise();

  let sos = [];
  sos.push(sosBiquadLowpass(sourceLowpassCutoff, pv.sourceLowpassQ));
  real = sosfiltfilt(sos, real);

  let ir = irfft(fft, real, null);
  ir = rotate(ir, Math.floor(ir.length / 2));

  const peaking = prm => sosMatchedPeak(prm[0] / pv.sampleRate, prm[1], prm[2]);
  const lowpass = prm => sosBiquadLowpass(prm[0] / pv.sampleRate, prm[1], prm[2]);
  const highpass = prm => sosMatchedHighpass(prm[0] / pv.sampleRate, prm[1], prm[2]);

  sos = [];
  sos.push(peaking(pv.peak1));
  sos.push(peaking(pv.peak2));
  sos.push(peaking(pv.peak3));
  sos.push(lowpass(pv.nyquistLowpass));
  ir = sosfiltfilt(sos, ir);

  ir = toMinPhase(fft, ir);
  sos = [];
  sos.push(highpass(pv.dcHighpass));
  ir = sosfilt(sos, ir);

  const fadeIn = Math.floor(pv.fadeIn);
  for (let idx = 0; idx < fadeIn; ++idx) {
    ir[idx] *= Math.sin(0.5 * Math.PI * idx / fadeIn);
  }
  const fadeOut = Math.floor(pv.fadeOut);
  for (let idx = ir.length - fadeOut; idx < ir.length; ++idx) {
    const t = (idx - ir.length) / fadeOut;
    ir[idx] *= Math.cos(0.5 * Math.PI * t);
  }
  const gain = 1 / ir.reduce((p, v) => p + Math.abs(v), 0);
  for (let idx = 0; idx < ir.length; ++idx) ir[idx] *= gain;

  postMessage({sound: ir});
}
