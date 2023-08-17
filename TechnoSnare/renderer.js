// Copyright 2023 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {AdaptiveFilterLMS} from "../common/dsp/adaptivefilter.js"
import {SingleSideBandAmplitudeModulator} from "../common/dsp/analyticsignalfilter.js"
import * as delay from "../common/dsp/delay.js";
import {ExpPolyEnvelope} from "../common/dsp/envelope.js"
import * as multirate from "../common/dsp/multirate.js";
import {SosFilter} from "../common/dsp/multirate.js";
import {AP1, HP1, LP1} from "../common/dsp/onepole.js"
import {SlopeFilter} from "../common/dsp/slopefilter.js";
import {normalizedCutoffToOnePoleKp} from "../common/dsp/smoother.js";
import {sosMatchedBandpass} from "../common/dsp/sos.js"
import {SVF} from "../common/dsp/svf.js";
import {
  clamp,
  dbToAmp,
  exponentialMap,
  lerp,
  normalDistributionMap,
  uniformDistributionMap
} from "../common/util.js";
import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";

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
      * Math.exp(uniformDistributionMap(rng.number(), -this.noise, this.noise));

    this.phase += this.freqRatio * phaseDelta * mod;
    this.phase -= Math.floor(this.phase);
    return this.gain * Math.sin(2 * Math.PI * this.phase);
  }
}

class LpComb {
  // *Cut = *Hz / sampleRate.
  constructor(sampleRate, combHz, feedback, lowpassHz, highpassHz) {
    this.delay = new delay.IntDelay(sampleRate, 0.1);
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
      + uniformDistributionMap(rng.number(), -this.noiseRange, this.noiseRange);
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

  if (pv.dcHighpassHz > 0) sig = dsp.dcHighpass.hp(sig);
  if (pv.toneSlope < 1) sig = dsp.slopeFilter.process(sig);
  const error = dsp.adaptiveFilter.process(sig, sig);
  return lerp(sig - error, error, pv.adaptiveFilterMix);
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
  dsp.noiseBandpass = new SosFilter(sosMatchedBandpass(
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

  postMessage({sound: sound});
}
