// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {clamp, freqToMidiPitch, lagrange3Interp, midiPitchToFreq} from "../util.js"

export class WavetableOscillator {
  //
  // PocketFFTHelper is available on `lib/pocketfft/pocketffthelper.js`.
  //
  // `fullSpectrum = [{re: (real value), im: (imaginary value)}, ...]`.
  // Use `fullSpectrumSize` to get the length.
  //
  constructor(
    pocketFFTHelper,
    sampleRate,
    fullSpectrum,
    initialPhase = 0,
    baseFreqHz = 20,
    isOversampling = false,
  ) {
    // Provided parameters.
    this.phase = initialPhase;
    this.bendRange = isOversampling ? Math.sqrt(3) : 2;
    this.baseFreq = baseFreqHz; // Lowest frequency without loss of harmonics.

    // Internals.
    this.bufSize = 2;
    this.maxIdx = 0;
    this.baseNote = 0;
    this.interval = 12 * Math.log2(this.bendRange);

    this.fillTable(pocketFFTHelper, sampleRate, fullSpectrum);
  }

  static fullSpectrumSize(sampleRate, baseFreqHz = 20) {
    const exponent = clamp(Math.floor(Math.log2(sampleRate / baseFreqHz)), 1, 24);
    return (1 << exponent);
  }

  fillTable(pocketFFTHelper, sampleRate, fullSpectrum) {
    const exponent = clamp(Math.floor(Math.log2(sampleRate / this.baseFreq)), 1, 52);
    this.bufSize = (1 << exponent);
    const nFreq = Math.floor(this.bufSize / 2); // Without DC.

    const nTable = Math.floor(Math.log(nFreq) / Math.log(this.bendRange));
    this.maxIdx = nTable - 1;

    this.baseNote = freqToMidiPitch(sampleRate / this.bufSize);

    this.table = new Array(nTable + 1); // Last table is filled by 0.
    let destSpc = structuredClone(fullSpectrum);
    let prevCutoff = destSpc.length;
    for (let idx = 0; idx < this.table.length - 1; ++idx) {
      const cutoff = Math.floor(nFreq * Math.pow(this.bendRange, -idx)) + 1;
      for (let j = cutoff; j < prevCutoff; ++j) destSpc[j] = {re: 0, im: 0};
      prevCutoff = cutoff;

      this.table[idx] = pocketFFTHelper.c2r(destSpc);
      this.table[idx].unshift(this.table[idx].at(-1));
      this.table[idx].push(this.table[idx][1]);
      this.table[idx].push(this.table[idx][2]);
    }
    this.table.push(new Array(this.bufSize + 3).fill(0));
  }

  process(note, phase) {
    const octFloat = clamp((note - this.basenote) / this.interval, 0, this.maxIdx);
    const iTbl = Math.floor(octFloat);
    const yFrac = octFloat - iTbl;

    const pos = this.bufSize * phase;
    const idx = Math.floor(pos);
    const xFrac = pos - idx;

    const t0 = this.table[iTbl];
    const s0 = lagrange3Interp(t0[idx], t0[idx + 1], t0[idx + 2], t0[idx + 3], xFrac);

    const t1 = this.table[iTbl + 1];
    const s1 = lagrange3Interp(t1[idx], t1[idx + 1], t1[idx + 2], t1[idx + 3], xFrac);

    return s0 + yFrac * (s1 - s0);
  }

  processPhase(note) {
    this.phase += midiPitchToFreq(note);
    this.phase -= Math.floor(this.phase);
    return this.process(note, this.phase);
  }
}

export class VariableWavetableOscillator {
  // `waveformFunc` takes frequency in Hz for possible anti-aliasing.
  // Decrease `tableSize` when lower frequency isn't played.
  constructor(
    waveformFunc,
    sampleRate,
    fadeSeconds = 0.007,
    tableSize = 8192,
  ) {
    this.waveformFunc = waveformFunc;

    this.tableSize = tableSize;
    this.phase = 0;
    this.fadeSamples = Math.floor(sampleRate * fadeSeconds) + 1;
    this.fadeCounter = 0;
    this.backIndex = 0;
  }

  refreshTable(index, noteHz) {
    this.table[index] = this.waveformFunc(noteHz);
    this.table[index].unshift(this.table[index].at(-1));
    this.table[index].push(this.table[index][1]);
    this.table[index].push(this.table[index][2]);
  }

  isRefreshing() { return this.fadeCounter == 0; }

  process(sampleRate, noteHz) {
    if (++this.fadeCounter >= this.fadeSamples) {
      this.fadeCounter = 0;
      this.backIndex ^= 1;
      this.refreshTable(this.backIndex, noteHz);
    };

    this.phase += noteHz / sampleRate;
    this.phase -= Math.floor(this.phase);

    const pos = this.tableSize * this.phase;
    const idx = Math.floor(pos);
    const fraction = pos - idx;

    const t0 = this.table[0];
    const t1 = this.table[1];
    const vf = lagrange3Interp(t0[idx], t0[idx + 1], t0[idx + 2], t0[idx + 3], fraction);
    const vb = lagrange3Interp(t1[idx], t1[idx + 1], t1[idx + 2], t1[idx + 3], fraction);
    if (this.backIndex == 0) [vb, vf] = [vf, vb];

    const fx = this.fadeCounter / this.fadeSamples;
    const fade = 1 - fx * fx;
    return vb + fade * (vf - vb);
  }
}

export class OverlapOscillator {
  #minInterval = 4;

  // `source.length` must be even.
  constructor(fft, source) {
    this.fillTable(fft, source);

    this.phase = new Array(Math.ceil(source.length / this.#minInterval)).fill(1);
    this.phaseIndex = 0;
    this.overlapPhase = 1;
  }

  fillTable(fft, source) {
    const assignTableAt = (index, signal) => {
      this.table[index] = signal;
      this.table[index].unshift(this.table[index].at(-1));
      this.table[index].push(this.table[index][1]);
      this.table[index].push(this.table[index][2]);
    };

    this.tableSize = source.length;

    const nTable = Math.floor(Math.log2(source.length) + 1);
    this.table = new Array(nTable);

    assignTableAt(0, structuredClone(source));

    let spectrum = fft.r2c(source);
    spectrum[0].re = 0; // Remove DC.
    spectrum[0].im = 0; // Remove DC.

    let cutoff = spectrum.length - 1;
    let spcIndex = spectrum.length - 1;
    for (let idx = 1; idx < this.table.length; ++idx) {
      cutoff = Math.floor(cutoff / 2);
      while (spcIndex >= cutoff) {
        spectrum[idx].re = 0;
        spectrum[idx].im = 0;
        --spcIndex;
      }
      assignTableAt(idx, fft.c2r(spectrum));
    }
  }

  process(freqNormalized, overlapTiming) {
    this.overlapPhase += freqNormalized;
    if (this.overlapPhase >= overlapTiming) {
      this.overlapPhase -= Math.floor(this.overlapPhase);

      this.phase[this.phaseIndex] = 0;
      if (++this.phaseIndex >= this.phase.length) this.phaseIndex = 0;
    }

    let sum = 0;
    for (let i = 0; i < this.phase.length; ++i) {
      this.phase[i] += freqNormalized;
      if (this.phase[i] >= 1) continue;

      const pos = this.phase[i] * this.tableSize;
      const idx = Math.floor(pos);
      const t0 = this.table[0];
      sum += lagrange3Interp(t0[idx], t0[idx + 1], t0[idx + 2], t0[idx + 3], pos - idx);
    }
    return sum;
  }

  processAA(freqNormalized, overlapTiming) {
    this.overlapPhase += freqNormalized;
    if (this.overlapPhase >= overlapTiming) {
      this.overlapPhase -= Math.floor(this.overlapPhase);

      this.phase[this.phaseIndex] = 0;
      if (++this.phaseIndex >= this.phase.length) this.phaseIndex = 0;
    }

    const indexPerSample = freqNormalized * this.tableSize;

    const octFloat = indexPerSample <= 1
      ? 0
      : Math.min(Math.log2(indexPerSample), this.table.length - 2);
    const iTbl = Math.floor(octFloat);
    const yFrac = octFloat - iTbl;

    const t0 = this.table[iTbl];
    const t1 = this.table[iTbl + 1];

    let sum = 0;
    for (let i = 0; i < this.phase.length; ++i) {
      this.phase[i] += freqNormalized;
      if (this.phase[i] >= 1) continue;

      const pos = this.phase[i] * this.tableSize;
      const idx = Math.floor(pos);
      const xFrac = pos - idx;
      const s0 = lagrange3Interp(t0[idx], t0[idx + 1], t0[idx + 2], t0[idx + 3], xFrac);
      const s1 = lagrange3Interp(t1[idx], t1[idx + 1], t1[idx + 2], t1[idx + 3], xFrac);
      sum += s0 + yFrac * (s1 - s0);
    }
    return sum;
  }
}
