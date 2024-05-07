// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {HalfBandIIR, SosFilter} from "./multirate.js";

export class AnalyticSignalFilter {
  #coRe =
    [0.16175849836770106, 0.7330289323414905, 0.9453497003291133, 0.9905991566845292];
  #coIm = [0.47940086558884, 0.8762184935393101, 0.9765975895081993, 0.9974992559355491];

  #x1Re = new Array(this.#coRe.length).fill(0);
  #x2Re = new Array(this.#coRe.length).fill(0);
  #y1Re = new Array(this.#coRe.length).fill(0);
  #y2Re = new Array(this.#coRe.length).fill(0);

  #x1Im = new Array(this.#coIm.length).fill(0);
  #x2Im = new Array(this.#coIm.length).fill(0);
  #y1Im = new Array(this.#coIm.length).fill(0);
  #y2Im = new Array(this.#coIm.length).fill(0);

  #delayedIm = 0;

  reset() {
    this.#x1Re.fill(0);
    this.#x2Re.fill(0);
    this.#y1Re.fill(0);
    this.#y2Re.fill(0);

    this.#x1Im.fill(0);
    this.#x2Im.fill(0);
    this.#y1Im.fill(0);
    this.#y2Im.fill(0);

    this.#delayedIm = 0;
  }

  process(input) {
    let sigRe = input;
    for (let i = 0; i < this.#coRe.length; ++i) {
      let y0 = this.#coRe[i] * (sigRe + this.#y2Re[i]) - this.#x2Re[i];
      this.#x2Re[i] = this.#x1Re[i];
      this.#x1Re[i] = sigRe;
      this.#y2Re[i] = this.#y1Re[i];
      this.#y1Re[i] = y0;
      sigRe = y0;
    }

    let sigIm = input;
    for (let i = 0; i < this.#coIm.length; ++i) {
      let y0 = this.#coIm[i] * (sigIm + this.#y2Im[i]) - this.#x2Im[i];
      this.#x2Im[i] = this.#x1Im[i];
      this.#x1Im[i] = sigIm;
      this.#y2Im[i] = this.#y1Im[i];
      this.#y1Im[i] = y0;
      sigIm = y0;
    }
    let outIm = this.#delayedIm;
    this.#delayedIm = sigIm; // 1 sample delay.

    return {re: sigRe, im: outIm};
  }
}

export class FrequencyShifter {
  #hilbert = new AnalyticSignalFilter();
  #phase = 0;

  reset() {
    this.#hilbert.reset();
    this.#phase = 0;
  }

  // `shiftFreq` is normalized frequency in [0, 0.5).
  process(input, shiftFreq) {
    const analytic = this.#hilbert.process(input);
    const norm = Math.sqrt(analytic.re * analytic.re + analytic.im * analytic.im);
    const theta = Math.atan2(analytic.im, analytic.re);

    this.#phase += shiftFreq;
    this.#phase -= Math.floor(this.#phase);
    return norm * Math.cos(theta + 2 * Math.PI * this.#phase);
  }
}

export class SingleSideBandAmplitudeModulator {
  #carFilter = new AnalyticSignalFilter();
  #modFilter = new AnalyticSignalFilter();

  // Upper side band.
  upper(carrior, modulator) {
    const c0 = this.#carFilter.process(carrior);
    const m0 = this.#modFilter.process(modulator);
    return c0.re * m0.re - c0.im * m0.im;
  }

  // Lower side band.
  lower(carrior, modulator) {
    const c0 = this.#carFilter.process(carrior);
    const m0 = this.#modFilter.process(modulator);
    return c0.re * m0.re + c0.im * m0.im;
  }
}

export class AntiAliasedAmplitudeModulator {
  #hbCar = new HalfBandIIR();
  #hbMod = new HalfBandIIR();
  #hbDown = new HalfBandIIR();

  reset() {
    this.#hbCar.reset();
    this.#hbMod.reset();
    this.#hbDown.reset();
  }

  // `carrior` isn't mixed to output.
  process(carrior, modulator) {
    const upCar = this.#hbCar.processUp(carrior);
    const upMod = this.#hbMod.processUp(modulator);
    return this.#hbDown.processDown(upCar[0] * upMod[0], upCar[1] * upMod[1]);
  }
}

export class AntiAliasedAmplitudeModulatorFull {
  // `#sos` is an elliptic filter coefficients in second order sections (sos) format.
  //
  // ```pytyon
  // import scipy.signal as signal
  // sos = signal.ellip(16, 0.01, 140, 0.925 / 6, "lowpass", output="sos", fs=1)
  // ```
  #sosLowpass = [
    [
      1.4299700336859399e-05, 2.6223643283408427e-05, 1.4299700336859402e-05,
      -1.419010779886042, 0.5152639120776978
    ],
    [
      1.0000000000000000, 0.9374859430410645, 1.0000000000000000, -1.374108854632666,
      0.569988993082886
    ],
    [
      1.0000000000000000, 0.1350973292280386, 0.9999999999999998, -1.3033222470303198,
      0.6571339849004512
    ],
    [
      1.0000000000000000, -0.3463388380253702, 1.0000000000000002, -1.2300429244541804,
      0.7495761953198858
    ],
    [
      1.0000000000000000, -0.6140989162812137, 1.0000000000000000, -1.1698275005007623,
      0.8300611494196282
    ],
    [
      1.0000000000000000, -0.7615991375114761, 1.0000000000000002, -1.1287956505319012,
      0.8934017825312789
    ],
    [
      1.0000000000000000, -0.83977959367167, 1.0000000000000002, -1.1078055040479997,
      0.9420069143074725
    ],
    [
      1.0000000000000000, -0.87372678641345, 1.0000000000000002, -1.1067875902296604,
      0.9815369953292316
    ]
  ];

  // ```pytyon
  // import scipy.signal as signal
  // # Highpass stopband attenuation is -60 dB to achieve sharper fall off.
  // lowCut = (1 + 60 / 48000) / 6
  // highCut = 1.925 / 6
  // sosBp = np.vstack(
  //     [
  //         signal.ellip(16, 0.01, 60, lowCut, "highpass", output="sos", fs=1),
  //         signal.ellip(16, 0.01, 140, highCut, "lowpass", output="sos", fs=1),
  //     ]
  // )
  // ```
  #sosBandpass = [
    [
      0.07996306031918912, -0.15512096495683905, 0.07996306031918912,
      -0.04905756091899954, 0.06089317414996781
    ],
    [
      1.0000000000000000, -1.605912361850232, 1.0000000000000000, -0.3914194433835788,
      0.39780395780767436
    ],
    [
      1.0000000000000000, -1.3044450264840837, 1.0000000000000000, -0.69851818886442,
      0.7000220928086291
    ],
    [
      1.0000000000000000, -1.1386205501393927, 0.9999999999999999, -0.8666910823954345,
      0.8655475347010958
    ],
    [
      1.0000000000000000, -1.0617196394441732, 1.0000000000000002, -0.9445579714023477,
      0.9422516172059531
    ],
    [
      1.0000000000000000, -1.0283402094063119, 1.0000000000000002, -0.9784715696658016,
      0.9758114926561893
    ],
    [
      1.0000000000000000, -1.0144993240335434, 1.0000000000000000, -0.9928926526136225,
      0.990449173400009
    ],
    [
      1.0000000000000000, -1.0095384322002112, 1.0000000000000000, -0.998957500114774,
      0.9974851593731303
    ],
    [
      0.003929281896699457, 0.007783864623170485, 0.003929281896699457,
      -0.6125926872786202, 0.13187643733994786
    ],
    [
      1.0000000000000000, 1.8466736192584305, 1.0000000000000000, -0.3190661665817673,
      0.29140967523377553
    ],
    [
      1.0000000000000000, 1.648795055047372, 0.9999999999999998, 0.06076167121153805,
      0.4984243325343967
    ],
    [
      1.0000000000000000, 1.459139853427764, 0.9999999999999998, 0.37703985322489586,
      0.6721138263458347
    ],
    [
      1.0000000000000000, 1.3116532086335044, 0.9999999999999999, 0.5973914775512698,
      0.7955385873005747
    ],
    [
      1.0000000000000000, 1.2109484406557494, 1.0000000000000000, 0.7387197862035764,
      0.8788571064087001
    ],
    [
      1.0000000000000000, 1.1502952430178814, 0.9999999999999998, 0.824163636062829,
      0.9362950931513307
    ],
    [
      1.0000000000000000, 1.1221376470808058, 0.9999999999999999, 0.8708683205996026,
      0.980025035115969
    ],
  ]

  #lowpassCar = new SosFilter(this.#sosLowpass);
  #lowpassMod = new SosFilter(this.#sosLowpass);
  #lowpassDown = new SosFilter(this.#sosLowpass);

  #bandpassAm = new SosFilter(this.#sosBandpass);

  #forwardShifter = new FrequencyShifter();
  #backwardShifter = new FrequencyShifter();

  reset() {
    this.#lowpassCar.reset();
    this.#lowpassMod.reset();
    this.#lowpassDown.reset();
    this.#bandpassAm.reset();
    this.#forwardShifter.reset();
    this.#backwardShifter.reset();
  }

  // `carrior` isn't mixed to output.
  process(carrior, modulator) {
    const upCar = [carrior, 0, 0];
    const upMod = [modulator, 0, 0];
    for (let idx = 0; idx < 3; ++idx) {
      upCar[idx] = this.#lowpassCar.process(upCar[idx]);
      upMod[idx] = this.#lowpassMod.process(upMod[idx]);

      let shiftedCar = this.#forwardShifter.process(upCar[idx], 1 / 6);
      let am = shiftedCar * upMod[idx];
      let filtered = this.#bandpassAm.process(am);
      let result = this.#backwardShifter.process(filtered, -1 / 6);

      this.#lowpassDown.push(result);
    }
    return 9 * this.#lowpassDown.output();
  }
}
