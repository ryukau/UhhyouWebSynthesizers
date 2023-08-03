// Copyright 2023 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import * as delay from "../common/dsp/delay.js";
import * as multirate from "../common/dsp/multirate.js";
import {SlopeFilter} from "../common/dsp/slopefilter.js";
import {
  exponentialMap,
  lagrange3Interp,
  lerp,
  uniformDistributionMap,
  uniformIntDistributionMap
} from "../common/util.js";
import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";

import * as menuitems from "./menuitems.js";
import {justIntonationTable} from "./shared.js"

/*
base multipliers: 4, 6, 9
modulators: 61, 61, 32

semitones:
osc1, osc2: 38, 71.25

diff: 33.25
diff wrapped: 9.25
*/

class DelayedDecayEnvelope {
  constructor(upRate, attackSeconds, attackHeight, decaySeconds) {
    const transitionSeconds = 0.002;
    const lengthSeconds = attackSeconds + decaySeconds + transitionSeconds;

    this.table = new Array(2048).fill(0);

    this.phase = 0;
    this.delta = this.table.length / (upRate * lengthSeconds);

    // Draws expm1 curve grows from 0 to `attackHeight`.
    const argumentAt1 = Math.log(2);
    const attackEnd = Math.floor(this.table.length * attackSeconds / lengthSeconds);
    for (let i = 0; i < attackEnd; ++i) {
      this.table[i] = attackHeight * Math.expm1(argumentAt1 * i / attackEnd);
    }

    const transisionEnd
      = attackEnd + Math.floor(this.table.length * transitionSeconds / lengthSeconds);
    for (let i = attackEnd; i < transisionEnd; ++i) {
      const ratio = (i - attackEnd) / (transisionEnd - attackEnd);
      this.table[i] = lerp(attackHeight, 1, ratio);
    }

    // Draws exponential curve decays from 1 to 1e-3 (-60 dB).
    const width = this.table.length - transisionEnd;
    const decay = Math.pow(1e-3, 1 / width);
    let gain = 1;
    for (let i = transisionEnd; i < this.table.length; ++i) {
      this.table[i] = gain;
      gain *= decay;
    }

    // Add elements for interpolation.
    this.table.unshift(0);
    this.table.push(0);
    this.table.push(0);
  }

  process() {
    if (this.phase >= this.table.length - 4) return 0;

    const i0 = Math.floor(this.phase);
    const fraction = this.phase - i0;
    this.phase += this.delta;

    return lagrange3Interp(
      this.table[i0], this.table[i0 + 1], this.table[i0 + 2], this.table[i0 + 3],
      fraction);
  }
}

class Oscillator {
  constructor(freq0, phase0, freq1, phase1, env1, fmIndex) {
    this.phase1 = phase1;
    this.freq1 = freq1;
    this.env1 = env1;
    this.fmIndex = fmIndex;

    this.phase0 = phase0;
    this.freq0 = freq0;
  }

  process() {
    this.phase1 += this.freq1;
    this.phase1 -= Math.floor(this.phase1);
    const mod = this.fmIndex * this.env1.process() * Math.sin(2 * Math.PI * this.phase1);

    this.phase0 += this.freq0;
    this.phase0 -= Math.floor(this.phase0);
    return Math.sin(2 * Math.PI * this.phase0 + mod);
  }
}

class SinOsc {
  constructor(initialPhase) { this.phase = initialPhase; }

  process(freqNormalized) {
    this.phase += freqNormalized;
    this.phase -= Math.floor(this.phase);
    return Math.sin(2 * Math.PI * this.phase);
  }
}

function process(upRate, pv, dsp) {
  let sig = 0;
  for (let i = 0; i < dsp.osc.length; ++i) sig += dsp.osc[i].process();
  sig /= dsp.osc.length;

  const lfo = Math.exp(dsp.lfoScale * dsp.lfo.process(dsp.lfoFreq));
  for (let i = 0; i < dsp.times.length; ++i) {
    dsp.times[i] = dsp.baseTimes[i] * lfo;
  }
  dsp.delay.setTime(dsp.times);
  const flanger = dsp.delay.process(sig) / pv.nTap;
  sig = lerp(sig, flanger, pv.flangerMix);

  if (pv.toneSlope < 1) sig = dsp.slopeFilter.process(sig);
  return sig;
}

onmessage = async (event) => {
  const pv = event.data; // Parameter values.

  const upFold = parseInt(menuitems.oversampleItems[pv.overSample]);
  const upRate = upFold * pv.sampleRate;
  const soundLength = Math.floor(pv.sampleRate * pv.renderDuration);

  const stereoSeed = pv.stereoSeed === 0 ? 0 : 65537;
  const rng = new PcgRandom(BigInt(pv.seed + pv.channel * stereoSeed));

  let dsp = {};
  dsp.rng = rng;

  dsp.delay = new delay.MultiTapDelay(upRate, 0.1, pv.nTap);
  dsp.times = new Array(pv.nTap).fill(0);
  dsp.baseTimes = new Array(pv.nTap).fill(0);
  for (let i = 0; i < dsp.baseTimes.length; ++i) {
    const ratio = (i + 1) / dsp.baseTimes.length;
    const randomPitch
      = exponentialMap(rng.number(), 1 / pv.delayRandomRatio, pv.delayRandomRatio);
    dsp.baseTimes[i] = ratio * upRate / (pv.delayBaseHz * randomPitch);
  }
  // dsp.maxTime = dsp.baseTimes.reduce((p, c) => Math.max(p, c));
  dsp.lfoFreq = pv.lfoFreqHz / upRate;
  dsp.lfoScale = Math.log(2) * pv.lfoAmount;
  dsp.lfo = new SinOsc(rng.number());

  //
  // Original recipe:
  // const testRatios0 = [4 / 4, 6 / 4, 9 / 4];
  // const testRatios1 = [61.4 / 4, 61.4 / 4, 32 / 4];
  //
  dsp.osc = [];

  let carrierRatios = [];
  let modulatorRatios = [];
  for (let i = 0; i < pv.chord1NoteCount; ++i) {
    const modRatio = 2 ** (Math.log2(pv.chord1Ratio ** i) % pv.chord1OctaveWrap);
    carrierRatios.push(modRatio);
    modulatorRatios.push(2 ** (4 - Math.floor(Math.log2(modRatio))));
  }

  let chordRatios = [];
  for (let i = 0; i < pv.chord2Notes.length; ++i) {
    if (pv.chord2Notes[i] > 0) chordRatios.push(justIntonationTable[i]);
  }

  for (let unison = 0; unison < pv.nUnison; ++unison) {
    const unisonRatio = unison / (pv.nUnison - 1);
    const baseFreq = pv.frequencyHz / upRate;
    const spreadCent = pv.unisonPitchSpreadCents * unisonRatio
      + uniformDistributionMap(rng.number(), 0, pv.centsRandomize);
    const spreadOctave = uniformIntDistributionMap(rng.number(), 0, pv.octaveRandomize);
    const unisonFreq = baseFreq * 2 ** (spreadOctave + spreadCent / 1200);

    for (let note = 0; note < chordRatios.length; ++note) {
      const noteFreq = unisonFreq * chordRatios[note];

      for (let idx = 0; idx < pv.chord1NoteCount; ++idx) {
        const envelope = new DelayedDecayEnvelope(
          upRate, (idx + 1) * pv.attackSeconds, 0.25, pv.decaySeconds);
        const osc = new Oscillator(
          noteFreq * carrierRatios[idx], rng.number(), noteFreq * modulatorRatios[idx],
          rng.number(), envelope, pv.fmIndex);
        dsp.osc.push(osc);
      }
    }
  }

  dsp.slopeFilter = new SlopeFilter(Math.floor(Math.log2(24000 / 1000)));
  dsp.slopeFilter.setCutoff(upRate, 1000, pv.toneSlope, true);

  // Process.
  let sound = new Array(soundLength).fill(0);
  if (upFold == 64) {
    let decimationLowpass = new multirate.SosFilter(multirate.sos64FoldFirstStage);
    let halfband = new multirate.HalfBandIIR();
    let frame = [0, 0];
    for (let i = 0; i < sound.length; ++i) {
      for (let j = 0; j < 2; ++j) {
        for (let k = 0; k < 32; ++k) decimationLowpass.push(process(upRate, pv, dsp));
        frame[j] = decimationLowpass.output();
      }
      sound[i] = halfband.process(frame[0], frame[1]);
    }
  } else if (upFold == 16) {
    let decimationLowpass = new multirate.SosFilter(multirate.sos16FoldFirstStage);
    let halfband = new multirate.HalfBandIIR();
    let frame = [0, 0];
    for (let i = 0; i < sound.length; ++i) {
      for (let j = 0; j < 2; ++j) {
        for (let k = 0; k < 8; ++k) decimationLowpass.push(process(upRate, pv, dsp));
        frame[j] = decimationLowpass.output();
      }
      sound[i] = halfband.process(frame[0], frame[1]);
    }
  } else if (upFold == 2) {
    let halfband = new multirate.HalfBandIIR();
    for (let i = 0; i < sound.length; ++i) {
      const hb0 = process(upRate, pv, dsp);
      const hb1 = process(upRate, pv, dsp);
      sound[i] = halfband.process(hb0, hb1);
    }
  } else {
    for (let i = 0; i < sound.length; ++i) sound[i] = process(upRate, pv, dsp);
  }

  // Post effect.
  let gainEnv = 1;
  let decay = Math.pow(pv.decayTo, 1.0 / sound.length);
  for (let i = 0; i < sound.length; ++i) {
    sound[i] *= gainEnv;
    gainEnv *= decay;
  }

  postMessage(sound);
}
