// Copyright 2023 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import * as delay from "../common/dsp/delay.js";
import {DoubleEmaADEnvelope} from "../common/dsp/envelope.js"
import {downSampleIIR} from "../common/dsp/multirate.js";
import {HP1, LP1} from "../common/dsp/onepole.js"
import {normalizedCutoffToOnePoleKp, RateLimiter} from "../common/dsp/smoother.js";
import {SVF, SVFBell, SVFHighShelf, SVFNotch} from "../common/dsp/svf.js";
import {OverlapOscillator} from "../common/dsp/wavetable.js";
import {dbToAmp, exponentialMap, lerp, uniformDistributionMap} from "../common/util.js";
import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";
import {newPocketFFTHelper} from "../lib/pocketfft/pocketffthelper.js";

import * as menuitems from "./menuitems.js";

// BLIT: band limited impulse train.
class BlitOscillator {
  constructor(initialPhase = 0) { this.phase = initialPhase; }

  // `freqNormalized` in [0, 0.5].
  process(freqNormalized) {
    this.phase += freqNormalized;
    this.phase -= Math.floor(this.phase);
    const denom = Math.sin(Math.PI * this.phase);
    if (Math.abs(denom) <= Number.EPSILON) return 1;
    const M = 2 * Math.floor(0.5 / freqNormalized) + 1;
    const output = freqNormalized * Math.sin(Math.PI * M * this.phase) / denom;
    return output;
  }
}

class LpComb {
  // combSamples = sampleRate / combHz.
  // *Cut = *Hz / sampleRate.
  constructor(sampleRate, combSamples, feedback, lowpassCut, highpassCut) {
    this.delay = new delay.Delay(sampleRate, 0.1);
    this.lp = 0;
    this.hp = 0;

    this.setCutoff(combSamples, feedback, lowpassCut, highpassCut);
  }

  setCutoff(combSamples, feedback, lowpassCut, highpassCut) {
    this.delay.setTime(combSamples);
    this.feedback = feedback;
    this.k_lp = normalizedCutoffToOnePoleKp(lowpassCut);
    this.k_hp = normalizedCutoffToOnePoleKp(highpassCut);
  }

  process(x0) {
    let s0 = this.delay.process(x0 + this.feedback * this.lp);

    this.lp += this.k_lp * (s0 - this.lp);
    s0 = this.lp;

    this.hp += this.k_hp * (s0 - this.hp);
    s0 = this.lp - this.hp;
    return s0;
  }
}

class MaybeFormant {
  constructor(rng, sampleRate, cutOctave, QRatio) {
    const cutScale = (2 ** cutOctave) / sampleRate;
    const rnd = () => 2 ** rng.number() * cutScale;

    this.lpCombParameters = [
      [1 / (360 * rnd()), 0.9, 500 * rnd(), 100 * rnd()],
      [1 / (3200 * rnd()), 0.95, 2000 * rnd(), 500 * rnd()],
      [1 / (500 * rnd()), 1, 2000 * rnd(), 3000 * rnd()],
    ];
    this.lpComb = [];
    for (let prm of this.lpCombParameters) {
      this.lpComb.push(new LpComb(sampleRate, ...prm));
    }

    this.bellParameters = [
      [100 * rnd(), 2.0 * QRatio, dbToAmp(20)],
      [800 * rnd(), 2.0 * QRatio, dbToAmp(27)],
      [1100 * rnd(), 2.0 * QRatio, dbToAmp(27)],
      [2600 * rnd(), 1.0 * QRatio, dbToAmp(20)],
      [200 * rnd(), 0.5 * QRatio, dbToAmp(-30)],
      [500 * rnd(), 0.25 * QRatio, dbToAmp(-20)],
    ];
    this.bell = [];
    for (let prm of this.bellParameters) {
      this.bell.push(new SVFBell(...prm));
    }

    this.notchParameters = [
      [1500 * rnd(), 0.25 * QRatio],
      [4000 * rnd(), 1.0 * QRatio],
    ];
    this.notch = [];
    for (let prm of this.notchParameters) {
      this.notch.push(new SVFNotch(...prm));
    }

    this.highshelfParameters = [
      [16000 * cutScale, Math.SQRT1_2, dbToAmp(-20)],
    ];
    this.highshelf = [];
    for (let prm of this.highshelfParameters) {
      this.highshelf.push(new SVFHighShelf(...prm));
    }
  }

  process(x0, freqRatio) {
    for (let flt of this.lpComb) x0 += flt.process(x0);

    for (let idx = 0; idx < this.bell.length; ++idx) {
      const prm = this.bellParameters[idx];
      const flt = this.bell[idx];
      flt.setCutoff(prm[0] * freqRatio, prm[1], prm[2]);
      x0 = flt.process(x0);
    }

    for (let idx = 0; idx < this.notch.length; ++idx) {
      const prm = this.notchParameters[idx];
      const flt = this.notch[idx];
      flt.setCutoff(prm[0] * freqRatio, prm[1]);
      x0 = flt.process(x0);
    }

    for (let idx = 0; idx < this.highshelf.length; ++idx) {
      const prm = this.highshelfParameters[idx];
      const flt = this.highshelf[idx];
      flt.setCutoff(prm[0] * freqRatio, prm[1], prm[2]);
      x0 = flt.process(x0);
    }

    return x0;
  }
}

class NoiseEnvelope {
  constructor(sampleRate, decayTimeSeconds) {
    this.gain = 1;
    this.decay = Math.pow(Number.EPSILON, 1 / (decayTimeSeconds * sampleRate));
    this.phase = 0;
    this.lowpass = new LP1(4000 / sampleRate);
  }

  process(freqNormalized) {
    this.phase += freqNormalized;
    if (this.phase >= 1) {
      this.phase -= Math.floor(this.phase);
      this.gain = 1;
    }

    this.gain *= this.decay;
    return this.lowpass.process(this.gain);
  }
}

class NoiseFormant {
  constructor(rng, sampleRate, cutOctave, QRatio) {
    const cutScale = (2 ** cutOctave) / sampleRate;
    const rnd = () => 2 ** rng.number() * cutScale;

    this.bandpassParameters = [
      [1000 * rnd(), 2.0 * QRatio, dbToAmp(+0)],
      [2800 * rnd(), 2.0 * QRatio, dbToAmp(-5)],
      [3700 * rnd(), 2.0 * QRatio, dbToAmp(-10)],
      [5500 * rnd(), 1.0 * QRatio, dbToAmp(+0)],
      [8600 * rnd(), 0.5 * QRatio, dbToAmp(-10)],
    ];
    this.bandpass = [];
    for (let prm of this.bandpassParameters) {
      this.bandpass.push(new SVF(prm[0], prm[1]));
      prm[2] /= this.bandpassParameters.length;
    }

    this.lowpass = new SVF(6000, Math.SQRT1_2);
  }

  process(x0, freqRatio) {
    let sum = 0;
    for (let idx = 0; idx < this.bandpass.length; ++idx) {
      const prm = this.bandpassParameters[idx];
      const flt = this.bandpass[idx];
      flt.setCutoff(prm[0] * freqRatio, prm[1]);
      sum += prm[2] * flt.bp(x0);
    }
    return this.lowpass.lp(sum);
  }
}

class Pluck {
  constructor(
    sampleRate,
    jitterSeconds,
    delayTimeSeconds,
    feedbackGain,
    lowpassCutoffNormalized,
    highpassCutoffNormalized,
    allpassCutoffNormalized,
    allpassQ,
    allpassMod,
    delayTimeMod,
    delayTimeSlewRate,
  ) {
    this.outDelay = new delay.IntDelay(sampleRate, jitterSeconds);
    this.outDelay.setTime(sampleRate * jitterSeconds);

    this.delay = new delay.Delay(sampleRate, delayTimeSeconds * 2);
    this.delayTime = sampleRate * delayTimeSeconds;
    this.delay.setTime(this.delayTime);
    this.timeMod = delayTimeMod;
    this.timeLimiter = new RateLimiter(delayTimeSlewRate, this.delayTime);

    this.lowpass = new LP1(lowpassCutoffNormalized);
    this.highpass = new HP1(highpassCutoffNormalized);

    this.allpass = [];
    this.allpassCut = [];
    for (let idx = 0; idx < 2; ++idx) {
      this.allpass.push(new SVF(allpassCutoffNormalized, allpassQ));
      this.allpassCut.push(allpassCutoffNormalized);
    }
    this.allpassQ = allpassQ;
    this.allpassMod = allpassMod;

    this.fbSig = 0;
    this.fbGain = feedbackGain;
  }

  process(x0, lossThreshold, delayTimeModulation, feedbackModulation) {
    x0 += this.fbSig;
    x0 = this.highpass.process(x0);
    x0 = this.lowpass.process(x0);

    const maxCut = 0.48;
    for (let idx = 0; idx < this.allpass.length; ++idx) {
      const apMod = 2 ** (this.allpassMod * x0);
      this.allpass[idx].setCutoff(
        Math.min(this.allpassCut[idx] * apMod, maxCut), this.allpassQ);
      x0 = this.allpass[idx].ap(x0);
      if (Math.abs(x0) >= lossThreshold) this.allpassMod *= 0.99;
    }

    const timeMod = Math.pow(2, Math.min(this.timeMod * (x0 + delayTimeModulation), 1));
    this.delay.setTime(this.timeLimiter.process(this.delayTime * timeMod));
    this.fbSig = Math.min(this.fbGain * feedbackModulation, 1) * this.delay.process(x0);
    return this.outDelay.process(this.fbSig);
  }
}

function process(upRate, pv, dsp) {
  let sig = dsp.impulse;
  dsp.impulse = 0;

  let envOut = dsp.impactEnvelope.process();
  const am = Math.cos(2 * Math.PI * (dsp.amPhaseAcc += dsp.amPhaseScale * envOut));
  let envAm = envOut * am;

  let pulsePitchRatio = 2 ** (pv.pulsePitchOct + pv.pulseBendOct * envAm);
  let s0 = envAm * dsp.blitOsc.process(pulsePitchRatio * pv.pulseStartHz / upRate);
  s0 = dsp.formant.process(s0, pulsePitchRatio / 16);
  let freqMod = pv.pulseBendOct * lerp(envAm, envOut, pv.freqModMix);
  let grainFreq = (pv.pulseStartHz / upRate) * 2 ** (pv.pulsePitchOct + freqMod - 2);
  let s1 = envAm * envAm * dsp.grainOsc.processAA(grainFreq, dsp.grainOverlap)
    * dsp.grainOverlap;
  sig += 2 * lerp(s0, s1, pv.pulseType);

  let noise = uniformDistributionMap(dsp.rng.number(), -pv.noiseGain, pv.noiseGain);
  noise *= envOut * dsp.noiseEnvelope.process(grainFreq);
  noise = dsp.noiseFormant.process(noise, 2 ** (pv.pulseBendOct * envOut) / 16);
  sig += noise;

  let sum = 0;
  let fbMod = lerp(1, envOut, pv.feedbackMod);
  for (let idx = 0; idx < dsp.pluck.length; ++idx) {
    sum += dsp.pluck[idx].process(sig, pv.energyLossThreshold, -envAm, fbMod);
  }
  sig = sum;

  if (pv.dcHighpassHz > 0) sig = dsp.dcHighpass.hp(sig);
  return sig;
}

function generateTable(upRate, pv, rng) {
  let table = new Array(512).fill(0);
  let formant
    = new MaybeFormant(rng, upRate, pv.pulseFormantOctave, pv.pulseFormantQRatio);

  table[0] = formant.process(1, 1);
  for (let i = 0; i < table.length; ++i) table[i] = formant.process(0, 1);
  return table;
}

onmessage = async (event) => {
  const fft = await newPocketFFTHelper();
  const pv = event.data; // Parameter values.

  const upFold = parseInt(menuitems.oversampleItems[pv.overSample]);
  const upRate = upFold * pv.sampleRate;
  const rng = new PcgRandom(BigInt(pv.seed + pv.channel * 65537));

  let dsp = {
    rng: rng,

    impulse: pv.impulseGain,
    impactEnvelope: new DoubleEmaADEnvelope(),
    amPhaseAcc: 0,
    amPhaseScale: pv.impactEnvelopeAM * 48000 / upRate,

    blitOsc: new BlitOscillator(0.95),
    formant: new MaybeFormant(rng, upRate, pv.pulseFormantOctave, pv.pulseFormantQRatio),
    grainOsc: new OverlapOscillator(fft, generateTable(upRate, pv, rng)),
    grainOverlap: 1 - pv.grainOverlap,

    noiseEnvelope: new NoiseEnvelope(upRate, pv.noiseDecaySecond),
    noiseFormant:
      new NoiseFormant(rng, upRate, pv.noiseFormantOctave, pv.noiseFormantQRatio),

    dcHighpass: new SVF(pv.dcHighpassHz / upRate, Math.SQRT1_2),

    pluck: [],
  };

  dsp.impactEnvelope.noteOn(
    1, pv.impactEnvelopeAttack * upRate, pv.impactEnvelopeDecay * upRate);

  const freqRandLow = 2 ** -pv.randomFrequencyHz;
  const freqRandHigh = 2 ** pv.randomFrequencyHz;
  for (let idx = 0; idx < pv.delayCount; ++idx) {
    dsp.pluck.push(new Pluck(
      upRate,
      uniformDistributionMap(dsp.rng.number(), 0.0, pv.maxJitterSecond),
      1 / (pv.frequencyHz * exponentialMap(dsp.rng.number(), freqRandLow, freqRandHigh)),
      exponentialMap(dsp.rng.number(), 0.98, 1) * pv.feedbackGain,
      exponentialMap(dsp.rng.number(), 0.5, 2) * pv.lowpassHz / upRate,
      exponentialMap(dsp.rng.number(), 0.5, 2) * pv.highpassHz / upRate,
      exponentialMap(dsp.rng.number(), 0.5, 2) * pv.allpassCut * pv.frequencyHz / upRate,
      exponentialMap(dsp.rng.number(), 0.5, 2) * pv.allpassQ,
      pv.allpassMod,
      2 ** pv.delayTimeMod,
      pv.delayTimeSlewRate,
      ));
  }

  // Process.
  let sound = new Array(Math.floor(upRate * pv.renderDuration)).fill(0);
  for (let i = 0; i < sound.length; ++i) sound[i] = process(upRate, pv, dsp);
  sound = downSampleIIR(sound, upFold);

  postMessage({sound: sound});
}
