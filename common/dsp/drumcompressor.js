// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {selectSosFilter, SosFilterImmediate} from "./sos.js";

function erfc(z) {
  const x = Math.abs(z);
  const x2 = x * x;
  const r = 0.56418958354775629 / (x + 2.06955023132914151)
    * (x2 + 2.71078540045147805 * x + 5.80755613130301624)
    / (x2 + 3.47954057099518960 * x + 12.06166887286239555)
    * (x2 + 3.47469513777439592 * x + 12.07402036406381411)
    / (x2 + 3.72068443960225092 * x + 8.44319781003968454)
    * (x2 + 4.00561509202259545 * x + 9.30596659485887898)
    / (x2 + 3.90225704029924078 * x + 6.36161630953880464)
    * (x2 + 5.16722705817812584 * x + 9.12661617673673262)
    / (x2 + 4.03296893109262491 * x + 5.13578530585681539)
    * (x2 + 5.95908795446633271 * x + 9.19435612886969243)
    / (x2 + 4.11240942957450885 * x + 4.48640329523408675) * Math.E ** (-x2);
  return z >= 0 ? r : 2 - r;
}

function erf(z) { return 1 - erfc(z); }

export function softclipInnerTanh(x, t) {
  const absed = Math.abs(x);
  if (absed < t) return Math.tanh(x);

  const intercept = Math.tanh(t);
  const slope = 1 - intercept * intercept;
  return Math.sign(x) * (slope * (absed - t) + intercept);
}

export function softclipInnerArctan(x, t) {
  const scale = 1.5707963267948966; // Math.PI / 2;

  const absed = Math.abs(x);
  if (absed < t) return Math.atan(x * scale) / scale;

  const u = t * scale;
  const intercept = Math.atan(u) / scale;
  const slope = 1 / (1 + u * u);
  return Math.sign(x) * (slope * (absed - t) + intercept);
}

export function softclipInnerAlgebraicAbs(x, t) {
  const absed = Math.abs(x);
  if (absed < t) return x / (1 + absed);

  const denom = 1 + t;
  const intercept = t / denom;
  const slope = 1 / (denom * denom);
  return Math.sign(x) * (slope * (absed - t) + intercept);
}

export function softclipInnerErf(x, t) {
  const absed = Math.abs(x);
  if (absed < t) return Math.tanh(x);

  const intercept = erf(t);
  const scale = 1.1283791670955126; // 2 / Math.sqrt(Math.PI);
  const slope = scale * Math.exp(-t * t);
  return Math.sign(x) * (slope * (absed - t) + intercept);
}

export function softclipOuterTanh(x, t) {
  const a = Math.abs(x);
  if (a < t) return x;
  return Math.sign(x) * (Math.tanh(a - t) + t);
}

export function softclipOuterArctan(x, t) {
  const a = Math.abs(x);
  if (a < t) return x;
  const c = Math.PI / 2;
  return Math.sign(x) * (Math.atan((a - t) * c) / c + t);
}

export function softclipOuterAlgebraicAbs(x, t) {
  const a = Math.abs(x);
  if (a < t) return x;
  return Math.sign(x) * ((a - t) / (1 + a - t) + t);
}

export function softclipOuterErf(x, t) {
  const a = Math.abs(x);
  if (a < t) return x;
  const scale = 0.8862269254527579; // Math.sqrt(Math.PI) / 2;
  return Math.sign(x) * (erf((a - t) * scale) + t);
}

class ExpCompressor {
  constructor(thresholdAmp, attackSamples, releaseSamples, gainFuncType) {
    this.threshold = thresholdAmp;

    this.env = 0;
    this.rel = Math.pow(1e-3, 1 / releaseSamples);

    this.smoothed = 1;
    this.atk = Math.log(1e-3) / Math.log(1 / attackSamples);

    // Pre-compute values for gain curves.
    {
      this.interceptTanh = Math.tanh(this.threshold);
      this.slopeTanh = 1 - this.interceptTanh * this.interceptTanh;
    }
    {
      const scale = 1.5707963267948966; // Math.PI / 2;
      const u = this.threshold * scale;
      this.interceptArctan = Math.atan(u) / scale;
      this.slopeArctan = 1 / (1 + u * u);
    }
    {
      this.interceptErf = erf(this.threshold);
      this.slopeErf = 1.1283791670955126 * Math.exp(-this.threshold * this.threshold);
    }

    const getGainFunc = (gainFuncType) => {
      switch (gainFuncType) {
        case "hardclip":
          return this.#curveHardclip;
        case "innerTanh":
          return this.#curveInnerTanh;
        case "innerArctan":
          return this.#curveInnerArctan;
        case "innerAlegebraicAbs":
          return this.#curveInnerAlgebraicAbs;
        case "innerErf":
          return this.#curveInnerErf;
        case "outerTanh":
          return this.#curveOuterTanh;
        case "outerArctan":
          return this.#curveOuterArctan;
        case "outerAlegebraicAbs":
          return this.#curveOuterAlgebraicAbs;
        case "outerErf":
          return this.#curveOuterErf;
      }
      return () => 1; // bypass.
    };
    this.gainFunc = getGainFunc(gainFuncType);
  }

  // `curve*` methods assume `x >= 0`.
  #curveHardclip(x) { return x < this.threshold ? 1 : 1 / x; }

  #curveInnerTanh(x) {
    if (x < this.threshold) return x < Number.EPSILON ? 1 : Math.tanh(x) / x;
    return (this.slopeTanh * (x - this.threshold) + this.interceptTanh) / x;
  }

  #curveInnerArctan(x) {
    const scale = 1.5707963267948966; // Math.PI / 2;
    if (x < this.threshold) {
      return x < Number.EPSILON ? 1 : Math.atan(x * scale) / (x * scale);
    }
    return (this.slopeArctan * (x - this.threshold) + this.interceptArctan) / x;
  }

  #curveInnerAlgebraicAbs(x) {
    if (x < this.threshold) return 1 / (1 + x);
    const w = 1 / (1 + this.threshold);
    return ((x - this.threshold) * w + 1) * w / x;
  }

  #curveInnerErf(x) {
    if (x < this.threshold) return x < Number.EPSILON ? 1 : erf(x) / x;
    return (this.slopeErf * (x - this.threshold) + this.interceptErf) / x;
  }

  #curveOuterTanh(x) {
    const t = this.threshold;
    return x < t ? 1 : (Math.tanh(x - t) + t) / x;
  }

  #curveOuterArctan(x) {
    const t = this.threshold;
    const scale = 1.5707963267948966; // Math.PI / 2;
    return x < t ? 1 : (Math.atan((x - t) * scale) / scale + t) / x;
  }

  #curveOuterAlgebraicAbs(x) {
    const t = this.threshold;
    return x < t ? 1 : ((x - t) / (1 + x - t) + t) / x;
  }

  #curveOuterErf(x) {
    const t = this.threshold;
    const scale = 0.8862269254527579; // Math.sqrt(Math.PI) / 2;
    return x < t ? 1 : (erf((a - t) * scale) + t) / x;
  }

  process(input) {
    this.env = this.rel * Math.max(this.env, Math.abs(input));
    const gain = this.gainFunc(this.env);
    this.smoothed += this.atk * (gain - this.smoothed);
    return input * this.smoothed;
  }
}

// Only double of even order, like 4, 8, 12, ..., are possible with this implementation.
class LinkwitzRileyIirEven {
  constructor(nSection, cutoffNormalized, filterType) {
    const convertFilterType = (filterType) => {
      if (filterType == "lowpass") return "lp2bq";
      if (filterType == "highpass") return "hp2bq";
      if (filterType == "allpass") return "ap2bq";
      console.error(`Invalit filterType "${
        filterType}". filterType must be "lowpass", "highpass", or "allpass".`);
    };
    const sosFunc = selectSosFilter(convertFilterType(filterType));

    this.sos = new Array(nSection);
    for (let idx = 0; idx < nSection; ++idx) {
      let q = 0.5 / Math.cos(0.5 * idx * Math.PI / nSection);
      const coefficents = this.sos[idx]
        = new SosFilterImmediate(sosFunc(cutoffNormalized, q));
    }
  }

  reset() {
    for (let i = 0; i < this.sos.length; ++i) this.sos[i].reset();
  }

  process(input) {
    for (let i = 0; i < this.sos.length; ++i) input = this.sos[i].process(input);
    return input;
  }
}

class BandSplitter {
  // `crossoversNormalized` is an Array of normalized frequencies in [0, 0.5).
  // `crossoversNormalized` will be sorted in descending order.
  //
  // `steepnesses` is an Array of natural numbers (value >= 1). The value means that:
  //
  // - `steepnesses[n] == 1` is -12 dB/oct,
  // - `steepnesses[n] == 2` is -24 dB/oct,
  // - `steepnesses[n] == 3` is -36 dB/oct,
  //
  // and so on.
  //
  // Output is assigned to `output` which layout is `[high, mid, low]`.
  constructor(crossoversNormalized, steepnesses) {
    const indices = Array.from(crossoversNormalized.keys())
                      .sort((a, b) => crossoversNormalized[b] - crossoversNormalized[a]);
    const steep = indices.map(i => steepnesses[i]);
    const cross = indices.map(i => crossoversNormalized[i]);

    this.hp = new Array(indices.length);
    this.lp = new Array(indices.length);
    this.ap = new Array(indices.length);
    for (let i = 0; i < indices.length; ++i) {
      this.hp[i] = new LinkwitzRileyIirEven(steep[i], cross[i], "highpass");
      this.lp[i] = new LinkwitzRileyIirEven(steep[i], cross[i], "lowpass");
      this.ap[i] = new LinkwitzRileyIirEven(steep[i], cross[i], "allpass");
    }
    this.output = new Array(3).fill(0);
  }

  reset() {
    for (let i = 0; i < this.lp.length; ++i) {
      this.lp[i].reset();
      this.hp[i].reset();
      this.ap[i].reset();
    }
    this.output.fill(0);
  }

  split(input) {
    for (let i = 0; i < this.lp.length; ++i) {
      this.output[i] = this.hp[i].process(input);
      input = this.lp[i].process(input);
    }
    this.output[this.output.length - 1] = input;
    return this.output;
  }

  // `input` is `[high, mid, low]`.
  merge(input) {
    let sig = 0;
    for (let i = 0; i < this.ap.length; ++i) {
      sig = this.ap[i].process(input[i] + sig);
    }
    return input.at(-1) + sig;
  }

  correctDry(input) { return this.merge(this.split(input)); }
}

export class DrumCompressor {
  constructor(sampleRate) {
    this.compressor = [
      new ExpCompressor(2 / 4, sampleRate * 1.0, sampleRate * 1.0, "innerTanh"),
      new ExpCompressor(2 / 4, sampleRate * 0.1, sampleRate * 0.1, "innerTanh"),
      new ExpCompressor(1 / 4, sampleRate * 0.2, sampleRate * 0.2, "outerTanh"),
    ];

    this.saturator = [
      // (x) => softclipInnerAlgebraicAbs(x, 0.05),
      // (x) => softclipInnerAlgebraicAbs(x, 2.0),
      // (x) => softclipOuterAlgebraicAbs(x, 0.5),

      (x) => x, // bypass
      (x) => x, // bypass
      (x) => x, // bypass
    ];

    this.inputGain = [2, 1, 1];
    this.outputGain = [1, 1, 1];

    this.splitter = new BandSplitter([200 / sampleRate, 3200 / sampleRate], [2, 1]);
    this.corrector = new BandSplitter([200 / sampleRate, 3200 / sampleRate], [2, 1]);
  }

  process(input) {
    const band = this.splitter.split(input);
    for (let i = 0; i < this.compressor.length; ++i) {
      band[i] *= this.inputGain[i];
      band[i] = this.compressor[i].process(band[i]);
      band[i] = this.saturator[i](band[i]);
      band[i] *= this.outputGain[i];
    }
    return this.splitter.merge(band);
  }

  // NY compression. `mix` is in [0, 1].
  processNY(input, mix) {
    const band = this.splitter.split(input);
    for (let i = 0; i < this.compressor.length; ++i) {
      band[i] *= this.inputGain[i];
      band[i] = this.compressor[i].process(band[i]);
      band[i] = this.saturator[i](band[i]);
      band[i] *= this.outputGain[i];
    }
    const comp = this.splitter.merge(band);
    const dry = this.corrector.correctDry(input);
    return comp + mix * (dry - comp);
  }
}
