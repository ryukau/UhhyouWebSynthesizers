// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {CubicDelay, IntDelay, MultiTapDelay} from "../common/dsp/delay.js";
import {downSampleIIR} from "../common/dsp/multirate.js";
import {AP1, HP1, LP1} from "../common/dsp/onepole.js";
import {
  SVFAP,
  SvfNormalizedBandpass,
  SvfNormalizedHighpass,
  SvfNormalizedLowpass,
  SvfNormalizedNotch,
} from "../common/dsp/svf.js";
import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";

import * as menuitems from "./menuitems.js";

function dampedLinear(x, p, a) { return x <= p ? x : p + (x - p) / (1 + Math.log1p((x - p) / a)); }

function getFFCombGain(delayTimeSamples, combGains) {
  if (!delayTimeSamples?.length) return 1.0;

  const N = delayTimeSamples.length;
  let totalEnergy = 0;
  for (let i = 0; i < N; i++) {
    const g = typeof combGains?.[i] === 'number' ? combGains[i] : -1.0 / N;
    totalEnergy += g * g;
  }
  return totalEnergy > Number.EPSILON ? 1.0 / Math.sqrt(totalEnergy) : 0.0;
}

function applyPickComb(excitation, pickPosition, delaySamples, isIntegerPitch) {
  if (pickPosition <= 0.0 || excitation.length === 0) return excitation;
  const tauBeta = pickPosition * delaySamples;

  if (isIntegerPitch) {
    const intTau = Math.floor(tauBeta);
    const totalCombLength = excitation.length + intTau;
    const combOut = new Array(totalCombLength).fill(0.0);
    // Two writes per sample on excitation
    for (let i = 0; i < excitation.length; ++i) {
      const v = 0.5 * excitation[i];
      combOut[i] += v;
      combOut[i + intTau] -= v;
    }
    return combOut;
  }

  const combDelay = new CubicDelay(tauBeta);
  combDelay.setTime(tauBeta);
  const totalCombLength = excitation.length + Math.ceil(tauBeta) + 4;
  const combOut = new Array(totalCombLength);
  for (let i = 0; i < totalCombLength; ++i) {
    const x = i < excitation.length ? excitation[i] : 0;
    combDelay.write(x);
    combOut[i] = 0.5 * (x - combDelay.read(tauBeta));
  }
  return combOut;
}

onmessage = async (event) => {
  const pv = event.data;

  const upFold = parseInt(menuitems.oversampleItems[pv.overSample]);
  const upRate = upFold * pv.sampleRate;

  const durationSamples = Math.floor(upRate * pv.renderDuration);
  let sound = new Array(durationSamples).fill(0.0);

  const loopDelay = 1.0;
  const channel = pv.channel ?? 0;
  const nUnison = Math.max(1, Math.floor(pv.nUnison ?? 1));

  for (let u = 0; u < nUnison; ++u) {
    const detuneFrac = nUnison > 1 ? (u / (nUnison - 1) - 0.5) * 2.0 : 0.0;
    const detuneCents = detuneFrac * (pv.unisonDetune ?? 0.0);
    const voiceFreq = pv.notePitch * Math.pow(2, detuneCents / 1200);

    let panL = 1.0;
    let panR = 1.0;
    if (nUnison > 1) {
      const pan = detuneFrac * (pv.unisonSpread ?? 1.0);
      const panAngle = (pan + 1.0) * (Math.PI / 4.0);
      panL = Math.SQRT2 * Math.cos(panAngle);
      panR = Math.SQRT2 * Math.sin(panAngle);
    }
    const voiceGain = (channel === 0 ? panL : panR) / Math.sqrt(nUnison);
    if (Math.abs(voiceGain) < 1e-6) continue;

    const maxDelayTime = pv.unisonDelay ?? 0.0;
    const startOffsetSamples = (nUnison > 1 && maxDelayTime > 0.0)
      ? Math.floor(u * (maxDelayTime * upRate) / (nUnison - 1))
      : 0;
    if (startOffsetSamples >= durationSamples) continue;
    const remainingSamples = durationSamples - startOffsetSamples;

    const channelOffset = (pv.unisonStereoNoise === 1) ? channel * 0x9e3779b9 : 0;
    const voiceSeed = (pv.noiseSeed + u * 1013904223 + channelOffset) >>> 0;
    const rng = new PcgRandom(voiceSeed);

    // Main path delay.
    const delaySamples = (pv.integerPitch === 1) ? Math.round(upRate / voiceFreq - loopDelay)
                                                 : upRate / voiceFreq - loopDelay;
    const maxDelaySamples = delaySamples;

    const delayLine
      = (pv.integerPitch === 1) ? new IntDelay(maxDelaySamples) : new CubicDelay(maxDelaySamples);
    delayLine.setTime(delaySamples);

    const lpCutoffHz = voiceFreq * Math.pow(2, pv.lpCutoffRelative / 12);
    const apCutoffHz = voiceFreq * Math.pow(2, pv.apCutoffRelative / 12);
    const baseApCutoffNorm = apCutoffHz / upRate;

    const lpFilter = new LP1(lpCutoffHz / upRate);
    const nAllpass = Math.floor(pv.nAllpass);
    const apFilters = Array.from({length: nAllpass}, () => new SVFAP(baseApCutoffNorm, pv.apQ));

    const dcHighpassHz = voiceFreq * Math.pow(2, pv.dcHighpassCutoffRelative / 12);
    const dcHighpass = new HP1(dcHighpassHz / upRate);
    const excDcHighpass = new HP1(dcHighpassHz / upRate);

    // Sub path delay.
    const subRatio = pv.subRatio;
    const voiceSubFreq = pv.unisonMonoSub === 1 ? Math.min(pv.notePitch * subRatio, upRate * 0.48)
                                                : Math.min(voiceFreq * subRatio, upRate * 0.48);

    const subAp = new AP1(voiceSubFreq / upRate);
    const apDelaySamples = subAp.groupDelayAt(voiceSubFreq / upRate);
    const subDelaySamples = (pv.integerPitch === 1)
      ? Math.max(1, Math.round(upRate / voiceSubFreq - loopDelay - apDelaySamples))
      : Math.max(0.1, upRate / voiceSubFreq - loopDelay - apDelaySamples);

    const maxSubDelaySamples = Math.max(1, Math.ceil(subDelaySamples));

    const subDelayLine = (pv.integerPitch === 1) ? new IntDelay(maxSubDelaySamples)
                                                 : new CubicDelay(maxSubDelaySamples);
    subDelayLine.setTime(subDelaySamples);

    const subLpCutoffHz
      = Math.min(voiceSubFreq * Math.pow(2, pv.subLpCutoffRelative / 12), upRate * 0.48);
    const subLpFilter = new LP1(subLpCutoffHz / upRate);

    const subCouplingHp = new HP1(10 / upRate);
    const subLoopHp = new HP1(10 / upRate);

    const loopGain = Math.sign(pv.feedback) * Math.pow(Math.abs(pv.feedback), 1 / voiceFreq);
    const subLoopGain
      = Math.sign(pv.subFeedback) * Math.pow(Math.abs(pv.subFeedback), 1 / voiceFreq);

    const bridgeTheta = pv.subBridgeCoupling * (Math.PI / 4);
    const cosBridge = Math.cos(bridgeTheta);
    const sinBridge = Math.sin(bridgeTheta);

    // Noise excitation.
    const minCycleSeconds = 0.01;
    const cycleSamples = upRate / voiceFreq;
    const noiseLength
      = Math.floor(Math.max(pv.noiseDecay * cycleSamples, minCycleSeconds * upRate));

    const svfClasses =
      [SvfNormalizedBandpass, SvfNormalizedHighpass, SvfNormalizedLowpass, SvfNormalizedNotch];
    const FilterClass = svfClasses[Math.floor(pv.noiseFilterType)] || SvfNormalizedLowpass;
    const cutoffStart = pv.noiseFilterCutoffStart;
    const cutoffEnd = dampedLinear(pv.noiseFilterCutoffEnd, 1000, 2000);
    const filter
      = new FilterClass((voiceFreq * Math.pow(2, cutoffStart / 12)) / upRate, pv.noiseFilterQ);

    const fadeLength = Math.min(noiseLength, Math.floor(0.5 * cycleSamples));
    const fadeStart = noiseLength - fadeLength;
    const invNoiseLen = noiseLength > 1 ? 1 / (noiseLength - 1) : 0;
    const cutoffDiff = cutoffEnd - cutoffStart;

    const threshold = 1e-3;
    const noiseDecay = threshold ** (1 / noiseLength);
    let noiseEnvelope = (1 / threshold) ** (2 * cycleSamples / noiseLength);

    let excitation = new Array(noiseLength);
    for (let i = 0; i < noiseLength; ++i) {
      let s = (i === 0) ? 1.0 : (2.0 * rng.number() - 1.0);

      s *= Math.tanh(noiseEnvelope);
      noiseEnvelope *= noiseDecay;

      const st = cutoffStart + cutoffDiff * (i * invNoiseLen);
      const cut = (voiceFreq * Math.pow(2, st / 12)) / upRate;
      filter.setParams(Math.min(cut, 0.48), pv.noiseFilterQ, noiseLength);
      s = filter.process(s);

      if (i >= fadeStart) { s *= Math.cos((0.5 * Math.PI * (i - fadeStart)) / fadeLength); }

      excitation[i] = s;
    }

    // Feed-forward comb filter.
    const ffCombPoint = pv.ffCombPoint;
    const ffCombGain = pv.ffCombGain;
    const nFFComb = Math.min(Math.floor(pv.ffCombTaps), ffCombPoint.length);
    if (nFFComb > 0) {
      const combDelays = Array.from({length: nFFComb}, (_, i) => ffCombPoint[i] * delaySamples);
      const combGains = Array.from({length: nFFComb}, (_, i) => -ffCombGain[i]);
      const maxCombDelay = Math.max(...combDelays, 0);
      const delay = new MultiTapDelay(maxCombDelay, nFFComb);
      delay.setTime(combDelays);

      const excLength = excitation.length;
      const totalCombLength = excLength + Math.ceil(maxCombDelay);
      const gain = getFFCombGain(combDelays, combGains);
      const combOut = new Array(totalCombLength);
      for (let i = 0; i < totalCombLength; ++i) {
        const x = i < excLength ? excitation[i] : 0;
        const d = delay.processSplit(x);
        let s = 0;
        for (let j = 0; j < d.length; ++j) { s += combGains[j] * d[j]; }
        combOut[i] = gain * (x + s);
      }
      excitation = combOut;
    }

    // String pick position filter (2 Writes method).
    if (pv.pickPosition > 0.0) {
      excitation = applyPickComb(excitation, pv.pickPosition, delaySamples, pv.integerPitch === 1);
    }

    let tensionState = 0.0;
    const tensionAlpha = Math.min(1.0, (4.0 * voiceFreq) / upRate);

    // Modulation source state variables (z^-1).
    let prevMain = 0.0;
    let prevSub = 0.0;
    let prevFull = 0.0;

    const hasApCutoffMod = nAllpass > 0 && pv.apModAmount !== undefined && pv.apModAmount !== 0;
    const apMinHz = 10.0;
    const apMaxHz = Math.min(20000.0, 0.48 * upRate);
    const apMidHz = 0.5 * (apMaxHz + apMinHz);
    const apSpanHz = 0.5 * (apMaxHz - apMinHz);
    const invApSpanHz = 1.0 / apSpanHz;

    // Main processing loop for this voice.
    let feedback = 0;
    let subFeedback = 0;

    for (let i = 0; i < remainingSamples; ++i) {
      const excSig = (i < excitation.length) ? pv.excitationGain * excitation[i] : 0.0;
      let mainSig = excDcHighpass.process(excSig);

      // Main path forward path.
      mainSig += feedback;
      mainSig = lpFilter.process(mainSig);

      // Dynamic all-pass cutoff modulation.
      if (hasApCutoffMod) {
        let modSig = prevFull;
        if (pv.apModSource === 1) {
          modSig = prevMain;
        } else if (pv.apModSource === 2) {
          modSig = prevSub;
        }

        const modSemitones = pv.apModAmount * Math.tanh(modSig);
        const modHz = apCutoffHz * Math.pow(2, modSemitones / 12);
        const smoothHz = apMidHz + apSpanHz * Math.tanh((modHz - apMidHz) * invApSpanHz);
        const currentApCutoffNorm = smoothHz / upRate;

        for (let j = 0; j < apFilters.length; ++j) {
          mainSig = apFilters[j].processMod(mainSig, currentApCutoffNorm, pv.apQ);
        }
      } else {
        for (let j = 0; j < apFilters.length; ++j) { mainSig = apFilters[j].process(mainSig); }
      }

      if (pv.tensionMod !== 0) {
        tensionState += tensionAlpha * (mainSig * mainSig - tensionState);
        const dynamicDelay = delaySamples / Math.sqrt(1.0 + pv.tensionMod * tensionState);
        delayLine.setTime(dynamicDelay);
      }

      // Sub path forward path.
      const subDirect = pv.subDirectExcitation * excSig;

      const coupledAc = subCouplingHp.process(mainSig * mainSig);
      const subCoupled = pv.subCoupling * coupledAc;

      const damping = 1.0 / (1.0 + Math.abs(subCoupled));
      mainSig *= damping;
      subFeedback *= damping;

      let subSig = subDirect + subCoupled + subFeedback;
      subSig = subAp.process(subSig);
      subSig = subLpFilter.process(subSig);
      subSig = subLoopHp.process(subSig);

      const mainDelayOut = delayLine.process(mainSig);
      const subDelayOut = subDelayLine.process(subSig);

      let mainReflected = mainDelayOut;
      let subReflected = subDelayOut;
      if (pv.subBridgeCoupling > 0) {
        mainReflected = cosBridge * mainDelayOut + sinBridge * subDelayOut;
        subReflected = -sinBridge * mainDelayOut + cosBridge * subDelayOut;
      }

      feedback = loopGain * mainReflected;
      subFeedback = subLoopGain * subReflected;

      // Nonlinear Damping.
      if (pv.nonlinearDamping > 0) {
        feedback = feedback / (1.0 + pv.nonlinearDamping * feedback * feedback);
      }
      if (pv.subNonlinearDamping > 0) {
        subFeedback = subFeedback / (1.0 + pv.subNonlinearDamping * subFeedback * subFeedback);
      }

      // Output signal mix & filtering.
      let outSig = mainSig + pv.subMix * subSig;
      outSig = dcHighpass.process(outSig);
      sound[startOffsetSamples + i] += voiceGain * outSig;

      // Update modulation states for the next sample.
      prevMain = mainSig;
      prevSub = subSig;
      prevFull = outSig;
    }
  }

  let gainEnv = 1;
  const decay = Math.pow(pv.decayTo, 1.0 / sound.length);
  for (let i = 0; i < sound.length; ++i) {
    sound[i] *= gainEnv;
    gainEnv *= decay;
  }

  if (upFold > 1) { sound = downSampleIIR(sound, upFold); }

  postMessage({sound: sound});
};
