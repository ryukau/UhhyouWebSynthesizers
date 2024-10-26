// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {AdaptiveFilterLMS} from "../common/dsp/adaptivefilter.js"
import {SingleSideBandAmplitudeModulator} from "../common/dsp/analyticsignalfilter.js"
import * as delay from "../common/dsp/delay.js";
import {ExpPolyEnvelope} from "../common/dsp/envelope.js";
import {randomSpecialOrthogonal} from "../common/dsp/fdn.js";
import {Limiter} from "../common/dsp/limiter.js"
import {downSampleIIR} from "../common/dsp/multirate.js";
import {SlopeFilter} from "../common/dsp/slopefilter.js";
import {
  DoubleEMAFilter,
  EMAHighpass,
  normalizedCutoffToOnePoleKp
} from "../common/dsp/smoother.js";
import {SosFilterImmediate, sosMatchedBandpass} from "../common/dsp/sos.js";
import {SVF} from "../common/dsp/svf.js";
import {
  clamp,
  exponentialMap,
  lerp,
  normalDistributionMap,
  syntonicCommaRatio,
  uniformFloatMap
} from "../common/util.js";
import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";

import {membranePitchTable} from "./membranepitch.js";
import * as menuitems from "./menuitems.js";

class SinOsc {
  constructor(gain, decaySamples, freqRatio, noise, initialPhase = 0) {
    this.gain = gain;
    this.env = 1;
    this.decay = Math.pow(1e-3, 1 / decaySamples);
    this.noise = Math.log(2 ** noise); // Scaling as exp2.

    this.phase = initialPhase;
    this.freqRatio = freqRatio;
  }

  process(rng, phaseDelta) {
    this.env *= this.decay;
    const mod = (0.7 + 0.3 * this.env)
      * Math.exp(uniformFloatMap(rng.number(), -this.noise, this.noise));

    this.phase += this.freqRatio * phaseDelta * mod;
    this.phase -= Math.floor(this.phase);
    return this.gain * Math.sin(2 * Math.PI * this.phase);
  }
}

class LpComb {
  // *Cut = *Hz / sampleRate.
  constructor(sampleRate, combHz, feedback, lowpassHz, highpassHz) {
    this.delay = new delay.IntDelay(sampleRate * 0.1);
    this.lp = 0;
    this.hp = 0;

    this.setCutoff(
      sampleRate / combHz, feedback, lowpassHz / sampleRate, highpassHz / sampleRate);
  }

  setCutoff(combSamples, feedback, lowpassCut, highpassCut) {
    this.delay.setTime(Math.floor(combSamples));
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

class SealHighTone {
  constructor(rng, overtoneRatio = 270 / 5344, noiseRange = 1000 / 48000) {
    this.noiseRange = noiseRange;
    this.mod1Ratio = overtoneRatio;
    this.mod2Ratio = 7 * overtoneRatio;

    this.carrierPhase = 0;
    const gainBase = [0.8, 0.9, 1.0, 0.4, 0.3];
    const gainSum = gainBase.reduce((p, v) => p + v);
    this.mod1Gain = gainBase.map(v => v / gainSum);
    this.mod1Phase = new Array(5).fill(0).map(_ => rng.number());
    this.mod2Phase = rng.number();

    this.am = new SingleSideBandAmplitudeModulator();
  }

  process(freqNormalized, rng) {
    this.carrierPhase += freqNormalized
      + uniformFloatMap(rng.number(), -this.noiseRange, this.noiseRange);
    this.carrierPhase -= Math.floor(this.carrierPhase);
    const car = Math.sin(2 * Math.PI * this.carrierPhase);

    let mod1 = 0;
    for (let idx = 0; idx < this.mod1Phase.length; ++idx) {
      this.mod1Phase[idx] += freqNormalized * (idx + 1) * this.mod1Ratio;
      this.mod1Phase[idx] -= Math.floor(this.mod1Phase[idx]);
      mod1 += this.mod1Gain[idx] * Math.sin(2 * Math.PI * this.mod1Phase[idx]);
    }

    this.mod2Phase += freqNormalized * this.mod2Ratio;
    this.mod2Phase -= Math.floor(this.mod2Phase);
    const mod2 = Math.sin(2 * Math.PI * this.mod2Phase);

    return this.am.upper(car, mod1 * mod2);
  }
}

class CascadedSVF {
  constructor(cascade) {
    this.s1 = new Array(cascade).fill(0);
    this.s2 = new Array(cascade).fill(0);
  }

  lp(v0, cutoffNormalized, Q) {
    const g = Math.tan(clamp(cutoffNormalized, 0.00001, 0.49998) * Math.PI);
    const k = 1 / Q;
    const d = 1 / (1 + g * (g + k));
    for (let idx = 0; idx < this.s1.length; ++idx) {
      const v1 = (this.s1[idx] + g * (v0 - this.s2[idx])) * d;
      const v2 = this.s2[idx] + g * v1;
      this.s1[idx] = 2 * v1 - this.s1[idx];
      this.s2[idx] = 2 * v2 - this.s2[idx];
      v0 = v2;
    }
    return v0;
  }

  hp(v0, cutoffNormalized, Q) {
    const g = Math.tan(clamp(cutoffNormalized, 0.00001, 0.49998) * Math.PI);
    const k = 1 / Q;
    const d = 1 / (1 + g * (g + k));
    for (let idx = 0; idx < this.s1.length; ++idx) {
      const v1 = (this.s1[idx] + g * (v0 - this.s2[idx])) * d;
      const v2 = this.s2[idx] + g * v1;
      this.s1[idx] = 2 * v1 - this.s1[idx];
      this.s2[idx] = 2 * v2 - this.s2[idx];
      v0 = v0 - k * v1 - v2;
    }
    return v0;
  }
}

class FDN {
  // `delay` is Array.
  constructor(delay, feedbackGain, seed) {
    const create2dArray = (x, y) => {
      let a = new Array(x);
      for (let i = 0; i < a.length; ++i) a[i] = new Array(y).fill(0);
      return a;
    };

    this.delay = delay;
    this.matrix = create2dArray(this.delay.length, this.delay.length);
    this.buf = create2dArray(2, this.delay.length);
    this.bufIndex = 0;
    this.feedbackGain = feedbackGain;

    randomSpecialOrthogonal(this.matrix, seed);
  }

  process(input, rng) {
    this.bufIndex ^= 1;
    let front = this.buf[this.bufIndex];
    let back = this.buf[this.bufIndex ^ 1];
    front.fill(0);
    for (let i = 0; i < front.length; ++i) {
      for (let j = 0; j < front.length; ++j) front[i] += this.matrix[i][j] * back[j];
    }

    for (let i = 0; i < front.length; ++i) {
      front[i] = this.delay[i].process(input + this.feedbackGain * front[i], rng);
    }

    return front.reduce((sum, val) => sum + val, 0);
  }
}

class ReverbDelay {
  constructor(maxDelayTimeInSamples, lowpassCutoff, highpassCutoff, delayTimeSample) {
    this.lowpass = new DoubleEMAFilter();
    this.lowpass.setCutoff(lowpassCutoff);

    this.highpass = new EMAHighpass();
    this.highpass.setCutoff(highpassCutoff);

    this.delay = new delay.CubicDelay(maxDelayTimeInSamples);
    this.delay.setTime(delayTimeSample);
  }

  process(input) {
    input = this.lowpass.process(input);
    input = this.highpass.process(input);
    return this.delay.process(input);
  }
}

function process(upRate, pv, dsp) {
  const bodyEnv = dsp.bodyEnvelope.process();
  const oscFreq = dsp.bodyBaseFreq + dsp.bodyEnvToPitch * bodyEnv;
  const osc1 = dsp.bodyOsc[0].process(dsp.rng, oscFreq);
  let syn = osc1;
  for (let idx = 1; idx < dsp.bodyOsc.length; ++idx) {
    syn += dsp.bodyOsc[idx].process(dsp.rng, oscFreq);
  }
  syn *= bodyEnv;

  syn *= 1 + pv.bodyAM * bodyEnv * (osc1 - 1);

  const bodyMod
    = Math.tanh(
        dsp.bodyAmOsc.process(dsp.rng, dsp.bodyBaseFreq / 3) * pv.bodyModSaturationGain)
    / pv.bodyModSaturationGain;
  syn = dsp.bodySSBAM.upper(syn, 1 + pv.bodyAM * bodyEnv * (bodyMod - 1));

  for (let x of dsp.bodyHighpass) syn = x.hp(syn);
  syn = dsp.bodyLowpass.lp(syn);

  const noiseEnv = dsp.noiseEnvelope.process();
  let noise
    = noiseEnv * normalDistributionMap(dsp.rng.number(), dsp.rng.number(), 0, 1 / 3);
  let sum = 0;
  for (let comb of dsp.noiseComb) sum += comb.process(noise);
  noise = noiseEnv * dsp.noiseBandpass.process(lerp(noise, sum, pv.noiseCombMix));

  let hightone = dsp.hightoneOsc.process(dsp.hightoneFreq, dsp.rng);
  hightone = dsp.hightoneHighpass.hp(hightone, dsp.hightoneFreq * 0.8982, Math.SQRT1_2);
  hightone = dsp.hightoneLowpass.lp(hightone, dsp.hightoneFreq * 1.684, Math.SQRT1_2);
  dsp.hightoneFreq *= dsp.hightoneDecay;

  let sig = lerp(syn, noise, pv.bodyNoiseMix);
  sig += pv.hightoneGain * hightone;

  sig += pv.reverbMix * dsp.reverb.process(sig);

  if (pv.dcHighpassHz > 0) sig = dsp.dcHighpass.hp(sig);
  if (pv.toneSlope < 1) sig = dsp.slopeFilter.process(sig);
  const error = dsp.adaptiveFilter.process(sig, sig);
  sig = lerp(sig - error, error, pv.adaptiveFilterMix);
  if (pv.limiterEnable === 1) sig = dsp.limiter.process(sig);
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

  dsp.bodyEnvelope
    = new ExpPolyEnvelope(upRate, pv.bodyAttackSeconds, pv.bodyEnvelopeCurve);
  dsp.bodyOsc = [];
  let bodyGain = [0, 1, 2].map(v => pv.bodyOvertoneGain ** v);
  let bodyGainSum = bodyGain.reduce((p, c) => p + c);
  for (let idx = 0; idx < 3; ++idx) {
    dsp.bodyOsc.push(new SinOsc(
      bodyGain[idx] / bodyGainSum, pv.bodyPitchDecaySeconds * upRate, idx + 1,
      pv.bodyNoise));
  }
  dsp.bodyEnvToPitch = pv.bodyPitchModHz / upRate;
  dsp.bodyBaseFreq = pv.bodyPitchBaseHz / upRate;
  dsp.bodyAmOsc = new SinOsc(
    1, 2 * pv.bodyPitchDecaySeconds * upRate, 2 ** pv.bodyModOctave, 1, rng.number());
  dsp.bodySSBAM = new SingleSideBandAmplitudeModulator();
  dsp.bodyHighpass = [];
  for (let i = 0; i < 2; ++i) {
    dsp.bodyHighpass.push(new SVF(pv.bodyHighpassHz / upRate, Math.SQRT1_2));
  }
  dsp.bodyLowpass = new SVF(pv.bodyLowpassHz / upRate, 0.5);

  dsp.noiseEnvelope
    = new ExpPolyEnvelope(upRate, pv.noiseAttackSeconds, pv.noiseEnvelopeCurve);
  dsp.noiseBandpass = new SosFilterImmediate(sosMatchedBandpass(
    clamp(pv.noiseBandpassHz / upRate, 10 / 48000, 0.49998), Math.SQRT1_2));

  dsp.noiseComb = [];
  for (let idx = 0; idx < 4; ++idx) {
    dsp.noiseComb.push(new LpComb(
      upRate,
      pv.noiseCombHz * (idx + 1)
        * lerp(1, exponentialMap(rng.number(), 0.5, 2), pv.noiseCombRandom),
      pv.noiseCombFeedback, pv.noiseCombLowpassHz, pv.noiseCombHighpassHz));
  }

  dsp.hightoneDecay = Math.pow(pv.hightoneEndHz / pv.hightoneStartHz, 1 / soundLength);
  dsp.hightoneFreq = pv.hightoneStartHz / upRate;
  dsp.hightoneOsc = new SealHighTone(rng, pv.hightoneOvertoneRatio);
  dsp.hightoneLowpass = new CascadedSVF(8);
  dsp.hightoneHighpass = new CascadedSVF(8);

  dsp.dcHighpass = new SVF(pv.dcHighpassHz / upRate, Math.SQRT1_2);
  dsp.slopeFilter = new SlopeFilter(Math.floor(Math.log2(24000 / 1000)));
  dsp.slopeFilter.setCutoff(upRate, 1000, pv.toneSlope, true);
  dsp.adaptiveFilter = new AdaptiveFilterLMS(256, 0.1);
  dsp.limiter = new Limiter(
    Math.floor(upRate * pv.limiterAttackSeconds), 0, 0, pv.limiterThreshold);

  let reverbDelay = new Array(16);

  const getPitchDebug = () => {
    let key = menuitems.reverbPitchTypeItems[pv.reverbPitchType];
    console.log(key);
    let src = structuredClone(membranePitchTable[key][pv.reverbPitchIndex]);
    src.shift();
    return src.map(v => v / src[0]);
  };
  const pitches = getPitchDebug();
  console.log(pitches);

  const fdnBaseTime = upRate / pv.reverbTimeFrequencyHz;
  const fdnRandomFunc = () => exponentialMap(
    rng.number(), 1 / (syntonicCommaRatio * syntonicCommaRatio), 1);
  for (let idx = 0; idx < reverbDelay.length; ++idx) {
    const delayTime = fdnBaseTime * pitches[idx] * fdnRandomFunc();
    reverbDelay[idx] = new ReverbDelay(
      Math.floor(delayTime * 2 + 0.5),
      Math.min(pv.reverbLowpassHz / upRate, 0.5),
      20 / upRate,
      delayTime,
    );
  }
  dsp.reverb = new FDN(reverbDelay, pv.reverbFeedback, pv.seed + 2);

  // Discard latency part.
  if (pv.limiterEnable === 1) {
    for (let i = 0; i < dsp.limiter.latency; ++i) process(upRate, pv, dsp);
  }

  // Process.
  let sound = new Array(Math.floor(upRate * pv.renderDuration)).fill(0);
  for (let i = 0; i < sound.length; ++i) sound[i] = process(upRate, pv, dsp);
  sound = downSampleIIR(sound, upFold);

  // Post effect.
  let gainEnv = 1;
  let decay = Math.pow(pv.decayTo, 1.0 / sound.length);
  for (let i = 0; i < sound.length; ++i) {
    sound[i] *= gainEnv;
    gainEnv *= decay;
  }

  postMessage({sound: sound});
}
