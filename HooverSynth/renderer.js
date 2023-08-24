// Copyright 2023 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import * as delay from "../common/dsp/delay.js";
import {Limiter} from "../common/dsp/limiter.js";
import {downSampleLinearPhase} from "../common/dsp/multirate.js";
import {SlopeFilter} from "../common/dsp/slopefilter.js";
import {SVF} from "../common/dsp/svf.js";
import {lerp, syntonicCommaRatio} from "../common/util.js";

import * as menuitems from "./menuitems.js";

const exp2Scaler = Math.log(2);

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
  if (pv.limiterEnable === 1) sig = dsp.limiter.process(sig);
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

  dsp.limiter = new Limiter(
    Math.floor(upRate * 0.002), Math.floor(upRate * 0.002), 0, pv.limiterThreshold);

  // Process.
  for (let i = 0; i < sound.length; ++i) sound[i] = process(upRate, pv, dsp);
  sound = downSampleLinearPhase(sound, upFold);

  // Post effect.
  let gainEnv = 1;
  const decay = Math.pow(pv.decayTo, 1.0 / sound.length);
  for (let i = 0; i < sound.length; ++i) {
    sound[i] *= gainEnv;
    gainEnv *= decay;
  }

  postMessage({sound: sound});
}
