// Copyright 2022 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {Delay, IntDelay, LongAllpass} from "../common/dsp/delay.js";
import * as multirate from "../common/dsp/multirate.js";
import {SVF} from "../common/dsp/svf.js";
import * as util from "../common/util.js";
import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";
import PocketFFT from "../lib/pocketfft/pocketfft.js";

import * as menuitems from "./menuitems.js";

// PadSynth from ZynAddSubFX
// http://zynaddsubfx.sourceforge.net/doc/PADsynth/PADsynth.htm
function padsynth(fft, sampleRate, sigSize, freq, gain, bandWidthOct, gainSlope, rng) {
  sigSize += sigSize % 2;
  const spcSize = Math.floor(sigSize / 2) + 1;

  let spectrum = new fft.vector_complex128();
  spectrum.resize(spcSize);

  for (let idx = 0; idx < freq.length; ++idx) {
    const bandWidthHz = (Math.pow(2, bandWidthOct) - 1) * freq[idx];
    const bandWidthI = bandWidthHz / (2 * sampleRate);

    const sigma = Math.sqrt(Math.pow(bandWidthI, 2) / Math.PI / 2);
    const half = Math.max(Math.floor(6 * spcSize * sigma), 1);

    const freqI = freq[idx] / sampleRate;

    const mid = Math.floor(freqI * spcSize);
    const start = Math.max(mid - half, 1); // Don't write index 0 to avoid DC.
    const end = Math.min(mid + half, spcSize);

    for (let j = start; j < end; ++j) {
      const x = (j / spcSize - freqI) / bandWidthI;
      const value = spectrum.getReal(j) + gain[idx] * Math.exp(-x * x) / bandWidthI;
      spectrum.setReal(j, value);
    }
  }

  // Randomize phase.
  const nyquistHz = sampleRate / 2;
  const nyquistOct = Math.log2(nyquistHz);
  for (let idx = 1; idx < spcSize; ++idx) {
    const oct = Math.log2(idx / (spcSize - 1) * nyquistHz);
    const filterGain = gainSlope ** (nyquistOct - oct);

    const real = spectrum.getReal(idx) * filterGain;
    const theta = rng.number() * 2 * Math.PI;

    spectrum.setValue(idx, real * Math.cos(theta), real * Math.sin(theta));
  }

  const output = fft.c2r(spectrum);
  spectrum.delete();

  let sound = new Array(output.size());
  for (let i = 0; i < output.size(); ++i) sound[i] = output.get(i);
  output.delete();

  return sound;
}

function process(pv, dsp, input) {
  let ap = input - pv.feedback * dsp.feedbackBuffer;
  let output = dsp.feedbackBuffer + util.lerp(0, pv.feedback * input, pv.padMix);
  for (let i = 0; i < pv.nDelay; ++i) {
    ap = dsp.lowpass[i].lp(ap);
    ap = dsp.highpass[i].hp(ap);
    ap = 1000 * Math.tanh(0.001 * dsp.delay[i].process(ap));
  }
  dsp.feedbackBuffer = ap;
  return output;
}

onmessage = async (event) => {
  const fft = await PocketFFT();
  const pv = event.data; // Parameter values.

  const upFold = parseInt(menuitems.oversampleItems[pv.overSample]);
  const upRate = upFold * pv.sampleRate;
  const numBin = Math.floor(pv.numBin);
  const minGain = 0.01;

  let duration = Math.floor(upRate * pv.renderDuration);
  duration += duration % 2;

  const attackSamples = Math.max(1, Math.floor(upRate * pv.attackSecond));

  let rng = new PcgRandom(BigInt(pv.seed));
  let rngCh = new PcgRandom(BigInt(pv.seed + pv.channel * 65537));
  const mixedRandom = () => util.lerp(rng.number(), rngCh.number(), pv.stereoRandom);

  let buf = new Array(duration).fill(0);

  // PADsynth.
  let delay = 0;
  const intervalSamples = pv.interval * upRate;
  for (let layer = 0; layer < pv.nLayer; ++layer) {
    let freq = new Array(numBin);
    let gain = new Array(numBin);
    for (var i = 0; i < numBin; ++i) {
      freq[i] = pv.minFreq + mixedRandom() * (upRate / 2 - pv.minFreq)
      gain[i] = minGain + mixedRandom() * (1 - minGain)
    }
    let pad = padsynth(
      fft, upRate, duration, freq, gain, pv.bandWidthOctave, pv.gainSlope, rngCh);

    // Post effect.
    let gainEnv = 1;
    let decay = Math.pow(pv.padDecayTo, 1.0 / (buf.length - delay));
    const attackEnd = Math.min(buf.length, delay + attackSamples);
    for (let i = delay; i < attackEnd; ++i) {
      const attack
        = Math.cos(Math.PI * 0.5 * (attackSamples - i + delay) / attackSamples);
      buf[i] += pad[i] * gainEnv * attack;
      gainEnv *= decay;
    }
    for (let i = attackEnd; i < buf.length; ++i) {
      buf[i] += pad[i] * gainEnv;
      gainEnv *= decay;
    }

    delay += Math.floor(util.lerp(
      intervalSamples, -Math.log(1 - mixedRandom()) * intervalSamples, pv.jitter));
  }

  // Serial allpass.
  let dsp = {
    delay: [],
    lowpass: [],
    highpass: [],
    feedbackBuffer: 0,
  };

  for (let i = 0; i < pv.nDelay; ++i) {
    let timeInSeconds = (1 + rng.number()) * pv.delayTime / (i + 1);

    let delay = new LongAllpass(upRate, timeInSeconds, upRate < 8 ? Delay : IntDelay);
    delay.prepare(upRate * timeInSeconds, pv.feedback);
    dsp.delay.push(delay);

    dsp.lowpass.push(new SVF(pv.lowpassHz / upRate, pv.lowpassQ));
    dsp.highpass.push(new SVF(pv.highpassHz / upRate, pv.highpassQ));
  }

  let sound = new Array(buf.length / upFold);
  const processFunc
    = menuitems.combSectionItems[pv.combSection] === "Active" ? process : (a, b, x) => x;
  if (upFold == 2) {
    let halfband = new multirate.HalfBandIIR();
    for (let i = 0; i < sound.length; ++i) {
      const hb0 = processFunc(pv, dsp, buf[2 * i]);
      const hb1 = processFunc(pv, dsp, buf[2 * i + 1]);
      sound[i] = halfband.processDown(hb0, hb1);
    }
  } else {
    for (let i = 0; i < sound.length; ++i) sound[i] = processFunc(pv, dsp, buf[i]);
  }

  // Post effect.
  let gainEnv = 1;
  let decay = Math.pow(pv.outputDecayTo, 1.0 / sound.length);
  for (let i = 0; i < sound.length; ++i) {
    sound[i] *= gainEnv;
    gainEnv *= decay;
  }

  postMessage({sound: sound});
}
