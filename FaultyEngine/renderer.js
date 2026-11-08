// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {BiasedSaturatorAdaa, TanhAdaa1} from "../common/dsp/adaa/adaa.js";
import {CubicDelay, LongAllpass} from "../common/dsp/delay.js";
import {downSampleIIR} from "../common/dsp/multirate.js";
import {HP1, LP1} from "../common/dsp/onepole.js";
import {
  SvfNormalizedBandpass,
  SvfNormalizedHighpass,
  SvfNormalizedLowpass,
  SvfNormalizedNotch,
} from "../common/dsp/svf.js";
import {clamp} from "../common/util.js";
import {PcgRandom} from "../lib/pcgrandom/pcgrandom.js";

import * as menuitems from "./menuitems.js";

function dampedLinear(x, p, a) { return x <= p ? x : p + (x - p) / (1 + Math.log1p((x - p) / a)); }

function getFretRatio(k, numFrets, intervalType) {
  switch (intervalType) {
    case 1: // Uniform / Linear
      return k / (numFrets + 1);

    case 2: { // Harmonic Nodes
      const harmonicNodes = [
        1 / 2, 1 / 3, 2 / 3, 1 / 4, 3 / 4, 1 / 5, 2 / 5, 3 / 5, 4 / 5,
        1 / 6, 5 / 6, 1 / 7, 2 / 7, 3 / 7, 4 / 7, 5 / 7, 6 / 7, 1 / 8,
        3 / 8, 5 / 8, 7 / 8, 1 / 9, 2 / 9, 4 / 9, 5 / 9, 7 / 9, 8 / 9,
      ];
      return harmonicNodes[k - 1] ?? (k / (numFrets + 1));
    }

    case 3: { // Engine Cylinder Firing Orders (Crossplane, Boxer & V-Twin)
      const engineFiringRatios = [
        315 / 720,                                  // 45° V-Twin offbeat lope
        90 / 720,  270 / 720, 450 / 720, 630 / 720, // Crossplane V8 crank offsets
        180 / 720, 540 / 720, 360 / 720,            // 4-cylinder & 6-cylinder even firings
        110 / 720, 250 / 720, 470 / 720, 610 / 720, // Boxer UEL header reflection delays
        144 / 720, 288 / 720, 432 / 720, 576 / 720, // Odd-fire V6 / 5-cylinder offsets
        72 / 720,  216 / 720, 504 / 720, 648 / 720, 45 / 720, 135 / 720, 225 / 720, 395 / 720,
      ];
      return engineFiringRatios[k - 1] ?? (k / (numFrets + 1));
    }

    case 4: { // Slider-Crank / Piston Kinematics (TDC to BDC)
      const theta = (k / (numFrets + 1)) * Math.PI;
      const lambda = 0.3; // Con-rod to crank radius ratio
      return 0.5 * ((1.0 - Math.cos(theta)) + 0.5 * lambda * (Math.sin(theta) ** 2));
    }

    case 5: { // Two-Stroke Expansion Chamber / Exhaust Diffuser
      const norm = k / (numFrets + 1);
      if (norm < 0.25) {
        return norm * 0.8;
      } else if (norm < 0.65) {
        const t = (norm - 0.25) / 0.40;
        return 0.2 + 0.45 * (t ** 1.8);
      } else {
        const t = (norm - 0.65) / 0.35;
        return 0.65 + 0.35 * Math.sqrt(t);
      }
    }

    case 6: { // Venturi Nozzle / Constriction (Hourglass Spacing)
      const u = 2.0 * (k / (numFrets + 1)) - 1.0;
      return 0.5 * (1.0 + Math.sign(u) * (Math.abs(u) ** 2.2));
    }

    case 7: { // "Faulty" Mechanical Tolerances (Misfires & Worn Clearances)
      const base = k / (numFrets + 1);
      // Deterministic mechanical slop / bearing play jitter
      const slop = Math.sin(k * 7919.0 + 1.23) * 0.4 * (1.0 / (numFrets + 1));
      return clamp(base + slop, 0.02, 0.98);
    }

    case 0: // 12-EDO (Chromatic)
    default:
      return 1.0 - 2.0 ** (-k / 12.0);
  }
}

class SerialAllpass {
  constructor(gain, delaySamples, feedback) {
    this.allpass = new Array(delaySamples.length);
    for (let idx = 0; idx < delaySamples.length; ++idx) {
      this.allpass[idx] = new LongAllpass(delaySamples[idx]);
      this.allpass[idx].prepare(delaySamples[idx], gain);
    }

    this.gain = feedback / delaySamples.length;
    this.buffer = 0;
  }

  process(input) {
    let sum = input + this.buffer;
    for (let idx = 0; idx < this.allpass.length; ++idx) {
      input = this.allpass[idx].process(input);
      sum += input;
    }
    this.buffer = sum * this.gain;
    return sum;
  }
}

// 1st-order Thiran Allpass filter for sub-sample fractional delay tuning.
// H(z) = (a + z^-1) / (1 + a * z^-1), where a = (1 - d) / (1 + d).
class FractionalAllpass {
  #a = 0.0;
  #x1 = 0.0;
  #y1 = 0.0;

  constructor(delaySamples = 0.0) { this.setDelay(delaySamples); }

  reset() {
    this.#x1 = 0.0;
    this.#y1 = 0.0;
  }

  setDelay(d) {
    const clamped = clamp(d, 0.0, 1.0);
    this.#a = (1.0 - clamped) / (1.0 + clamped + 1e-9);
  }

  process(x0) {
    const y0 = this.#a * (x0 - this.#y1) + this.#x1;
    this.#x1 = x0;
    this.#y1 = y0;
    return y0;
  }
}

// Bidirectional Digital Waveguide Segment connecting two spatial nodes.
class WaveguideSegment {
  #delayP;
  #delayM;
  #nominalDelay;
  #internalDelay;

  constructor(delaySamples) {
    this.#nominalDelay = delaySamples;
    const maxDelay = Math.max(Math.ceil(delaySamples * 2), 4);
    this.#delayP = new CubicDelay(maxDelay);
    this.#delayM = new CubicDelay(maxDelay);
    this.setTime(delaySamples);
  }

  get delay() { return this.#nominalDelay; }

  reset() {
    this.#delayP.reset();
    this.#delayM.reset();
  }

  setTime(timeInSample) {
    this.#nominalDelay = timeInSample;
    // The junction buffer introduces 1 sample of delay per segment.
    // Subtract 1 sample from internal delay to maintain exact nominal delay.
    const internal = Math.max(0.0, timeInSample - 1.0);
    this.#internalDelay = internal;
    const t = Math.max(1.0, internal);
    this.#delayP.setTime(t);
    this.#delayM.setTime(t);
  }

  process(inP, inM) {
    const d = this.#internalDelay;
    if (d <= 0.0) {
      this.#delayP.process(inP);
      this.#delayM.process(inM);
      return [inP, inM];
    }
    if (d < 1.0) {
      const outP = this.#delayP.process(inP);
      const outM = this.#delayM.process(inM);
      return [inP + d * (outP - inP), inM + d * (outM - inM)];
    }
    return [this.#delayP.process(inP), this.#delayM.process(inM)];
  }
}

class NoiseExcitation {
  constructor(pv, upRate) {
    this.freq = pv.frequency;
    this.upRate = upRate;
    this.noiseDecay = pv.noiseDecay;
    const channel = pv.channel ?? 0;
    const seedOffset = (channel === 1 && pv.stereoSeedOffset) ? pv.stereoSeedOffset : 0;
    this.noiseSeed = (pv.noiseSeed + seedOffset) >>> 0;
    this.noiseFilterType = pv.noiseFilterType;
    this.noiseFilterCutoffStart = pv.noiseFilterCutoffStart;
    this.noiseFilterCutoffEnd = pv.noiseFilterCutoffEnd;
    this.noiseFilterQ = pv.noiseFilterQ;
  }

  process() {
    const cycleSamples = this.upRate / this.freq;
    const noiseLength = Math.max(1, Math.floor(this.noiseDecay * this.upRate));
    const rng = new PcgRandom(this.noiseSeed >>> 0);

    const svfClasses = [
      SvfNormalizedLowpass,
      SvfNormalizedHighpass,
      SvfNormalizedBandpass,
      SvfNormalizedNotch,
    ];
    const FilterClass = svfClasses[Math.floor(this.noiseFilterType)] || SvfNormalizedLowpass;
    const cutoffStart = this.noiseFilterCutoffStart;
    const cutoffEnd = dampedLinear(this.noiseFilterCutoffEnd, 1000, 2000);
    const filter = new FilterClass(
      (this.freq * 2 ** (cutoffStart / 12)) / this.upRate,
      this.noiseFilterQ,
    );

    const fadeLength = Math.min(noiseLength, Math.floor(0.5 * cycleSamples));
    const fadeStart = noiseLength - fadeLength;
    const invNoiseLen = noiseLength > 1 ? 1 / (noiseLength - 1) : 0;
    const cutoffDiff = cutoffEnd - cutoffStart;

    const threshold = 1e-3;
    const noiseDecay = threshold ** (1 / noiseLength);
    let noiseEnvelope = (1 / threshold) ** (2 * cycleSamples / noiseLength);

    const noiseExcitation = new Array(noiseLength);
    for (let i = 0; i < noiseLength; ++i) {
      let s = (i === 0) ? 1.0 : (2.0 * rng.number() - 1.0);

      s *= Math.tanh(noiseEnvelope);
      noiseEnvelope *= noiseDecay;

      const st = cutoffStart + cutoffDiff * (i * invNoiseLen);
      const cut = (this.freq * 2 ** (st / 12)) / this.upRate;
      filter.setParams(Math.min(cut, 0.48), this.noiseFilterQ, noiseLength);
      s = filter.process(s);

      if (i >= fadeStart) { s *= Math.cos((0.5 * Math.PI * (i - fadeStart)) / fadeLength); }

      noiseExcitation[i] = s;
    }

    return noiseExcitation;
  }

  render() { return this.process(); }
}

// References:
// 1. Evangelista & Eckerholm (2010), "Player–instrument interaction models for digital waveguide
// synthesis of guitar: Touch and collisions."
// 2. Rank & Kubin (1997), "A waveguide model for slapbass synthesis."
function processSlapBass(pv, upRate, upFold, durationSamples) {
  let sound = new Array(durationSamples);

  const channel = pv.channel ?? 0;
  const chSign = channel === 0 ? -1 : 1;

  const intervalType = Math.floor(pv.segmentInterval);
  const freq = intervalType === 0 ? pv.frequency : pv.frequency / 16;
  const targetPeriodSamples = upRate / freq;
  const L_samples = targetPeriodSamples * 0.5;

  const numFrets = clamp(Math.floor(pv.segments), 0, 24);
  const action = Math.max(pv.fretAction, Number.EPSILON);
  const restitution = pv.fretRestitution;
  const slapPosRatio = clamp(pv.slapPosition, 0.5, 0.95);

  const pickupSpread = pv.stereoPickupSpread ?? 0.0;
  const pickupPosRatio = clamp(pv.pickupPosition + chSign * 0.5 * pickupSpread, 0.05, 0.98);

  const rawNodes = [{pos: 0.0, barrier: null, isStrike: false, isPickup: false}];

  for (let k = 1; k <= numFrets; ++k) {
    const fretRatio = clamp(getFretRatio(k, numFrets, intervalType), 0.01, 0.99);
    const pos = fretRatio * L_samples;

    let fretActionHeight = action * (0.8 + 1.6 * (k / 24.0));
    if (intervalType === 7) {
      const isMisfire = (k % 5 === 2);
      fretActionHeight
        = isMisfire ? action * 40.0 : action * (0.4 + 1.6 * (0.5 + 0.5 * Math.sin(k * 31.7)));
    }

    rawNodes.push({pos, barrier: -fretActionHeight, isStrike: false, isPickup: false});
  }

  rawNodes.push({pos: slapPosRatio * L_samples, barrier: null, isStrike: true, isPickup: false});
  rawNodes.push({pos: pickupPosRatio * L_samples, barrier: null, isStrike: false, isPickup: true});
  rawNodes.push({pos: L_samples, barrier: null, isStrike: false, isPickup: false});

  rawNodes.sort((a, b) => a.pos - b.pos);

  const nodes = [rawNodes[0]];
  for (let i = 1; i < rawNodes.length; ++i) {
    const current = rawNodes[i];
    const prev = nodes[nodes.length - 1];
    if (Math.abs(current.pos - prev.pos) < 0.95 && current.pos < L_samples) {
      if (current.barrier !== null) prev.barrier = current.barrier;
      if (current.isStrike) prev.isStrike = true;
      if (current.isPickup) prev.isPickup = true;
    } else {
      nodes.push(current);
    }
  }

  const numNodes = nodes.length;
  const numSegments = numNodes - 1;

  let strikeNodeIdx = 0;
  let pickupNodeIdx = 0;
  for (let i = 0; i < numNodes; ++i) {
    if (nodes[i].isStrike) strikeNodeIdx = i;
    if (nodes[i].isPickup) pickupNodeIdx = i;
  }
  if (pickupNodeIdx === 0) pickupNodeIdx = Math.min(numNodes - 2, Math.floor(0.85 * numNodes));
  if (strikeNodeIdx === 0) strikeNodeIdx = Math.min(numNodes - 2, Math.floor(0.75 * numNodes));

  const segDelays = new Array(numSegments);
  for (let i = 0; i < numSegments; ++i) {
    segDelays[i] = Math.max(1, Math.round(nodes[i + 1].pos - nodes[i].pos));
  }

  let intSum = segDelays.reduce((acc, v) => acc + v, 0);
  let residualDelay = targetPeriodSamples - 2.0 * intSum;

  while (residualDelay < 0.0 || residualDelay >= 2.0) {
    const isNegative = residualDelay < 0.0;
    const step = isNegative ? -1 : 1;

    let targetIdx = 0;
    for (let i = 1; i < numSegments; ++i) {
      const isBetter
        = isNegative ? segDelays[i] > segDelays[targetIdx] : segDelays[i] < segDelays[targetIdx];
      if (isBetter) targetIdx = i;
    }

    segDelays[targetIdx] += step;
    intSum += step;
    residualDelay = targetPeriodSamples - 2.0 * intSum;
  }

  const bridgeIntDelay = Math.floor(residualDelay);
  const fractionalDelay = residualDelay - bridgeIntDelay;

  const segments = segDelays.map((d) => new WaveguideSegment(d));

  const allpass = new FractionalAllpass();
  allpass.setDelay(fractionalDelay);

  const lpCutoffHz = pv.lpCutoffHz;
  const lpFilter = new LP1(lpCutoffHz / upRate);

  const dcHighpassCutoffNormalized = pv.dcHighpassCutoffHz / upRate;
  const dcHighpass = new HP1(dcHighpassCutoffNormalized);
  const excDcHighpass = new HP1(dcHighpassCutoffNormalized);

  const loopGain = Math.sign(pv.feedback) * Math.pow(Math.abs(pv.feedback), 1 / freq);
  const nutReflection = -0.998;

  const excitation = new NoiseExcitation(pv, upRate).process();

  const [buzzFeedbackSign, buzzOutSign] =
    [[1, 1], [1, -1], [-1, 1], [-1, -1]][Math.floor(pv.buzzerFeedbackSign)];

  const nDelay
    = clamp(Math.floor(pv.nDelay ?? pv.buzzerDelaySeconds.length), 1, pv.buzzerDelaySeconds.length);
  const buzzerDetune = pv.stereoBuzzerDetune ?? 0.0;
  const detuneFactor = Math.max(0.001, 1.0 + chSign * 0.5 * buzzerDetune);
  const buzzerDelaySamples
    = pv.buzzerDelaySeconds.slice(0, nDelay).map((d) => d * upRate * detuneFactor);
  const buzzer = new SerialAllpass(pv.buzzerGain, buzzerDelaySamples, pv.buzzerFeedback);

  const buzzBiasedAdaa = new BiasedSaturatorAdaa(
    new TanhAdaa1(), pv.buzzBiasedAdaaGain, pv.buzzBiasedAdaaBias, pv.buzzBiasedAdaaDryMix,
    pv.buzzBiasedAdaaScale);
  const buzzFeedbackAdaa = new TanhAdaa1();

  const nodeInP = new Float64Array(numNodes);
  const nodeInM = new Float64Array(numNodes);
  const nodeOutP = new Float64Array(numNodes);
  const nodeOutM = new Float64Array(numNodes);

  let buzzOut = 0;

  let bridgeDelayState = 0.0;
  let tensionState = 0.0;
  const tensionAlpha = Math.min(1.0, (4.0 * freq) / upRate);
  const tensionModScaled = pv.tensionMod * 100.0;

  let gainEnv = 1.0;
  const decay = Math.pow(pv.decayTo, 1.0 / sound.length);

  for (let i = 0; i < durationSamples; ++i) {
    const excSig = (i < excitation.length) ? pv.excitationGain * excitation[i] : 0.0;
    const transverseSig
      = excDcHighpass.process(excSig) + buzzFeedbackSign * buzzFeedbackAdaa.process(0.5 * buzzOut);

    for (let s = 0; s < numSegments; ++s) {
      const [outP, outM] = segments[s].process(nodeOutP[s], nodeOutM[s + 1]);
      nodeInP[s + 1] = outP;
      nodeInM[s] = outM;
    }

    nodeInP[strikeNodeIdx] += 0.5 * transverseSig;
    nodeInM[strikeNodeIdx] += 0.5 * transverseSig;

    let sumDelta = 0;
    for (let n = 1; n < numNodes - 1; ++n) {
      const yNode = nodeInP[n] + nodeInM[n];
      const barrier = nodes[n].barrier;

      if (barrier !== null && yNode < barrier) {
        const delta = (1.0 + restitution) * 0.5 * (yNode - barrier);
        nodeOutP[n] = nodeInP[n] - delta;
        nodeOutM[n] = nodeInM[n] - delta;
        sumDelta += delta;
      } else {
        nodeOutP[n] = nodeInP[n];
        nodeOutM[n] = nodeInM[n];
      }
    }

    nodeOutP[0] = nutReflection * nodeInM[0];

    let bridgeRefl = -loopGain * nodeInP[numNodes - 1];
    bridgeRefl = lpFilter.process(bridgeRefl);

    if (tensionModScaled !== 0) {
      tensionState += tensionAlpha * (bridgeRefl * bridgeRefl - tensionState);
      const modFactor = 1.0 / Math.sqrt(1.0 + tensionModScaled * tensionState);
      for (let s = 0; s < numSegments; ++s) { segments[s].setTime(segDelays[s] * modFactor); }
    }

    if (bridgeIntDelay === 1) {
      const tmp = bridgeRefl;
      bridgeRefl = bridgeDelayState;
      bridgeDelayState = tmp;
    }

    bridgeRefl = allpass.process(bridgeRefl);
    nodeOutM[numNodes - 1] = bridgeRefl;

    buzzOut = buzzer.process(buzzBiasedAdaa.process(2 * sumDelta));
    const pickupSig = nodeInP[pickupNodeIdx] + nodeInM[pickupNodeIdx];
    let outSig = pickupSig + buzzOutSign * buzzOut;

    outSig = dcHighpass.process(outSig) * gainEnv;

    sound[i] = outSig;
    gainEnv *= decay;
  }

  return sound;
}

onmessage = async (event) => {
  const pv = event.data;

  const upFold = parseInt(menuitems.oversampleItems[pv.overSample]);
  const upRate = upFold * pv.sampleRate;
  const durationSamples = Math.floor(upRate * pv.renderDuration);

  let sound = processSlapBass(pv, upRate, upFold, durationSamples);

  if (upFold > 1) sound = downSampleIIR(sound, upFold);

  postMessage({sound});
};
