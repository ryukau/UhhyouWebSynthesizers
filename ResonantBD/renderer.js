// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {downSampleIIR} from "../common/dsp/multirate.js";
import {SVF, SVFBell, SVFHighShelf} from "../common/dsp/svf.js";
import * as util from "../common/util.js";
import BasicLimiter from "../common/wasm/basiclimiter.js";
import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";

import * as menuitems from "./menuitems.js";

const normal = (rng) => util.normalDistributionMap(rng.number(), rng.number(), 0, 1 / 3);
const superellipse = (x, n) => x < 0 ? 1 : (1 - x ** n) ** (1 / n);

class SuperellipseEnvelope {
  constructor(
    sampleRate,
    attackSeconds,
    transitionSeconds,
    decaySeconds,
    superellipseCurve,
  ) {
    this.attackSamples = Math.floor(sampleRate * attackSeconds);
    this.transitionSamples = Math.floor(sampleRate * transitionSeconds);
    this.decaySamples = Math.floor(sampleRate * decaySeconds);
    this.curve = superellipseCurve;

    this.counter = -1;
    this.state = 0; // 0: attack, 1: transitioning, 2: decay.
    this.transitionTarget = superellipse(1 / this.decaySamples, this.curve);
  }

  process() {
    ++this.counter;
    if (this.state === 0) {
      const phase = this.counter / this.attackSamples;
      if (phase >= 1) {
        this.counter = -1;
        this.state = 1;
      }
      return phase;
    } else if (this.state === 1) {
      const phase = this.counter / this.transitionSamples;
      if (phase >= 1) {
        this.counter = 0;
        this.state = 2;
      }
      return 1 + phase * (this.transitionTarget - 1);
    } else if (this.counter >= this.decaySamples) {
      return 0;
    }
    const phase = this.counter / this.decaySamples;
    return superellipse(phase, this.curve);
  }
}

function processModulation(upRate, pv, dsp) {
  dsp.clickPhase += Math.min(0.5, pv.clickPitchRatio * dsp.freq2);
  dsp.clickPhase -= Math.floor(dsp.clickPhase);
  const osc1 = Math.cos(2 * Math.PI * (dsp.clickPhase));
  const mod1 = osc1 * dsp.clickAmount * dsp.modEnvelope.process();
  ++dsp.currentSample;
  return mod1;
}

function process(upRate, pv, dsp) {
  const mod = processModulation(upRate, pv, dsp);

  let sig = dsp.pulseGain >= 1 ? 1 : dsp.pulseGain * normal(dsp.rng);
  dsp.pulseGain *= dsp.pulseDecay;

  dsp.pitch1 *= dsp.decay1;
  dsp.svf1.setCutoff((1 + dsp.pitch1) * dsp.freq1, pv.filter1Q);
  sig = dsp.svf1.lp(sig);

  sig = Math.sign(sig) * Math.abs(sig) ** pv.filterExponent;

  dsp.pitch2 *= dsp.decay2;
  dsp.svf2.setCutoff((1 + dsp.pitch2) * dsp.freq2 + mod, pv.filter2Q);
  sig = dsp.svf2.lp(sig);

  dsp.eq.setCutoff((1 + dsp.eqFeedback) * dsp.eqFreq, pv.eqQ, pv.eqGain);
  sig = dsp.eq.process(sig);
  dsp.eqFeedback = pv.eqFeedback * sig;

  sig *= pv.limiterInputGain;
  const peakAmp = dsp.limiter.processPeakHold(Math.abs(sig));
  const linear = peakAmp > 1 ? 1 / peakAmp : 1;
  const saturated = peakAmp >= Number.EPSILON ? Math.tanh(peakAmp) / peakAmp : 1;
  sig = dsp.limiter.applyGain(
    sig, peakAmp, util.lerp(linear, saturated, pv.limiterSaturationMix));

  return sig;
}

onmessage = async (event) => {
  const basiclimiter = await BasicLimiter();
  const pv = event.data; // Parameter values.

  const upFold = parseInt(menuitems.oversampleItems[pv.overSample]);
  const upRate = upFold * pv.sampleRate;

  const rngStereo = menuitems.noiseStereoItems[pv.noiseStereo] === "Mono" ? 0 : 65537;
  let dsp = {
    rng: new PcgRandom(BigInt(pv.seed + pv.channel * rngStereo)),

    impulse: 1,
    pulseGain: 1,
    pulseDecay: Math.pow(2 ** -24, 1 / (upRate * pv.noiseDecay)),

    freq1: pv.filter1Cut / upRate,
    freq2: pv.filter2Cut / upRate,
    pitch1: 2 ** pv.filter1PitchOct - 1,
    pitch2: 2 ** pv.filter2PitchOct - 1,
    decay1: Math.pow(2 ** -24, 1 / (upRate * pv.filter1DecaySeconds)),
    decay2: Math.pow(2 ** -24, 1 / (upRate * pv.filter2DecaySeconds)),

    eqFreq: pv.eqCut / upRate,
    eqFeedback: 0,

    limiter: new basiclimiter.Limiter(),
  };

  // Modulator.
  dsp.clickAmount = pv.clickAmount / upRate;
  dsp.modEnvelope = new SuperellipseEnvelope(upRate, 0.001, 0.001, pv.clickDecay, 0.23);
  dsp.clickPhase = 0;

  // Resonant Lowpass.
  dsp.svf1 = new SVF(dsp.freq, pv.filter1Q);
  dsp.svf2 = new SVF(dsp.freq2, pv.filter2Q);

  // Equalizer.
  const EqType = menuitems.eqTypeItems[pv.eqType] === "Bell" ? SVFBell : SVFHighShelf;
  dsp.eq = new EqType(dsp.eqFreq, pv.eqQ, pv.eqGain);

  // Limiter.
  dsp.limiter.resize(upRate);
  dsp.limiter.prepare(
    upRate, pv.limiterAttack, pv.limiterSustain, pv.limiterRelease, 1, 0);
  const latency = upFold * dsp.limiter.latency(upFold);
  for (let i = 0; i < latency; ++i) process(upRate, pv, dsp);

  // Process.
  let sound = new Array(Math.floor(upRate * pv.renderDuration)).fill(0);
  for (let i = 0; i < sound.length; ++i) sound[i] = process(upRate, pv, dsp);
  sound = downSampleIIR(sound, upFold);

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
