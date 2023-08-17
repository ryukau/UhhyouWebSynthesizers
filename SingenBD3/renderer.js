// Copyright 2022 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {FeedbackDelayNetwork} from "../common/dsp/fdn.js";
import * as multirate from "../common/dsp/multirate.js";
import {DoubleEMAFilter} from "../common/dsp/smoother.js";
import * as util from "../common/util.js";
import BasicLimiter from "../common/wasm/basiclimiter.js";
import BezierEasing from "../lib/beziereasing/beziereasing.js";
import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";

import * as menuitems from "./menuitems.js";

class SamplingEnvelope {
  constructor(intervalInSamples, tableSize, curveFunc) {
    this.interval = intervalInSamples;

    this.table = [];
    this.table.push(0);
    this.table.push(1);
    for (let i = 0; i < tableSize; ++i) {
      this.table.push(curveFunc(i / tableSize));
    }
    this.table.push(0);

    this.smoother = new DoubleEMAFilter();
    this.smoother.setCutoffFromTime(intervalInSamples);
  }

  process(timeInSamples) {
    const i0 = timeInSamples / this.interval;
    if (i0 >= this.table.length - 1) return this.smoother.process(0);

    const index = Math.floor(i0);
    return this.smoother.process(
      util.lerp(this.table[index], this.table[index + 1], i0 - index));
  }
}

const octToDelta = (fs, oct) => (440 / fs) * 2 ** (oct - 5.75);
const decay = (easing, phase, curve) => Math.pow(1 - easing(phase, 1), curve);
const superellipse = (x, n) => x < 0 ? 1 : (1 - x ** n) ** (1 / n);

function processModulation(upRate, pv, dsp) {
  dsp.phase2 += Math.min(0.5, pv.mod2PitchRatio * dsp.baseDelta);
  dsp.phase2 -= Math.floor(dsp.phase2);
  const osc2 = Math.cos(2 * Math.PI * dsp.phase2);
  const mod2 = osc2 * pv.mod2Amount;

  dsp.phase1 += Math.min(0.5, pv.mod1PitchRatio * dsp.baseDelta);
  dsp.phase1 -= Math.floor(dsp.phase1);
  const osc1 = Math.cos(2 * Math.PI * (dsp.phase1 + mod2));
  const mod1 = osc1 * pv.mod1Amount * dsp.modEnv.process(dsp.currentSample);

  return mod1;
}

function process(upRate, pv, dsp) {
  const pm = processModulation(upRate, pv, dsp);
  const envPhase = dsp.currentSample / dsp.renderDuration;
  const sellipPhase = dsp.currentSample / dsp.pitchSuperellipseDuration;
  ++dsp.currentSample;

  const dropBezier
    = pv.pitchDropBezier * decay(dsp.pitchEnv, envPhase, pv.pitchDropBezierPower);
  const dropSupEllip = sellipPhase > 1
    ? 0
    : pv.pitchDropSuperellipse * superellipse(sellipPhase, pv.pitchSuperellipseCurve);
  const dropEnvelope = dropBezier + dropSupEllip;
  const phase0Delta = dsp.baseDelta + octToDelta(upRate, dropEnvelope);

  let osc0 = 0;
  let sumAmp = 0;
  for (let idx = 0; idx < pv.nOvertone; ++idx) {
    dsp.phase0[idx] += dsp.overtone[idx] * phase0Delta;
    dsp.phase0[idx] -= Math.floor(dsp.phase0[idx]);
    const oscGain = 1 / (pv.overtoneAmp * idx + 1);
    sumAmp += oscGain;
    osc0 += oscGain * Math.sin(2 * Math.PI * (dsp.phase0[idx] + oscGain * pm));
  }

  const synth = pv.limiterInputGain * osc0 / sumAmp * decay(dsp.gainEnv, envPhase, 1);

  const limited = dsp.limiter.process(synth, Math.abs(synth));
  return limited + pv.reverbMix * dsp.fdn.process(limited, pv.feedback);
}

onmessage = async (event) => {
  const basiclimiter = await BasicLimiter();
  const pv = event.data; // Parameter values.

  const upFold = parseInt(menuitems.oversampleItems[pv.overSample]);
  const upRate = upFold * pv.sampleRate;

  const envelopeInterval = Math.floor(upRate * 0.001);
  const modDecayDuration = Math.floor(upRate * pv.modDecayDuration);

  const getBezierEasing = (p) => BezierEasing(p[0], p[1], p[2], p[3]);
  let dsp = {
    rng: new PcgRandom(BigInt(pv.seed + 1)),
    rngCh: new PcgRandom(BigInt(pv.seed + pv.channel * 65537)),
    overtone: [],

    renderDuration: Math.floor(upRate * pv.renderDuration),
    modDecayDuration: modDecayDuration,
    pitchSuperellipseDuration: Math.floor(upRate * pv.pitchSuperellipseDuration),
    currentSample: 0,

    baseDelta: pv.baseFreq / upRate,
    maxPitchEnvInv: 1,

    phase0: new Array(pv.nOvertone).fill(0.75),
    phase1: 0,
    phase2: 0,

    gainEnv: getBezierEasing(pv.gainBezier),
    pitchEnv: getBezierEasing(pv.pitchBezier),

    envInterval: Math.floor(upRate * pv.modEnvHoldSecond),
    modEnv: new SamplingEnvelope(
      envelopeInterval, Math.ceil(modDecayDuration / envelopeInterval),
      x => superellipse(x, pv.modCurve)),

    fdn: new FeedbackDelayNetwork(pv.matrixSize, upRate, pv.maxDelayTime),

    limiter: new basiclimiter.Limiter(),
  };

  // Overtone.
  const otRng = menuitems.overtoneRandomizeItems[pv.overtoneRandomizeType] === "Mono"
    ? dsp.rng
    : dsp.rngCh;
  dsp.overtone.push(1);
  for (let idx = 1; idx < pv.nOvertone; ++idx) {
    dsp.overtone.push(
      util.uniformDistributionMap(otRng.number(), 1, pv.pitchRandomRange));
  }

  // FDN.
  dsp.fdn.randomizeMatrix("SpecialOrthogonal", pv.seed + 2);
  for (let i = 0; i < dsp.fdn.delay.length; ++i) {
    dsp.fdn.delay[i].setTime(upRate * pv.reverbBaseSecond * (1 + dsp.rngCh.number()));
    dsp.fdn.lowpass[i].setCutoff(Math.min(pv.reverbLowpassHz / upRate, 0.5));
    dsp.fdn.highpass[i].setCutoff(0);
  }

  // Limiter.
  dsp.limiter.resize(upRate);
  dsp.limiter.prepare(
    upRate, pv.limiterAttack, pv.limiterSustain, pv.limiterRelease, 1, 0);
  const latency = upFold * dsp.limiter.latency(upFold);
  for (let i = 0; i < latency; ++i) process(upRate, pv, dsp);

  // Process.
  let sound = new Array(Math.floor(pv.sampleRate * pv.renderDuration));
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

  // Delete wasm instance.
  dsp.limiter.delete();

  // Post effect.
  let gainEnv = 1;
  let decay = Math.pow(pv.decayTo, 1.0 / sound.length);
  for (let i = 0; i < sound.length; ++i) {
    sound[i] *= gainEnv;
    gainEnv *= decay;
  }

  postMessage({sound: sound});
}
