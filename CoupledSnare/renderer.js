// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {CubicDelay, Delay, IntDelay, LongAllpass} from "../common/dsp/delay.js";
import {constructSpecialOrthogonal, randomSpecialOrthogonal} from "../common/dsp/fdn.js";
import {Limiter} from "../common/dsp/limiter.js";
import {membranePitchTable} from "../common/dsp/membranepitch.js";
import {downSampleIIR} from "../common/dsp/multirate.js";
import {LP1} from "../common/dsp/onepole.js";
import {DoubleEMAFilter, EMAFilter, EMAHighpass} from "../common/dsp/smoother.js";
import {SVFBP, SVFHP, SVFLP} from "../common/dsp/svf.js";
import {
  clamp,
  dbToAmp,
  exponentialMap,
  lerp,
  syntonicCommaRatio,
  triangularNumber,
} from "../common/util.js";
import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";

import * as menuitems from "./menuitems.js";

class ImpulseSine {
  constructor(
    sampleRate,
    sineFreqNormalized,
    sineModLevel,
    sineModDecay,
    lowpass,
    noiseTransientSample,
  ) {
    this.phase = 0;
    this.pm = sineModLevel;
    this.freq = sineFreqNormalized;

    this.noiseSustainSample = Math.floor(sampleRate * sineFreqNormalized);

    this.expDecay = Math.pow(sineModDecay, 1 / this.noiseSustainSample);
    this.expGain = 1;

    this.windowPhaseGain = exponentialMap(lowpass, 1, this.noiseSustainSample);
    this.lowpass = 1 - lowpass;
  }

  process(rng) {
    this.expGain *= this.expDecay;

    let sin = 0;
    if (this.phase < 1) {
      const triangle = 1 - Math.abs(1 - 2 * this.phase);
      const wPhase = Math.min(this.windowPhaseGain * triangle, 1);
      const phi = 2 * Math.PI * this.phase;
      sin = Math.sin(phi);
      sin = Math.sin(sin + this.expGain * this.pm * phi);
      sin = lerp(sin, wPhase * sin, this.lowpass);
      this.phase += this.freq;
    }

    return sin;
  }
}

// The original implementation in Pd used this excitation.
class ImpulseOriginal {
  constructor(
    sampleRate,
    sineFreqNormalized,
    sineModLevel,
    sineModDecay,
    lowpass,
    noiseTransientSample,
  ) {
    const freq = exponentialMap(lowpass, 0.25, 4) * sineFreqNormalized;

    this.phase = 0;
    this.freq = freq;

    this.noiseRamp = 1 / Math.max(1, noiseTransientSample);
    this.noiseSustainSample = Math.floor(sampleRate * freq);
    this.noiseGate = 0;
    this.noiseLowpass = new SVFLP(freq, exponentialMap(sineModDecay, Math.SQRT1_2, 40));
    this.noiseGain = 1 + sineModLevel * 15;
  }

  process(rng) {
    let sin = 0;
    if (this.phase < 1) {
      sin = Math.sin(2 * Math.PI * this.phase);
      this.phase += this.freq;
    }

    let noise = 2 * rng.number() - 1;
    this.noiseGate = --this.noiseSustainSample >= 0
      ? Math.min(1, this.noiseGate + this.noiseRamp)
      : Math.max(0, this.noiseGate - this.noiseRamp);
    noise = this.noiseLowpass.process(2 * this.noiseGate * noise);

    // Additional gain not present in originnal. This noise is too quiet.
    noise *= this.noiseGain;

    return sin + noise;
  }
}

class ImpulseExpDecay {
  constructor(
    sampleRate,
    sineFreqNormalized,
    sineModLevel,
    sineModDecay,
    lowpass,
  ) {
    const freq = exponentialMap(lowpass, 10 / 48000, 22000 / 48000) * 24000 / sampleRate;

    this.lowpass = new SVFLP(freq, Math.SQRT1_2);

    const decaySamples = Math.floor(sampleRate * sineFreqNormalized);
    this.expDecay = Math.pow(sineModDecay, 1 / decaySamples);

    this.expGain = 1;

    this.phase = 0;
    this.freqScale = sineModLevel * 1000 / sampleRate;
  }

  process(rng) {
    this.phase += this.freqScale * this.expGain;
    this.phase -= Math.floor(this.phase);

    this.expGain *= this.expDecay;
    return this.lowpass.process(this.expGain * Math.cos(this.phase));
  }
}

class ExpDecay {
  constructor(decaySample) {
    this.gain = 1;
    this.decay = decaySample < 1 ? 1 : Math.pow(1e-3, 1 / decaySample);
  }

  process() { return this.gain *= this.decay; }
}

class NoiseGenerator {
  constructor(sampleRateHz, rmsLowpassHz) {
    this.rmsMeter = new EMAFilter();
    this.rmsMeter.setCutoff(rmsLowpassHz / sampleRateHz);
    this.noiseBp = new SVFBP(3000 / sampleRateHz, Math.SQRT2 - 1);
  }

  ipow50(v) {
    v *= v;                   // v^2
    v = v * v * v * v * v;    // v^10
    return v * v * v * v * v; // v^50
  }

  ipow64(v) {
    v *= v;       // v^2
    v *= v;       // v^4
    v *= v;       // v^8
    v *= v;       // v^16
    v *= v;       // v^32
    return v * v; // v^64
  }

  process(input, rng) {
    const envelope = 10 * Math.sqrt(this.rmsMeter.process(input * input));
    const noise = this.noiseBp.process(this.ipow50(rng.number()));
    return envelope * noise;
  }
}

class AllpassDelayCascade {
  constructor(
    sampleRate,
    lowpassHz,
    highpassHz,
    allpassFrequencyHz,
    allpassGain,
    delayFrequencyHz,
    feedbackGain,
    noiseLevel,
    noiseReleaseHz,
    envelopeDecaySecond,
    pitchMod,
    delayTimeMod,
    delayTimeEnv,
    allpassTimeEnv,
    velocity,
    DelayType,
  ) {
    this.snareNoise = new NoiseGenerator(sampleRate, noiseReleaseHz);

    // Original algorithm was using `LinearDecay` instead of `ExpDecay`.
    this.pitchEnvelope = new ExpDecay(Math.floor(sampleRate * envelopeDecaySecond));

    this.allpass = new LongAllpass(sampleRate, DelayType);
    this.lp = new LP1(lowpassHz / sampleRate);
    this.fb = 0;
    this.delay = new DelayType(0.1 * sampleRate);
    this.hp = new SVFHP(highpassHz / sampleRate, Math.SQRT1_2);

    this.allpassTimeSample = sampleRate / allpassFrequencyHz;
    this.allpassGain = allpassGain;
    this.delayTimeSample = sampleRate / delayFrequencyHz;
    this.feedbackGain = feedbackGain;
    this.noiseLevel = noiseLevel;
    this.pitchMod = pitchMod;
    this.delayTimeMod = delayTimeMod;
    this.delayTimeEnv = delayTimeEnv;
    this.allpassTimeEnv = allpassTimeEnv;
    this.velocity = velocity;
  }

  // Without feedback. Use this for FDN.
  process(input, rng) {
    const pitchEnv = this.pitchEnvelope.process();
    const pitchPow10 = pitchEnv;
    const pitchPow20 = pitchPow10 * pitchPow10;

    const apTime = 2 * this.allpassTimeSample
      / ((1 + this.pitchMod * pitchPow10) * (2 + this.velocity));
    const apMod = this.delayTimeMod * lerp(1, pitchPow10, this.allpassTimeEnv);
    let sig = this.allpass.processMod(
      input, apTime - Math.abs(this.fb) * apMod, this.allpassGain);
    sig = this.lp.process(sig);
    sig *= (1 + pitchPow20);

    const delayTime
      = this.delayTimeSample / ((1 + this.pitchMod * pitchPow20) * (1 + this.velocity));
    const delayMod = this.delayTimeMod * lerp(1, pitchPow10, this.delayTimeEnv);
    sig = this.delay.processMod(sig, delayTime - Math.abs(sig) * delayMod);
    sig = this.hp.process(sig);
    sig = Math.tanh(sig);

    sig += this.noiseLevel * this.snareNoise.process(sig, rng);
    this.fb = sig;
    return sig;
  }
}

class ReverbDelay {
  constructor(
    maxDelayTimeInSamples,
    delayTimeSample,
    delayTimeMod,
    lowpassCutoff,
    highpassCutoff,
    DelayType = CubicDelay,
  ) {
    this.lowpass = new DoubleEMAFilter();
    this.lowpass.setCutoff(lowpassCutoff);

    this.highpass = new EMAHighpass();
    this.highpass.setCutoff(highpassCutoff);

    this.delay = new DelayType(maxDelayTimeInSamples);
    this.delay.setTime(delayTimeSample);

    this.delayTime = delayTimeSample;
    this.timeMod = delayTimeMod;
  }

  process(input) {
    input = Math.tanh(input);
    input = this.lowpass.process(input);
    input = this.highpass.process(input);
    return this.delay.processMod(input, this.delayTime - Math.abs(input) * this.timeMod);
  }
}

class FDN {
  // `delay` is Array.
  constructor(delay, inputGain, mixGain, feedbackGain, seed) {
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
    this.inputGain = inputGain;
    this.mixGain = mixGain;

    const normalDist = v => {
      v = clamp(v, 0, 1 - Number.EPSILON);
      return Math.sqrt(-2 * Math.log(1 - v)) * Math.cos(2 * Math.PI * v);
    };

    if (Array.isArray(seed)) {
      constructSpecialOrthogonal(this.matrix, seed.map(v => normalDist(v)));
    } else if (Number.isFinite(seed)) {
      randomSpecialOrthogonal(this.matrix, seed);
    } else {
      console.warn(`Invalid FDN seed: ${seed}`);
    }
  }

  process(input, rng) {
    this.bufIndex ^= 1;
    let front = this.buf[this.bufIndex];
    let back = this.buf[this.bufIndex ^ 1];
    front.fill(0);
    for (let i = 0; i < front.length; ++i) {
      for (let j = 0; j < front.length; ++j) front[i] += this.matrix[i][j] * back[j];
    }

    let sum = 0;
    for (let i = 0; i < front.length; ++i) {
      front[i] = this.delay[i].process(
        this.inputGain[i] * input + this.feedbackGain * front[i], rng);
      sum += this.mixGain[i] * front[i];
    }
    return sum;
  }

  getFront() { return this.buf[this.bufIndex]; }

  preProcess() {
    this.bufIndex ^= 1;
    let front = this.buf[this.bufIndex];
    let back = this.buf[this.bufIndex ^ 1];
    front.fill(0);
    for (let i = 0; i < front.length; ++i) {
      for (let j = 0; j < front.length; ++j) front[i] += this.matrix[i][j] * back[j];
    }
  }

  // Call this only after `preProcess`.
  // More `a`, less coupling.
  // - `g1 = a / sqrt(a * a + 1)`.
  // - `g2 = 1 / sqrt(a * a + 1)`.
  postProcess(input, g1, g2, coupling, rng) {
    let front = this.buf[this.bufIndex];

    let sum = 0;
    for (let i = 0; i < front.length; ++i) {
      const fb = g1 * front[i] + g2 * coupling[i];
      front[i]
        = this.delay[i].process(this.inputGain[i] * input + this.feedbackGain * fb, rng);
      sum += this.mixGain[i] * front[i];
    }
    return sum;
  }
}

class Tanh {
  constructor(gain) { this.invGain = 1 / Math.max(gain, Number.EPSILON); }
  process(input) { return Math.tanh(input * this.invGain); }
}

class Bypass {
  process(input) { return input; }
}

function process(upRate, pv, dsp) {
  let pulse = dbToAmp(-24 * (1 - pv.velocity)) * dsp.impulse.process(dsp.rng);

  dsp.snare.preProcess();
  dsp.reverb.preProcess();

  const g2 = 1 / Math.sqrt(pv.couplingGain * pv.couplingGain + 1);
  const g1 = pv.couplingGain * g2;
  const snFront = structuredClone(dsp.snare.getFront()); // TODO
  let sig = dsp.snare.postProcess(pulse, g1, g2, dsp.reverb.getFront(), dsp.rng);
  sig += dsp.reverb.postProcess(0, g1, -g2, snFront, dsp.rng);

  sig = dsp.limiter.process(sig);
  return sig;
}

onmessage = async (event) => {
  const pv = event.data; // Parameter values.

  const upFold = parseInt(menuitems.oversampleItems[pv.overSample]);
  const upRate = upFold * pv.sampleRate;
  const sampleRateScaler = menuitems.sampleRateScalerItems[pv.sampleRateScaler];

  let dsp = {};
  dsp.rng = new PcgRandom(BigInt(pv.seed));

  const getImpulse = () => {
    const excitationType = menuitems.excitationTypeItems[pv.excitationType];
    if (excitationType === "Sine + LP Noise") {
      return new ImpulseOriginal(
        upRate,
        pv.frequencyHz / upRate,
        pv.excitationSineModLevel,
        pv.excitationSineModDecay,
        pv.excitationLowpass,
        0.00025 * upRate,
      );
    }

    if (excitationType === "Exp. Decay") {
      return new ImpulseExpDecay(
        upRate,
        pv.frequencyHz / upRate,
        pv.excitationSineModLevel,
        pv.excitationSineModDecay,
        pv.excitationLowpass,
        0.00025 * upRate,
      );
    }

    // excitationType === "Sine (1 Cycle)"
    return new ImpulseSine(
      upRate,
      pv.frequencyHz / upRate,
      pv.excitationSineModLevel,
      pv.excitationSineModDecay,
      pv.excitationLowpass,
      0.00025 * upRate,
    );
  };
  dsp.impulse = getImpulse();

  const getDelayType = () => {
    const delayType = menuitems.delayInterpTypeItems[pv.delayInterpType];
    return delayType === "None" ? IntDelay : delayType === "Linear" ? Delay : CubicDelay;
  };

  // // This one matches to `membranePitchTable["jn_zeros_tr"][0]`.
  // const pitches = [
  //   1.000000000000,     1.3402965524420327, 1.6650969425972044, 1.9804083333912088,
  //   2.2891849959679758, 2.593129431504782,  2.893324828534451,  3.1905089688660495,
  //   3.485210133885118,  3.7778213670634533, 4.068644098913255,  4.357915263770598,
  //   4.645824938472086,  4.932528252461517,  5.218153685402315,  5.502809003876363,
  //   5.7865856073569075, 6.0695617737731915, 6.351805126135265,  6.633374536485119,
  //   6.91432161601487,   7.194691895883976,  7.474525773493237,  7.753859278561035,
  //   8.032724699098031,  8.311151097265078,  8.589164737815679,  8.866789446505656,
  //   9.144046911919677,  9.420956941221863,  9.697537678112663,  9.973805789574751,
  //   10.249776626680719, 10.525464363716539, 10.800882119076348, 11.076042060753268,
  //   11.350955498749236, 11.625632966325023, 11.90008429168762,  12.17431866144975,
  //   12.448344676982043, 12.722170404602968, 12.995803420407027, 13.269250850411956,
  //   13.542519406606212, 13.815615419394776, 14.088544866871587, 14.361313401288188,
  //   14.633926373038491, 14.90638885243742,  15.178705649535358, 15.450881332179648,
  //   15.722920242508177, 15.994826512037466, 16.26660407548823,  16.538256683474607,
  //   16.809787914168567, 17.081201184038456, 17.352499757749445, 17.623686757304167,
  //   17.89476517049317,  18.165737858717637, 18.436607564240077, 18.707376916913077,
  // ];
  const getPitch = () => {
    let key = menuitems.membranePitchTypeItems[pv.membranePitchType];
    let src = structuredClone(membranePitchTable[key][pv.membranePitchIndex]);
    src.shift();
    return src.map(v => v / src[0]);
  };
  const pitches = getPitch();

  const DelayType = getDelayType();

  let fdnInputGain = structuredClone(pv.inputGain);
  if (fdnInputGain.every(v => v === 0)) {
    fdnInputGain.fill(1);
  } else {
    const scaler = pv.fdnSize / fdnInputGain.reduce((p, c) => p + c, 0);
    fdnInputGain = fdnInputGain.map(v => v * scaler);
  }

  let snareDelay = new Array(pv.fdnSize);
  const delayFreqHz = pv.frequencyHz * (1 - pv.allpassDelayRatio);
  const allpassFreqHz = pv.frequencyHz * pv.allpassDelayRatio;
  const delayTimeMod = pv.delayTimeMod * upFold * sampleRateScaler;
  for (let idx = 0; idx < snareDelay.length; ++idx) {
    snareDelay[idx] = new AllpassDelayCascade(
      upRate,
      pv.lowpassHz * pitches[idx],
      pv.highpassHz,
      allpassFreqHz * pitches[idx],
      pv.allpassGain,
      delayFreqHz * pitches[idx],
      pv.feedback,
      pv.noiseLevel * Math.sqrt(sampleRateScaler),
      pv.noiseReleaseHz,
      pv.envelopeDecaySecond,
      pv.pitchMod,
      delayTimeMod / pitches[idx],
      pv.delayTimeEnv,
      pv.allpassTimeEnv,
      pv.velocity,
      DelayType,
    );
  }
  const snareMixGain = pitches.map(v => 1 /* or, `1 / v` */);

  let fdnSeed = new Array(triangularNumber(pv.fdnSize)).fill(0); // TODO: more tuning
  let offset = 0;
  let table = new Array(pv.fdnSize).fill(0).map((v, i, arr) => {
    const phase = i / arr.length;
    const offset = pv.matrixCharacterB;
    const freq = pv.matrixCharacterA * pv.fdnSize * 10;
    return Math.sin(freq * Math.PI * (phase + offset));
  });
  for (let i = 0; i < pv.fdnSize; ++i) {
    for (let j = 0; j < pv.fdnSize - i; ++j) {
      fdnSeed[offset + j] = table[j];
    }
    offset += pv.fdnSize - i;
  }
  dsp.snare = new FDN(snareDelay, fdnInputGain, snareMixGain, pv.feedback, fdnSeed);

  let reverbDelay = new Array(pv.fdnSize);
  const fdnBaseTime = pv.reverbTimeMultiplier * upRate / delayFreqHz;
  const fdnRandomFunc = () => exponentialMap(
    dsp.rng.number(), 1 / (syntonicCommaRatio * syntonicCommaRatio), 1);
  for (let idx = 0; idx < reverbDelay.length; ++idx) {
    const delaySamples = fdnBaseTime * pitches[idx] * fdnRandomFunc();
    reverbDelay[idx] = new ReverbDelay(
      delaySamples,
      delaySamples,
      pv.reverbTimeMod * upFold * sampleRateScaler,
      Math.min(pv.reverbLowpassHz / upRate, 0.5),
      20 / upRate,
    );
  }
  const reverbMixGain = new Array(pv.fdnSize).fill(1);
  dsp.reverb = new FDN(
    reverbDelay,
    fdnInputGain,
    reverbMixGain,
    pv.reverbFeedback,
    // pv.seed + 257,
    fdnSeed,
  );

  if (pv.limiterType === 1) {
    dsp.limiter = new Limiter(
      pv.limiterSmoothingSeconds * upRate, 0.001 * upRate, 0, pv.limiterThreshold);

    // Discard latency part.
    for (let i = 0; i < dsp.limiter.latency; ++i) process(upRate, pv, dsp);
  } else if (pv.limiterType === 2) {
    dsp.limiter = new Tanh(pv.limiterThreshold);
  } else {
    dsp.limiter = new Bypass();
  }

  // Discard silence of delay at start.
  let sound = new Array(Math.floor(upRate * pv.renderDuration)).fill(0);
  let counter = 0;
  let sig = 0;
  do {
    sig = process(upRate, pv, dsp);
    if (++counter >= sound.length) { // Avoid infinite loop on silent signal.
      postMessage({sound: sound, status: "Output is completely silent."});
      return;
    }
  } while (sig === 0);

  // Process.
  sound[0] = sig;
  for (let i = 1; i < sound.length; ++i) sound[i] = process(upRate, pv, dsp);
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
