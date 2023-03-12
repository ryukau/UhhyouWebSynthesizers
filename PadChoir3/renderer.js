// Copyright 2022 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import * as multirate from "../common/dsp/multirate.js";
import * as util from "../common/util.js";
import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";
import PocketFFT from "../lib/pocketfft/pocketfft.js";

import {formant, getVowelMixRatio, vowelMesh} from "./formant.js";
import * as menuitems from "./menuitems.js";

// PadSynth from ZynAddSubFX
// http://zynaddsubfx.sourceforge.net/doc/PADsynth/PADsynth.htm
function padsynth(
  fft,
  rng,
  formantSos, // sos = second order sections.
  sampleRate,
  lengthInSamples,
  padFreq,
  padGain,
  bandWidthOctave,
  phaseRandomAmount,
  formantPower,
) {
  lengthInSamples += lengthInSamples % 2;
  const spcSize = Math.floor(lengthInSamples / 2) + 1;

  let spectrum = new fft.vector_complex128();
  spectrum.resize(spcSize);

  for (let idx = 0; idx < padFreq.length; ++idx) {
    const bwHz = (2 ** bandWidthOctave - 1) * padFreq[idx]; // bw = band width.
    const bwIndex = bwHz / (2 * sampleRate);

    const sigma = Math.sqrt(bwIndex * bwIndex / (2 * Math.PI));
    const half = Math.max(Math.floor(3 * spcSize * sigma), 1);

    const normalizedFreq = padFreq[idx] / sampleRate;

    const mid = Math.floor(normalizedFreq * spcSize);
    const start = Math.max(mid - half, 1); // Don't write index 0 to avoid DC.
    const end = Math.min(mid + half, spcSize);

    for (let j = start; j < end; ++j) {
      const x = (j / spcSize - normalizedFreq) / bwIndex;
      const profileGain = Math.exp(-x * x) / bwIndex;
      const formantGain = getGainResponse(formantSos, 0.5 * j / spcSize, formantPower);
      spectrum.setReal(j, spectrum.getReal(j) + padGain[idx] * profileGain * formantGain);
    }
  }

  // Randomize phase.
  const phaseRand = 2 * Math.PI * phaseRandomAmount;
  for (let idx = 1; idx < spcSize; ++idx) {
    const real = spectrum.getReal(idx);
    const theta = phaseRand * rng.number();
    spectrum.setValue(idx, real * Math.cos(theta), real * Math.sin(theta));
  }

  const output = fft.c2r(spectrum);
  spectrum.delete();

  let sound = new Array(output.size());
  for (let i = 0; i < output.size(); ++i) sound[i] = output.get(i);
  output.delete();

  return sound;
}

function getGainResponse(sos, normalizedFreq, power) {
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
  const pow = (s, re) => {
    const len = Math.pow(s.re * s.re + s.im * s.im, re / 2);
    const arg = re * Math.atan2(s.im, s.re);
    return {re: len * Math.cos(arg), im: len * Math.sin(arg)};
  };

  const omega = 2 * Math.PI * normalizedFreq;
  const z = {re: Math.cos(omega), im: Math.sin(omega)}; // exp(1j * omega).
  const z2 = mul(z, z);
  let gain = {re: 0, im: 0};
  for (const co of sos) {
    // Equivalent to:
    // gain += (co[0] + co[1] * z + co[2] * z * z) / (co[3] + co[4] * z + co[5] * z * z);
    const H = div(
      add(radd(co[0], rmul(co[1], z)), rmul(co[2], z2)),
      add(radd(co[3], rmul(co[4], z)), rmul(co[5], z2)),
    );
    gain = add(gain, pow(H, power));
  }
  return Math.sqrt(gain.re * gain.re + gain.im * gain.im); // abs(gain).
}

function getVocalType(vocalType) {
  const vocalList =
    [formant.bass, formant.tenor, formant.countertenor, formant.alto, formant.soprano];

  if (vocalType >= vocalList.length - 1) {
    return {table: [vocalList.at(-1), vocalList.at(-1)], mix: [0, 1]};
  }

  const i0 = Math.floor(vocalType);
  const frac = vocalType - i0;
  return {table: [vocalList.at(i0), vocalList.at(i0 + 1)], mix: [frac, 1 - frac]};
}

function getFormantSos(sampleRate, baseFreq, pv, dsp) {
  const formantMesh = vowelMesh(1, 1);
  const formantPos = {
    x: util.clamp(pv.formantX + pv.formantRandom * dsp.rngCh.number(), 0, 1),
    y: util.clamp(pv.formantY + pv.formantRandom * dsp.rngCh.number(), 0, 1),
  };
  const formantMix = getVowelMixRatio(formantPos, formantMesh);

  const vocalType = getVocalType(
    util.lerp(pv.vocalType, pv.maxVocalType * dsp.rngCh.number(), pv.vocalRandom));
  const nFormant = formant.bass.a.freq.length;
  let freq = new Array(nFormant).fill(0);
  let amp = new Array(nFormant).fill(0);
  let bw = new Array(nFormant).fill(0); // band width.
  for (let voc = 0; voc < 2; ++voc) {
    const table = vocalType.table[voc];
    const vocalMix = vocalType.mix[voc];
    for (let edge = 0; edge < formantMix.mix.length; ++edge) {
      const vowel = formantMix.vowel[edge];
      const mix = vocalMix * formantMix.mix[edge];
      for (let idx = 0; idx < nFormant; ++idx) {
        freq[idx] += mix * table[vowel].freq[idx];
        amp[idx] += mix * table[vowel].amp[idx];
        bw[idx] += mix * table[vowel].bw[idx];
      }
    }
  }

  const trackRatio = (baseFreq / freq[0]) ** pv.formantTracking;
  for (let i = 0; i < nFormant; ++i) {
    freq[i] *= util.lerp(trackRatio, 1, pv.formantTrackingSlope * i / (nFormant - 1));
  }

  let sos = [];
  for (let idx = 0; idx < nFormant; ++idx) {
    const Q = freq[idx] / bw[idx];
    const G = util.dbToAmp(amp[idx]);
    const cutoff = freq[idx] / sampleRate;

    const sin = Math.sin(2 * Math.PI * cutoff);
    const cos = Math.cos(2 * Math.PI * cutoff);
    const α = 0.5 * sin / Q;
    sos.push([α * G, 0, -α * G, 1 + α, -2 * cos, (1 - α)]);
  }
  return sos;
}

function layerPad(fft, buffer, chordPitch, upRate, pv, dsp) {
  const padFreq = [];
  const padGain = [];
  let index = 1;
  const baseFreq = chordPitch * pv.baseFrequencyHz;
  let currentFreq = baseFreq;
  const nyquist = upRate / 2;
  const lowpassDenom = nyquist - pv.lowpassHz;
  const highshelfDenom = nyquist - pv.highShelfHz;
  const upperFreq = pv.highShelfGain <= 0 ? pv.highShelfHz : nyquist;
  while (currentFreq < upperFreq) {
    let gain = 1 / (index * 0.5);
    if (currentFreq < pv.highpassHz) {
      gain *= (currentFreq / pv.highpassHz) ** pv.highpassPower;
    }
    if (currentFreq > pv.lowpassHz) {
      gain *= ((nyquist - currentFreq) / lowpassDenom) ** pv.lowpassPower;
    }
    if (currentFreq > pv.highShelfHz) {
      gain *= pv.highShelfGain * ((currentFreq - pv.highShelfHz) / highshelfDenom);
    }

    padFreq.push(currentFreq);
    padGain.push(gain);

    ++index;
    currentFreq += baseFreq;
  }

  const sos = getFormantSos(upRate, baseFreq, pv, dsp);

  let pad = padsynth(
    fft, dsp.rngCh, sos, upRate, buffer.length, padFreq, padGain, pv.bandWidthOctave,
    pv.phaseRandomAmount, pv.formantPower);

  for (let i = 0; i < buffer.length; ++i) buffer[i] += pad[i];
  return buffer;
}

onmessage = async (event) => {
  const pv = event.data; // Parameter values.

  const upRate = pv.sampleRate;

  let dsp = {
    rngCh: new PcgRandom(BigInt(pv.seed + pv.channel * 65537)),

  };

  // PADsynth.
  const fft = await PocketFFT();
  const padLength = Math.floor(upRate * pv.renderDuration);
  let buffer = new Array(padLength).fill(0);

  const pitchRandLower = 2 ** (-pv.pitchRandomOctave);
  const pitchRandUpper = 2 ** (pv.pitchRandomOctave);

  layerPad(fft, buffer, 1, upRate, pv, dsp);
  for (let layer = 1; layer <= pv.nChord; ++layer) {
    const ptRnd = () => util.uniformDistributionMap(
      dsp.rngCh.number(), pitchRandLower, pitchRandUpper);
    layerPad(fft, buffer, ptRnd() * pv.chordPitch1 * layer, upRate, pv, dsp);
    layerPad(fft, buffer, ptRnd() * pv.chordPitch2 * layer, upRate, pv, dsp);
    layerPad(fft, buffer, ptRnd() * pv.chordPitch3 * layer, upRate, pv, dsp);
  }

  postMessage(buffer); // TODO: Remove this.
};
