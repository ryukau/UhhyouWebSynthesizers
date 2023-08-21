// Copyright 2023 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {CompanderMuLaw} from "../common/dsp/compander.js";
import * as delay from "../common/dsp/delay.js";
import * as multirate from "../common/dsp/multirate.js";
import {ResonantOnePole} from "../common/dsp/resonantfilter.js";
import {SlopeFilter} from "../common/dsp/slopefilter.js";
import {SVF} from "../common/dsp/svf.js";
import {lerp, syntonicCommaRatio, uniformDistributionMap} from "../common/util.js";
import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";

import * as menuitems from "./menuitems.js";

const exp2Scaler = Math.log(2);

// Lowpass filter coefficient specialized for 8x oversampling.
// Sos stands for second order sections.
//
// ```python
// import numpy
// from scipy import signal
//
// samplerate = 48000
// uprate = samplerate * 8
// sos = signal.butter(16, (3 / 4) * samplerate / 2, output="sos", fs=uprate)
// ```
export const sos8FoldFullStage = [
  [
    1.2142602290438502e-14, 2.4285204580877004e-14, 1.2142602290438502e-14,
    -1.4849097351631897, 0.5517265598664537
  ],
  [1.0, 2.0, 1.0, -1.4978110534673281, 0.5652084017560705],
  [1.0, 2.0, 1.0, -1.5237803593822528, 0.5923462544990569],
  [1.0, 2.0, 1.0, -1.5631259986229586, 0.6334623385134278],
  [1.0, 2.0, 1.0, -1.6162421621831222, 0.6889685822956186],
  [1.0, 2.0, 1.0, -1.6835103750365576, 0.7592636783863952],
  [1.0, 2.0, 1.0, -1.765140744462037, 0.8445671883100514],
  [1.0, 2.0, 1.0, -1.8609318131624575, 0.9446685897491758],
];

// Lowpass filter coefficient specialized for 8x oversampling.
// Sos stands for second order sections.
//
// ```python
// import numpy
// from scipy import signal
//
// samplerate = 48000
// uprate = samplerate * 4
// sos = signal.butter(16, (5 / 6) * samplerate / 2, output="sos", fs=uprate)
// ```
export const sos4FoldFullStage = [
  [
    1.0166449033595567e-09, 2.0332898067191133e-09, 1.0166449033595567e-09,
    -0.9880912706543798, 0.24546178918419576
  ],
  [1.0, 2.0, 1.0, -1.0026276064698627, 0.26378443948040126],
  [1.0, 2.0, 1.0, -1.0324209065113787, 0.30133807230506304],
  [1.0, 2.0, 1.0, -1.0789673566962448, 0.36000858873318975],
  [1.0, 2.0, 1.0, -1.1446496629593417, 0.442799323866397],
  [1.0, 2.0, 1.0, -1.2329028338243355, 0.554040011190656],
  [1.0, 2.0, 1.0, -1.3484215583297854, 0.6996481767314274],
  [1.0, 2.0, 1.0, -1.4973605900564557, 0.8873817175922948],
];

class PulseOscillator {
  constructor() {
    this.phase = Number.MAX_SAFE_INTEGER;
    this.currentPeriod = 0;
    this.currentWidth = 0;
  }

  process(periodSamples, pulseWidth) {
    if (++this.phase >= this.currentPeriod) {
      this.phase = 0;
      this.currentPeriod = periodSamples;
      this.currentWidth = Math.floor(this.currentPeriod * pulseWidth);
    }
    return this.phase < this.currentWidth ? 0 : 1;
  }
}

// Alpha Juno 2 PWM (pulse-width modulation) saw. Output value is in [0, 1].
// A sawtooth multiplied by a PWMed pulse that has a pitch 1 octave above.
class SawOscillator {
  constructor() {
    this.phase = Number.MAX_SAFE_INTEGER;
    this.currentPeriod = 0;
    this.pulseOsc = new PulseOscillator();
  }

  process(periodSamples, pulseWidth) {
    if (++this.phase >= this.currentPeriod) {
      this.phase = 0;
      this.currentPeriod = periodSamples;
    }
    const saw = this.phase / this.currentPeriod;
    const pulse = this.pulseOsc.process(periodSamples / 2, pulseWidth);
    return saw * pulse;
  }
}

class TriangleLFO {
  constructor() {
    this.phase = Number.MAX_SAFE_INTEGER;
    this.currentPeriod = 0;
  }

  process(periodSamples) {
    if (++this.phase >= this.currentPeriod) {
      this.phase = 0;
      this.currentPeriod = periodSamples;
    }
    const value = 2 * this.phase / this.currentPeriod;
    return value < 1 ? value : 2 - value;
  }
}

class Chorus {
  constructor(sampleRate, baseTimeSeconds, modTimeSeconds) {
    this.baseTime = Math.ceil(sampleRate * baseTimeSeconds);
    this.modTime = Math.ceil(sampleRate * modTimeSeconds);
    this.delay
      = new delay.IntDelay(sampleRate, (this.baseTime + this.modTime) / sampleRate);
  }

  process(input, mod) {
    this.delay.setTime(this.baseTime + Math.floor(mod * this.modTime));
    return input - this.delay.process(input);
  }
}

// AD envelope. Attack is linear. Decay is exponential.
class Envelope {
  constructor(
    attackStartAmplitude,
    attackTimeSamples,
    decayEndAmplitude,
    decayTimeSamples,
  ) {
    this.counter = 0;
    this.attackStartAmplitude = attackStartAmplitude;
    this.attackTimeSamples = attackTimeSamples;

    this.decayEndAmplitude = decayEndAmplitude;
    const decayRange = 1 - decayEndAmplitude;
    this.decayMultiplier
      = Math.pow(decayRange * 1e-3 + Number.EPSILON, 1 / decayTimeSamples);
    this.gain = decayRange / this.decayMultiplier;
  }

  process() {
    if (this.counter < this.attackTimeSamples) {
      ++this.counter;
      return lerp(this.attackStartAmplitude, 1, this.counter / this.attackTimeSamples);
    }
    this.gain *= this.decayMultiplier;
    return this.gain + this.decayEndAmplitude;
  }
}

function process(upRate, pv, dsp) {
  let sig = 0;

  const env = dsp.envelopeGain * dsp.envelope.process();
  const pwmPeriod
    = upRate / (pv.pwmLfoRateHz * Math.exp(exp2Scaler * pv.pwmLfoRateEnvOctave * env));
  const pwmLfo = dsp.pwmLfo[0].process(pwmPeriod);

  const oscPeriod
    = upRate / (pv.noteNumber * Math.exp(exp2Scaler * pv.pitchEnvOctave * env));

  // Extra sub oscillators.
  sig += dsp.saw0.process(oscPeriod * 4 * syntonicCommaRatio, pv.subPwmAmount * pwmLfo);
  sig += dsp.pulse0.process(oscPeriod * 2 * syntonicCommaRatio, 0.51);
  sig *= pv.subExtraMix;

  // Oscillators from original hoover sound recipe.
  const mainPulseWidth = pv.mainPwmAmount * pwmLfo;
  sig += dsp.pulse1.process(oscPeriod * 2, 0.5);
  sig += dsp.pulse2.process(oscPeriod, mainPulseWidth);
  sig += dsp.saw1.process(oscPeriod / 2, mainPulseWidth);

  // Chorus.
  let chrs = dsp.chorus[0].process(sig, dsp.isChorusLfoInverted ? 1 - pwmLfo : pwmLfo);
  for (let idx = 1; idx < dsp.chorus.length; ++idx) {
    const lfo = dsp.pwmLfo[idx].process(pwmPeriod / dsp.pwmLfoFreqRatio[idx]);
    chrs = dsp.chorus[idx].process(chrs, dsp.isChorusLfoInverted ? 1 - lfo : lfo);
  }
  sig += pv.chorusMix * (chrs - sig);
  sig *= lerp(1, chrs, pv.chorusAM);

  // sig *= env;

  if (pv.toneSlope < 1) sig = dsp.slopeFilter.process(sig);
  if (pv.dcHighpassHz > 0) sig = dsp.dcHighpass.hp(sig);
  return sig;
}

onmessage = async (event) => {
  const pv = event.data; // Parameter values.

  const upFold = parseInt(menuitems.oversampleItems[pv.overSample]);
  const upRate = upFold * pv.sampleRate;
  let sound = new Array(Math.floor(upRate * pv.renderDuration)).fill(0);

  let dsp = {};
  dsp.isChorusLfoInverted = pv.channel % 2 === 0 ? false : true;
  dsp.slopeFilter = new SlopeFilter(Math.floor(Math.log2(24000 / 1000)));
  dsp.slopeFilter.setCutoff(upRate, 1000, pv.toneSlope, true);
  dsp.dcHighpass = new SVF(pv.dcHighpassHz / upRate, Math.SQRT1_2);

  dsp.envelopeGain = pv.negativeEnvelope === 0 ? 1 : -1;
  dsp.envelope = new Envelope(
    pv.attackLevel,
    Math.floor(upRate * pv.attackTimeSeconds),
    pv.decayLevel,
    Math.floor(upRate * pv.decayTimeSeconds),
  );

  dsp.pulse0 = new PulseOscillator();
  dsp.pulse1 = new PulseOscillator();
  dsp.pulse2 = new PulseOscillator();
  dsp.saw0 = new PulseOscillator();
  dsp.saw1 = new SawOscillator();

  dsp.pwmLfo = new Array(pv.chorusDelayCount);
  dsp.pwmLfoFreqRatio = new Array(pv.chorusDelayCount);
  dsp.chorus = new Array(pv.chorusDelayCount);
  for (let idx = 0; idx < dsp.chorus.length; ++idx) {
    dsp.pwmLfo[idx] = new TriangleLFO();
    dsp.pwmLfoFreqRatio[idx] = Math.exp(exp2Scaler * lerp(0, idx, pv.chorusLfoSpread));
    dsp.chorus[idx]
      = new Chorus(upRate, pv.chorusTimeBaseSeconds, pv.chorusTimeModSeconds);
  }

  dsp.compander = new CompanderMuLaw(pv.companderMu);
  dsp.resonantFilter = new ResonantOnePole();

  // Process.
  for (let i = 0; i < sound.length; ++i) sound[i] = process(upRate, pv, dsp);

  // Down-sampling.
  if (upFold == 8) {
    let decimationLowpass = new multirate.SosFilter(sos8FoldFullStage);
    for (let i = 0; i < sound.length; ++i) {
      for (let k = 0; k < upFold; ++k) decimationLowpass.push(sound[upFold * i + k]);
      sound[i] = decimationLowpass.output();
    }
  } else if (upFold == 4) {
    let decimationLowpass = new multirate.SosFilter(sos4FoldFullStage);
    for (let i = 0; i < sound.length; ++i) {
      for (let k = 0; k < upFold; ++k) decimationLowpass.push(sound[upFold * i + k]);
      sound[i] = decimationLowpass.output();
    }
  } else if (upFold == 2) {
    let halfband = new multirate.HalfBandIIR();
    for (let i = 0; i < sound.length; ++i) {
      const hb0 = sound[2 * i];
      const hb1 = sound[2 * i + 1];
      sound[i] = halfband.process(hb0, hb1);
    }
  }
  if (upFold > 1) sound = sound.slice(0, Math.floor(pv.sampleRate * pv.renderDuration));

  // Post effect.
  let gainEnv = 1;
  const decay = Math.pow(pv.decayTo, 1.0 / sound.length);
  for (let i = 0; i < sound.length; ++i) {
    sound[i] *= gainEnv;
    gainEnv *= decay;
  }

  postMessage({sound: sound});
}
