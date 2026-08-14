// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {uiSize} from "../common/gui/palette.js";
import * as widget from "../common/gui/widget.js";
import * as parameter from "../common/parameter.js";
import * as util from "../common/util.js";
import * as wave from "../common/wave.js";

import * as menuitems from "./menuitems.js";

const version = 1;
const nOsc = 3;

const randomUniform
  = (prm, low, high) => prm.randomize((p) => (p.dsp = util.randomUniformFloat(low, high)));
const randomInt
  = (prm, low, high) => prm.randomize((p) => (p.dsp = util.randomUniformInt(low, high)));
const randomLoguniform
  = (prm, low, high) => prm.randomize((p) => (p.dsp = util.randomLoguniform(low, high)));
const randomLogInt
  = (prm, low, high) => prm.randomize((p) => (p.dsp = util.randomLoguniformInt(low, high)));
const randomFull = (prm) => prm.randomize((p) => (p.normalized = Math.random()));

function getChordRatio(minSt, maxSt, targetSts = null) {
  const validPairs = [];
  for (let denom = 1; denom <= 10; ++denom) {
    for (let num = 1; num <= 100; ++num) {
      const ratio = num / denom;
      const st = ((12 * Math.log2(ratio)) % 12 + 12) % 12;
      if (targetSts !== null) {
        if (targetSts.some(target => Math.abs(st - target) <= 0.4)) {
          validPairs.push({num, denom});
        }
      } else {
        if (st >= minSt - 0.4 && st <= maxSt + 0.4) { validPairs.push({num, denom}); }
      }
    }
  }
  if (validPairs.length === 0) return {num: 1, denom: 1};
  return validPairs[Math.floor(Math.random() * validPairs.length)];
}

const localRecipeBook = {
  "Default": (param) => {
    for (let i = 0; i < nOsc; ++i) {
      param[`osc${i}_oscillatorType`].randomize((p) => {
        const choices = [0, 1, 3, 4];
        p.dsp = choices[Math.floor(Math.random() * choices.length)];
      });
    }
    const isSaw = param.osc0_oscillatorType.dsp === 4;

    randomInt(param.subInvertPhase, 0, 1 + 1); // Upper bound is exclusive, [low, high).
    randomInt(param.subOscOctave, -2, 1);
    randomLoguniform(param.subOscSkew, 1, 8);

    randomLoguniform(param.unisonDetune, isSaw ? 0.01 : 0.1, isSaw ? 20 : 200);
    randomUniform(param.unisonPhase, 0, 1);
    randomUniform(param.unisonCombTime, 0, 1);
    randomInt(param.seed, 0, param.seed.scale.maxDsp);

    randomUniform(
      param.lfoDuration, param.lfoDuration.scale.minDsp, param.lfoDuration.scale.maxDsp);
    randomUniform(param.lfoPmIndex, 0, 8);
    randomUniform(param.lfoPhase, 0, 1);
    randomInt(param.lfoFreqDenominator, 10, 200);

    for (let i = 0; i < nOsc; ++i) {
      param[`osc${i}_combTime`].resetToDefault();
      param[`osc${i}_combFeedback`].resetToDefault();
      randomLoguniform(param[`osc${i}_sinSkew`], 1, 8);

      if (i === 0) {
        param[`osc${i}_envDuration`].randomize((p) => (p.dsp = 4));
        param[`osc${i}_envCurve`].randomize((p) => (p.dsp = 1));
        param[`osc${i}_envSustain`].randomize((p) => (p.dsp = 0));
        randomUniform(param[`osc${i}_envSaturation`], 0, 1);
        param[`osc${i}_freqDenominator`].randomize((p) => (p.dsp = 3));
        param[`osc${i}_freqNumerator`].randomize((p) => (p.dsp = 3));
      } else {
        randomUniform(param[`osc${i}_envCurve`], 1, 4);
        randomUniform(param[`osc${i}_envSustain`], 0, 1 / 8);
        param[`osc${i}_envSaturation`].randomize((p) => (p.dsp = 0));

        if (i === 1) {
          randomUniform(param[`osc${i}_envDuration`], 1, 16);
          randomInt(param[`osc${i}_freqDenominator`], 1, 2);
          randomInt(param[`osc${i}_freqNumerator`], 1, 8);
        } else {
          randomUniform(param[`osc${i}_envDuration`], 0.25, 2.5);
          const denom = util.uniformIntMap(Math.random(), 1, 4);
          param[`osc${i}_freqDenominator`].randomize((p) => (p.dsp = denom));
          const numMax = Math.min(6 * denom, param[`osc${i}_freqNumerator`].scale.maxDsp);
          randomInt(param[`osc${i}_freqNumerator`], 1, numMax);
        }
      }

      if (i === nOsc - 1) {
        randomUniform(param[`osc${i}_sinShaper`], 0, 1);
        param[`osc${i}_pmIndex`].randomize((p) => (p.dsp = 0.1 * Math.random()));
      } else if (i === 0) {
        param[`osc${i}_sinShaper`].randomize((p) => (p.dsp = 0));
        randomUniform(param[`osc${i}_pmIndex`], 0.5, 10);
      } else {
        param[`osc${i}_sinShaper`].randomize((p) => (p.dsp = 0.2 * Math.random()));
        const isMagicOsc = param[`osc${i}_oscillatorType`].dsp === 2;
        randomUniform(param[`osc${i}_pmIndex`], 0.5, isMagicOsc ? 2 : 10);
      }

      randomUniform(param[`osc${i}_sinPhase`], 0, 1);
    }
  },

  "HighFreq": (param) => {
    for (let i = 0; i < nOsc; ++i) {
      param[`osc${i}_oscillatorType`].randomize((p) => {
        const choices = [0, 1, 3, 4];
        p.dsp = choices[Math.floor(Math.random() * choices.length)];
      });
    }
    const isSaw = param.osc0_oscillatorType.dsp === 4;

    randomInt(param.subInvertPhase, 0, 2);
    randomInt(param.subOscOctave, -2, 1);
    randomLoguniform(param.subOscSkew, 1, 8);

    randomUniform(param.unisonDetune, param.unisonDetune.scale.minDsp, isSaw ? 10 : 100);
    randomUniform(param.unisonPhase, 0, 1);
    randomUniform(param.unisonCombTime, 0, 1);
    randomInt(param.seed, 0, param.seed.scale.maxDsp);

    randomUniform(
      param.lfoDuration, param.lfoDuration.scale.minDsp, param.lfoDuration.scale.maxDsp);
    randomUniform(param.lfoPmIndex, 0, 8);
    randomUniform(param.lfoPhase, 0, 1);
    randomInt(param.lfoFreqDenominator, 10, 200);

    for (let i = 0; i < nOsc; ++i) {
      param[`osc${i}_combTime`].resetToDefault();
      param[`osc${i}_combFeedback`].resetToDefault();
      randomLoguniform(param[`osc${i}_sinSkew`], 1, 8);

      if (i === 0) {
        param[`osc${i}_envDuration`].randomize((p) => (p.dsp = 4));
        param[`osc${i}_envCurve`].randomize((p) => (p.dsp = 1));
        param[`osc${i}_envSustain`].randomize((p) => (p.dsp = 0));
        randomUniform(param[`osc${i}_envSaturation`], 0, 1);
        param[`osc${i}_freqDenominator`].randomize((p) => (p.dsp = 3));
        param[`osc${i}_freqNumerator`].randomize((p) => (p.dsp = 3));
      } else {
        randomUniform(param[`osc${i}_envCurve`], 1, 4);
        randomUniform(param[`osc${i}_envSustain`], 0, 1 / 8);
        param[`osc${i}_envSaturation`].randomize((p) => (p.dsp = 0));

        randomUniform(param[`osc${i}_envDuration`], 1, 16);
        param[`osc${i}_freqDenominator`].randomize((p) => (p.dsp = 1));
        const freqNum = Math.floor(2 ** util.uniformIntMap(Math.random(), 0, 6))
          + util.uniformIntMap(Math.random(), 0, 3);
        param[`osc${i}_freqNumerator`].randomize((p) => (p.dsp = freqNum));
      }

      if (i === nOsc - 1) {
        randomUniform(param[`osc${i}_sinShaper`], 0, 1);
        param[`osc${i}_pmIndex`].randomize((p) => (p.dsp = 0.1 * Math.random()));
      } else if (i === 0) {
        param[`osc${i}_sinShaper`].randomize((p) => (p.dsp = 0));
        randomUniform(param[`osc${i}_pmIndex`], 0.5, 10);
      } else {
        param[`osc${i}_sinShaper`].randomize((p) => (p.dsp = 0.2 * Math.random()));
        randomUniform(param[`osc${i}_pmIndex`], 0.5, 10);
      }

      randomUniform(param[`osc${i}_sinPhase`], 0, 1);
    }
  },

  "Magic Glitch": (param) => {
    for (let i = 0; i < nOsc; ++i) {
      param[`osc${i}_oscillatorType`].randomize((p) => (p.dsp = 2));
    }
    param.bypassEnvelopes.randomize((p) => (p.dsp = 1));
    param.nUnison.randomize((p) => (p.dsp = 2));

    const isSaw = param.osc0_oscillatorType.dsp === 4;

    randomInt(param.subInvertPhase, 0, 2);
    randomInt(param.subOscOctave, -2, 1);
    randomLoguniform(param.subOscSkew, 1, 8);

    randomUniform(param.unisonDetune, param.unisonDetune.scale.minDsp, isSaw ? 10 : 100);
    randomUniform(param.unisonPhase, 0, 1);
    randomUniform(param.unisonCombTime, 0, 1);
    randomInt(param.seed, 0, param.seed.scale.maxDsp);

    randomUniform(
      param.lfoDuration, param.lfoDuration.scale.minDsp, param.lfoDuration.scale.maxDsp);
    randomUniform(param.lfoPmIndex, 0, 8);
    randomUniform(param.lfoPhase, 0, 1);
    randomInt(param.lfoFreqDenominator, 10, 200);

    for (let i = 0; i < nOsc; ++i) {
      param[`osc${i}_combTime`].resetToDefault();
      param[`osc${i}_combFeedback`].resetToDefault();
      randomLoguniform(param[`osc${i}_sinSkew`], 1, 8);

      if (i === 0) {
        param[`osc${i}_envDuration`].randomize((p) => (p.dsp = 4));
        param[`osc${i}_envCurve`].randomize((p) => (p.dsp = 1));
        param[`osc${i}_envSustain`].randomize((p) => (p.dsp = 0));
        randomUniform(param[`osc${i}_envSaturation`], 0, 1);
        param[`osc${i}_freqDenominator`].randomize((p) => (p.dsp = 3));
        param[`osc${i}_freqNumerator`].randomize((p) => (p.dsp = 3));
      } else {
        randomUniform(param[`osc${i}_envCurve`], 1, 4);
        randomUniform(param[`osc${i}_envSustain`], 0, 1 / 8);
        param[`osc${i}_envSaturation`].randomize((p) => (p.dsp = 0));

        randomUniform(param[`osc${i}_envDuration`], 1, 16);
        param[`osc${i}_freqDenominator`].randomize((p) => (p.dsp = 1));
        const freqNum = Math.floor(2 ** util.uniformIntMap(Math.random(), 0, 6))
          + util.uniformIntMap(Math.random(), 0, 3);
        param[`osc${i}_freqNumerator`].randomize((p) => (p.dsp = freqNum));
      }

      if (i === nOsc - 1) {
        randomUniform(param[`osc${i}_sinShaper`], 0, 1);
        param[`osc${i}_pmIndex`].randomize((p) => (p.dsp = 0.1 * Math.random()));
      } else if (i === 0) {
        param[`osc${i}_sinShaper`].randomize((p) => (p.dsp = 0));
        randomUniform(param[`osc${i}_pmIndex`], 0.5, 10);
      } else {
        param[`osc${i}_sinShaper`].randomize((p) => (p.dsp = 0.2 * Math.random()));
        randomUniform(param[`osc${i}_pmIndex`], 0.5, 10);
      }

      randomUniform(param[`osc${i}_sinPhase`], 0, 1);
    }
  },

  "Unison": (param) => {
    for (let i = 0; i < nOsc; ++i) {
      param[`osc${i}_oscillatorType`].randomize((p) => {
        const choices = [0, 1, 3, 4];
        p.dsp = choices[Math.floor(Math.random() * choices.length)];
      });
    }
    const isSaw = param.osc0_oscillatorType.dsp === 4;

    randomInt(param.subInvertPhase, 0, 2);
    randomInt(param.subOscOctave, -2, 1);
    randomUniform(param.subOscSkew, 0.1, 3);

    randomLoguniform(param.unisonDetune, 0.01, isSaw ? 100 : 1200);
    randomUniform(param.unisonPhase, 0, 1);
    randomUniform(param.unisonCombTime, 0, 1);
    randomInt(param.seed, 0, param.seed.scale.maxDsp);

    randomUniform(
      param.lfoDuration, param.lfoDuration.scale.minDsp, param.lfoDuration.scale.maxDsp);
    randomUniform(param.lfoPhase, 0, 1);
    randomInt(param.lfoFreqDenominator, 10, 200);

    for (let i = 0; i < nOsc; ++i) {
      if (i === 0) {
        param[`osc${i}_envDuration`].randomize((p) => (p.dsp = 4));
        param[`osc${i}_envCurve`].randomize((p) => (p.dsp = 1));
        param[`osc${i}_envSustain`].randomize((p) => (p.dsp = 0));
        randomUniform(param[`osc${i}_envSaturation`], 0, 1);
        param[`osc${i}_freqDenominator`].randomize((p) => (p.dsp = 3));
        param[`osc${i}_freqNumerator`].randomize((p) => (p.dsp = 3));
      } else {
        randomUniform(param[`osc${i}_envCurve`], 1, 4);
        randomUniform(param[`osc${i}_envSustain`], 0, 1 / 8);
        param[`osc${i}_envSaturation`].randomize((p) => (p.dsp = 0));
        randomUniform(param[`osc${i}_sinSkew`], 0.1, 3);

        randomUniform(param[`osc${i}_envDuration`], 1, 16);
        param[`osc${i}_freqDenominator`].randomize((p) => (p.dsp = 1));
        const freqNum = Math.floor(2 ** util.uniformIntMap(Math.random(), 0, 6))
          + util.uniformIntMap(Math.random(), 0, 3);
        param[`osc${i}_freqNumerator`].randomize((p) => (p.dsp = freqNum));
      }

      if (i === nOsc - 1) {
        randomUniform(param[`osc${i}_sinShaper`], 0, 1);
        param[`osc${i}_pmIndex`].randomize((p) => (p.dsp = 0.1 * Math.random()));
      } else if (i === 0) {
        param[`osc${i}_sinShaper`].randomize((p) => (p.dsp = 0));
        randomUniform(param[`osc${i}_pmIndex`], 0.5, 10);
      } else {
        param[`osc${i}_sinShaper`].randomize((p) => (p.dsp = 0.2 * Math.random()));
        randomUniform(param[`osc${i}_pmIndex`], 0.5, 10);
      }

      param[`osc${i}_sinSkew`].randomize((p) => (p.dsp = 1));
      randomUniform(param[`osc${i}_sinPhase`], 0, 1);
    }
  },

  "Delay in Mod": (param) => {
    for (let i = 0; i < nOsc; ++i) {
      param[`osc${i}_oscillatorType`].randomize((p) => {
        const choices = [0, 1, 3, 4];
        p.dsp = choices[Math.floor(Math.random() * choices.length)];
      });
    }
    const isSaw = param.osc0_oscillatorType.dsp === 4;

    randomInt(param.subInvertPhase, 0, 2);
    randomInt(param.subOscOctave, -2, 1);
    randomUniform(param.subOscSkew, 0.1, 3);

    randomLoguniform(param.unisonDetune, 0.1, isSaw ? 20 : 200);
    randomUniform(param.unisonPhase, 0, 1);
    randomUniform(param.unisonCombTime, 0, 1);
    randomInt(param.seed, 0, param.seed.scale.maxDsp);

    randomUniform(
      param.lfoDuration, param.lfoDuration.scale.minDsp, param.lfoDuration.scale.maxDsp);
    randomUniform(param.lfoPmIndex, 0, 8);
    randomUniform(param.lfoPhase, 0, 1);
    randomInt(param.lfoFreqDenominator, 10, 200);

    for (let i = 0; i < nOsc; ++i) {
      if (i === 0) {
        param[`osc${i}_envDuration`].randomize((p) => (p.dsp = 4));
        param[`osc${i}_envCurve`].randomize((p) => (p.dsp = 1));
        param[`osc${i}_envSustain`].randomize((p) => (p.dsp = 0));
        randomUniform(param[`osc${i}_envSaturation`], 0, 1);
        param[`osc${i}_freqDenominator`].randomize((p) => (p.dsp = 3));
        param[`osc${i}_freqNumerator`].randomize((p) => (p.dsp = 3));
      } else {
        randomLoguniform(param[`osc${i}_combTime`], scales.combTime.minDsp, scales.combTime.maxDsp);
        randomFull(param[`osc${i}_combFeedback`]);

        randomUniform(param[`osc${i}_envCurve`], 1, 4);
        randomUniform(param[`osc${i}_envSustain`], 0, 1 / 8);
        param[`osc${i}_envSaturation`].randomize((p) => (p.dsp = 0));
        randomUniform(param[`osc${i}_sinSkew`], 0.1, 3);

        if (i === 1) {
          randomUniform(param[`osc${i}_envDuration`], 1, 16);
          randomLogInt(param[`osc${i}_freqDenominator`], 1, 10);
          randomLogInt(param[`osc${i}_freqNumerator`], 1, 64);
        } else {
          randomUniform(param[`osc${i}_envDuration`], 0.25, 2.5);
          const denom = util.uniformIntMap(Math.random(), 1, 4);
          param[`osc${i}_freqDenominator`].randomize((p) => (p.dsp = denom));
          const numMax = Math.min(6 * denom, param[`osc${i}_freqNumerator`].scale.maxDsp);
          randomInt(param[`osc${i}_freqNumerator`], 1, numMax);
        }
      }

      const absFb = Math.min(Math.abs(param[`osc${i}_combFeedback`].dsp), 1);
      const normalizeGain = 0.5 + 0.5 * Math.sqrt((1 - absFb) / (1 + absFb));

      if (i === nOsc - 1) {
        randomUniform(param[`osc${i}_sinShaper`], 0, 1);
        param[`osc${i}_pmIndex`].randomize((p) => (p.dsp = normalizeGain * 0.1 * Math.random()));
      } else if (i === 0) {
        param[`osc${i}_sinShaper`].randomize((p) => (p.dsp = 0));
        randomUniform(param[`osc${i}_pmIndex`], 0.5, 10);
      } else {
        param[`osc${i}_sinShaper`].randomize((p) => (p.dsp = normalizeGain * 0.2 * Math.random()));
        randomUniform(param[`osc${i}_pmIndex`], 0.5, 10);
      }

      param[`osc${i}_sinSkew`].randomize((p) => (p.dsp = 1));
      randomUniform(param[`osc${i}_sinPhase`], 0, 1);
    }
  },

  "Delay": (param) => {
    for (let i = 0; i < nOsc; ++i) {
      param[`osc${i}_oscillatorType`].randomize((p) => {
        const choices = [0, 1, 3, 4];
        p.dsp = choices[Math.floor(Math.random() * choices.length)];
      });
    }
    const isSaw = param.osc0_oscillatorType.dsp === 4;

    randomInt(param.subInvertPhase, 0, 2);
    randomInt(param.subOscOctave, -2, 1);
    randomUniform(param.subOscSkew, 0.1, 3);

    randomLoguniform(param.unisonDetune, 0.1, isSaw ? 20 : 200);
    randomUniform(param.unisonPhase, 0, 1);
    randomUniform(param.unisonCombTime, 0, 1);
    randomInt(param.seed, 0, param.seed.scale.maxDsp);

    randomUniform(
      param.lfoDuration, param.lfoDuration.scale.minDsp, param.lfoDuration.scale.maxDsp);
    randomUniform(param.lfoPmIndex, 0, 8);
    randomUniform(param.lfoPhase, 0, 1);
    randomInt(param.lfoFreqDenominator, 10, 200);

    for (let i = 0; i < nOsc; ++i) {
      randomLoguniform(param[`osc${i}_combTime`], scales.combTime.minDsp, scales.combTime.maxDsp);
      randomFull(param[`osc${i}_combFeedback`]);

      if (i === 0) {
        param[`osc${i}_envDuration`].randomize((p) => (p.dsp = 4));
        param[`osc${i}_envCurve`].randomize((p) => (p.dsp = 1));
        param[`osc${i}_envSustain`].randomize((p) => (p.dsp = 0));
        randomUniform(param[`osc${i}_envSaturation`], 0, 1);
        param[`osc${i}_freqDenominator`].randomize((p) => (p.dsp = 3));
        param[`osc${i}_freqNumerator`].randomize((p) => (p.dsp = 3));
      } else {
        randomUniform(param[`osc${i}_envCurve`], 1, 4);
        randomUniform(param[`osc${i}_envSustain`], 0, 1 / 8);
        param[`osc${i}_envSaturation`].randomize((p) => (p.dsp = 0));
        randomUniform(param[`osc${i}_sinSkew`], 0.1, 3);

        if (i === 1) {
          const denom = util.randomUniformInt(1, 4);
          const numer = util.randomLoguniformInt(1, 64);
          param[`osc${i}_freqDenominator`].dsp = denom;
          param[`osc${i}_freqNumerator`].dsp = numer;

          randomLoguniform(param[`osc${i}_envDuration`], 0.01, 4);
        } else {
          randomLoguniform(param[`osc${i}_envDuration`], 0.05, 2);
          const denom = util.uniformIntMap(Math.random(), 1, 4);
          param[`osc${i}_freqDenominator`].randomize((p) => (p.dsp = denom));
          const numMax = Math.min(6 * denom, param[`osc${i}_freqNumerator`].scale.maxDsp);
          randomInt(param[`osc${i}_freqNumerator`], 1, numMax);
        }
      }

      const absFb = Math.min(Math.abs(param[`osc${i}_combFeedback`].dsp), 1);
      const normalizeGain = 0.5 + 0.5 * Math.sqrt((1 - absFb) / (1 + absFb));

      if (i === nOsc - 1) {
        randomUniform(param[`osc${i}_sinShaper`], 0, 1);
        param[`osc${i}_pmIndex`].randomize((p) => (p.dsp = normalizeGain * 0.1 * Math.random()));
      } else if (i === 0) {
        param[`osc${i}_sinShaper`].randomize((p) => (p.dsp = 0));
        randomUniform(param[`osc${i}_pmIndex`], 0.5, 10);
      } else {
        param[`osc${i}_sinShaper`].randomize((p) => (p.dsp = normalizeGain * 0.2 * Math.random()));
        randomUniform(param[`osc${i}_pmIndex`], 0.5, 10);
      }

      param[`osc${i}_sinSkew`].randomize((p) => (p.dsp = 1));
      randomUniform(param[`osc${i}_sinPhase`], 0, 1);
    }
  },

  "Chord 2-5 semitones": (param) => {
    for (let i = 0; i < nOsc; ++i) {
      param[`osc${i}_oscillatorType`].randomize((p) => (p.dsp = 0));
    }
    const isSaw = param.osc0_oscillatorType.dsp === 4;

    randomUniform(param.subOscGain, 0.3, 0.8);
    randomInt(param.subOscOctave, -2, 1);
    randomLoguniform(param.subOscSkew, 1, 8);
    randomInt(param.subInvertPhase, 0, 2);
    randomUniform(param.subOscBesselComp, 0, 1);

    const ratio = getChordRatio(2, 5);

    randomLoguniform(param.unisonDetune, isSaw ? 0.01 : 0.1, isSaw ? 20 : 200);
    randomUniform(param.unisonPhase, 0, 1);
    randomUniform(param.unisonCombTime, 0, 1);
    randomInt(param.seed, 0, param.seed.scale.maxDsp);

    randomUniform(
      param.lfoDuration, param.lfoDuration.scale.minDsp, param.lfoDuration.scale.maxDsp);
    randomUniform(param.lfoPmIndex, 0, 8);
    randomUniform(param.lfoPhase, 0, 1);
    randomInt(param.lfoFreqDenominator, 10, 200);

    for (let i = 0; i < nOsc; ++i) {
      param[`osc${i}_combTime`].resetToDefault();
      param[`osc${i}_combFeedback`].resetToDefault();
      randomLoguniform(param[`osc${i}_sinSkew`], 1, 8);

      if (i === 0) {
        param[`osc${i}_envDuration`].randomize((p) => (p.dsp = 4));
        param[`osc${i}_envCurve`].randomize((p) => (p.dsp = 1));
        param[`osc${i}_envSustain`].randomize((p) => (p.dsp = 0));
        randomUniform(param[`osc${i}_envSaturation`], 0, 1);
        param[`osc${i}_freqDenominator`].randomize((p) => (p.dsp = ratio.denom));
        param[`osc${i}_freqNumerator`].randomize((p) => (p.dsp = ratio.num));
      } else {
        randomUniform(param[`osc${i}_envCurve`], 1, 4);
        randomUniform(param[`osc${i}_envSustain`], 0, 1 / 8);
        param[`osc${i}_envSaturation`].randomize((p) => (p.dsp = 0));

        if (i === 1) {
          randomUniform(param[`osc${i}_envDuration`], 1, 16);
          randomInt(param[`osc${i}_freqDenominator`], 1, 2);
          randomInt(param[`osc${i}_freqNumerator`], 1, 8);
        } else {
          randomUniform(param[`osc${i}_envDuration`], 0.25, 2.5);
          const denom = util.uniformIntMap(Math.random(), 1, 4);
          param[`osc${i}_freqDenominator`].randomize((p) => (p.dsp = denom));
          const numMax = Math.min(6 * denom, param[`osc${i}_freqNumerator`].scale.maxDsp);
          randomInt(param[`osc${i}_freqNumerator`], 1, numMax);
        }
      }

      if (i === nOsc - 1) {
        randomUniform(param[`osc${i}_sinShaper`], 0, 1);
        param[`osc${i}_pmIndex`].randomize((p) => (p.dsp = 0.1 * Math.random()));
      } else if (i === 0) {
        param[`osc${i}_sinShaper`].randomize(
          (p) => (p.dsp = Math.random() < 0.5 ? 0 : Math.random()));
        randomUniform(param[`osc${i}_pmIndex`], 0.5, 10);
      } else {
        param[`osc${i}_sinShaper`].randomize((p) => (p.dsp = 0.2 * Math.random()));
        const isMagicOsc = param[`osc${i}_oscillatorType`].dsp === 2;
        randomUniform(param[`osc${i}_pmIndex`], 0.5, isMagicOsc ? 2 : 10);
      }

      randomUniform(param[`osc${i}_sinPhase`], 0, 1);
    }
  },

  "Chord 5-7 semitones": (param) => {
    for (let i = 0; i < nOsc; ++i) {
      param[`osc${i}_oscillatorType`].randomize((p) => (p.dsp = 0));
    }
    const isSaw = param.osc0_oscillatorType.dsp === 4;

    randomUniform(param.subOscGain, 0.3, 0.8);
    randomInt(param.subOscOctave, -2, 1);
    randomLoguniform(param.subOscSkew, 1, 8);
    randomInt(param.subInvertPhase, 0, 2);
    randomUniform(param.subOscBesselComp, 0, 1);

    const ratio = getChordRatio(null, null, [5, 7]);

    randomLoguniform(param.unisonDetune, isSaw ? 0.01 : 0.1, isSaw ? 20 : 200);
    randomUniform(param.unisonPhase, 0, 1);
    randomUniform(param.unisonCombTime, 0, 1);
    randomInt(param.seed, 0, param.seed.scale.maxDsp);

    randomUniform(
      param.lfoDuration, param.lfoDuration.scale.minDsp, param.lfoDuration.scale.maxDsp);
    randomUniform(param.lfoPmIndex, 0, 8);
    randomUniform(param.lfoPhase, 0, 1);
    randomInt(param.lfoFreqDenominator, 10, 200);

    for (let i = 0; i < nOsc; ++i) {
      param[`osc${i}_combTime`].resetToDefault();
      param[`osc${i}_combFeedback`].resetToDefault();
      randomLoguniform(param[`osc${i}_sinSkew`], 1, 8);

      if (i === 0) {
        param[`osc${i}_envDuration`].randomize((p) => (p.dsp = 4));
        param[`osc${i}_envCurve`].randomize((p) => (p.dsp = 1));
        param[`osc${i}_envSustain`].randomize((p) => (p.dsp = 0));
        randomUniform(param[`osc${i}_envSaturation`], 0, 1);
        param[`osc${i}_freqDenominator`].randomize((p) => (p.dsp = ratio.denom));
        param[`osc${i}_freqNumerator`].randomize((p) => (p.dsp = ratio.num));
      } else {
        randomUniform(param[`osc${i}_envCurve`], 1, 4);
        randomUniform(param[`osc${i}_envSustain`], 0, 1 / 8);
        param[`osc${i}_envSaturation`].randomize((p) => (p.dsp = 0));

        if (i === 1) {
          randomUniform(param[`osc${i}_envDuration`], 1, 16);
          randomInt(param[`osc${i}_freqDenominator`], 1, 2);
          randomInt(param[`osc${i}_freqNumerator`], 1, 8);
        } else {
          randomUniform(param[`osc${i}_envDuration`], 0.25, 2.5);
          const denom = util.uniformIntMap(Math.random(), 1, 4);
          param[`osc${i}_freqDenominator`].randomize((p) => (p.dsp = denom));
          const numMax = Math.min(6 * denom, param[`osc${i}_freqNumerator`].scale.maxDsp);
          randomInt(param[`osc${i}_freqNumerator`], 1, numMax);
        }
      }

      if (i === nOsc - 1) {
        randomUniform(param[`osc${i}_sinShaper`], 0, 1);
        param[`osc${i}_pmIndex`].randomize((p) => (p.dsp = 0.1 * Math.random()));
      } else if (i === 0) {
        param[`osc${i}_sinShaper`].randomize(
          (p) => (p.dsp = Math.random() < 0.5 ? 0 : Math.random()));
        randomUniform(param[`osc${i}_pmIndex`], 0.5, 10);
      } else {
        param[`osc${i}_sinShaper`].randomize((p) => (p.dsp = 0.2 * Math.random()));
        const isMagicOsc = param[`osc${i}_oscillatorType`].dsp === 2;
        randomUniform(param[`osc${i}_pmIndex`], 0.5, isMagicOsc ? 2 : 10);
      }

      randomUniform(param[`osc${i}_sinPhase`], 0, 1);
    }
  },

  "Chord 2-9-10 semitones": (param) => {
    for (let i = 0; i < nOsc; ++i) {
      param[`osc${i}_oscillatorType`].randomize((p) => (p.dsp = 0));
    }
    const isSaw = param.osc0_oscillatorType.dsp === 4;

    randomUniform(param.subOscGain, 0.3, 0.8);
    randomInt(param.subOscOctave, -2, 1);
    randomLoguniform(param.subOscSkew, 1, 8);
    randomInt(param.subInvertPhase, 0, 2);
    randomUniform(param.subOscBesselComp, 0, 1);

    const ratio = getChordRatio(null, null, [2, 9, 10]);

    randomLoguniform(param.unisonDetune, isSaw ? 0.01 : 0.1, isSaw ? 20 : 200);
    randomUniform(param.unisonPhase, 0, 1);
    randomUniform(param.unisonCombTime, 0, 1);
    randomInt(param.seed, 0, param.seed.scale.maxDsp);

    randomUniform(
      param.lfoDuration, param.lfoDuration.scale.minDsp, param.lfoDuration.scale.maxDsp);
    randomUniform(param.lfoPmIndex, 0, 8);
    randomUniform(param.lfoPhase, 0, 1);
    randomInt(param.lfoFreqDenominator, 10, 200);

    for (let i = 0; i < nOsc; ++i) {
      param[`osc${i}_combTime`].resetToDefault();
      param[`osc${i}_combFeedback`].resetToDefault();
      randomLoguniform(param[`osc${i}_sinSkew`], 1, 8);

      if (i === 0) {
        param[`osc${i}_envDuration`].randomize((p) => (p.dsp = 4));
        param[`osc${i}_envCurve`].randomize((p) => (p.dsp = 1));
        param[`osc${i}_envSustain`].randomize((p) => (p.dsp = 0));
        randomUniform(param[`osc${i}_envSaturation`], 0, 1);
        param[`osc${i}_freqDenominator`].randomize((p) => (p.dsp = ratio.denom));
        param[`osc${i}_freqNumerator`].randomize((p) => (p.dsp = ratio.num));
      } else {
        randomUniform(param[`osc${i}_envCurve`], 1, 4);
        randomUniform(param[`osc${i}_envSustain`], 0, 1 / 8);
        param[`osc${i}_envSaturation`].randomize((p) => (p.dsp = 0));

        if (i === 1) {
          randomUniform(param[`osc${i}_envDuration`], 1, 16);
          randomInt(param[`osc${i}_freqDenominator`], 1, 2);
          randomInt(param[`osc${i}_freqNumerator`], 1, 8);
        } else {
          randomUniform(param[`osc${i}_envDuration`], 0.25, 2.5);
          const denom = util.uniformIntMap(Math.random(), 1, 4);
          param[`osc${i}_freqDenominator`].randomize((p) => (p.dsp = denom));
          const numMax = Math.min(6 * denom, param[`osc${i}_freqNumerator`].scale.maxDsp);
          randomInt(param[`osc${i}_freqNumerator`], 1, numMax);
        }
      }

      if (i === nOsc - 1) {
        randomUniform(param[`osc${i}_sinShaper`], 0, 1);
        param[`osc${i}_pmIndex`].randomize((p) => (p.dsp = 0.1 * Math.random()));
      } else if (i === 0) {
        param[`osc${i}_sinShaper`].randomize(
          (p) => (p.dsp = Math.random() < 0.5 ? 0 : Math.random()));
        randomUniform(param[`osc${i}_pmIndex`], 0.5, 10);
      } else {
        param[`osc${i}_sinShaper`].randomize((p) => (p.dsp = 0.2 * Math.random()));
        const isMagicOsc = param[`osc${i}_oscillatorType`].dsp === 2;
        randomUniform(param[`osc${i}_pmIndex`], 0.5, isMagicOsc ? 2 : 10);
      }

      randomUniform(param[`osc${i}_sinPhase`], 0, 1);
    }
  },

  "All": (param) => {
    randomFull(param.unisonDetune);
    randomFull(param.unisonPhase);
    randomUniform(param.unisonCombTime, 0, 1);
    randomFull(param.seed);

    randomFull(param.lfoDuration);
    randomFull(param.lfoPmIndex);
    randomFull(param.lfoPhase);
    randomFull(param.lfoFreqDenominator);

    randomFull(param.modHpfCutoff);
    randomFull(param.subOscGain);
    randomFull(param.subOscOctave);
    randomFull(param.subOscSkew);
    randomFull(param.subOscBesselComp);
    randomFull(param.subInvertPhase);
    randomFull(param.enableMonoBass);
    randomFull(param.asymModAmount);

    randomFull(param.lorGain);
    randomFull(param.lorDuration);
    // randomFull(param.lorWidth);

    for (let i = 0; i < nOsc; ++i) {
      param[`osc${i}_oscillatorType`].randomize((p) => {
        const choices = [0, 1, 3, 4];
        p.dsp = choices[Math.floor(Math.random() * choices.length)];
      });
      randomFull(param[`osc${i}_envDuration`]);
      randomFull(param[`osc${i}_envCurve`]);
      randomFull(param[`osc${i}_envSustain`]);
      randomFull(param[`osc${i}_envSaturation`]);
      randomFull(param[`osc${i}_pmIndex`]);
      randomFull(param[`osc${i}_sinPhase`]);
      randomFull(param[`osc${i}_sinSkew`]);
      randomFull(param[`osc${i}_sinShaper`]);
      randomFull(param[`osc${i}_freqNumerator`]);
      randomFull(param[`osc${i}_freqDenominator`]);
      randomFull(param[`osc${i}_combTime`]);
      randomFull(param[`osc${i}_combFeedback`]);
    }
  },
};

const scales = {
  boolean: new parameter.IntScale(0, 1),
  renderDuration: new parameter.DecibelScale(-40, 24, false),
  fade: new parameter.DecibelScale(-60, 40, true),
  decayTo: new parameter.DecibelScale(util.ampToDB(1 / 2 ** 24), 0, false),
  overSample: new parameter.MenuItemScale(menuitems.oversampleItems),
  sampleRateScaler: new parameter.MenuItemScale(menuitems.sampleRateScalerItems),

  note: new parameter.IntScale(-36, 136),

  nUnison: new parameter.IntScale(1, 128),
  unisonDetune:
    new parameter.DecibelScale(util.ampToDB(util.nextafter(0.01, 0)), util.ampToDB(1200), true),
  unisonPhase: new parameter.LinearScale(0, 1),
  unisonCombTime: new parameter.LinearScale(0, 1),
  seed: new parameter.IntScale(0, 2 ** 32),

  lfoDuration: new parameter.DecibelScale(-40, 24, false),
  lfoPmIndex: new parameter.LinearScale(0, 8),
  lfoPhase: new parameter.LinearScale(0, 1),
  lfoFreqDenominator: new parameter.IntScale(10, 200),

  oscillatorType: new parameter.MenuItemScale(menuitems.oscillatorTypeItems),
  envelopeType: new parameter.MenuItemScale(menuitems.envelopeTypeItems),
  envDuration: new parameter.DecibelScale(-40, 24, false),
  envCurve: new parameter.LinearScale(1, 4),
  envSustain: new parameter.LinearScale(0, 1),
  envSaturation: new parameter.LinearScale(0, 1),
  pmIndex: new parameter.DecibelScale(-40, 30, true),
  sinPhase: new parameter.LinearScale(0, 1),
  sinSkew: new parameter.DecibelScale(util.ampToDB(0.1), util.ampToDB(16), false),
  sinShaper: new parameter.LinearScale(0, 1),
  freqNumerator: new parameter.IntScale(1, 100),
  freqDenominator: new parameter.IntScale(1, 10),

  combTime: new parameter.DecibelScale(util.ampToDB(0.1), util.ampToDB(1000), false),
  combFeedback: new parameter.NegativeSymmetricLogScale(0.001, 1),

  modHpfCutoff: new parameter.DecibelScale(util.ampToDB(10), util.ampToDB(10000), true),
  subGain: new parameter.LinearScale(0, 1),
  subOscOctave: new parameter.IntScale(-2, 0),
  besselComp: new parameter.LinearScale(0, 1),
  asymAmount: new parameter.LinearScale(-1, 1),

  lorGain: new parameter.DecibelScale(-24, 60, true),
  lorDuration: new parameter.DecibelScale(-40, 24, false),
  lorWidth: new parameter.LinearScale(0.001, 1.0),
};

const param = {
  renderDuration: new parameter.Parameter(0.5, scales.renderDuration, true),
  fadeIn: new parameter.Parameter(0.002, scales.fade, true),
  fadeOut: new parameter.Parameter(0.002, scales.fade, true),
  decayTo: new parameter.Parameter(1, scales.decayTo, false),
  overSample: new parameter.Parameter(0, scales.overSample),
  sampleRateScaler: new parameter.Parameter(3, scales.sampleRateScaler),
  envelopeType: new parameter.Parameter(0, scales.envelopeType),
  bypassEnvelopes: new parameter.Parameter(0, scales.boolean),
  integerPitch: new parameter.Parameter(0, scales.boolean),

  note: new parameter.Parameter(36, scales.note, true),
  nUnison: new parameter.Parameter(3, scales.nUnison, true),
  unisonDetune: new parameter.Parameter(2, scales.unisonDetune, true),
  unisonPhase: new parameter.Parameter(0, scales.unisonPhase, true),
  unisonCombTime: new parameter.Parameter(0, scales.unisonCombTime, true),
  seed: new parameter.Parameter(0, scales.seed, true),

  lfoDuration: new parameter.Parameter(4, scales.lfoDuration, true),
  lfoPmIndex: new parameter.Parameter(0, scales.lfoPmIndex, true),
  lfoPhase: new parameter.Parameter(0, scales.lfoPhase, true),
  lfoFreqDenominator: new parameter.Parameter(40, scales.lfoFreqDenominator, true),

  modHpfCutoff: new parameter.Parameter(0, scales.modHpfCutoff, true),
  subOscGain: new parameter.Parameter(0, scales.subGain, true),
  subOscOctave: new parameter.Parameter(-1, scales.subOscOctave),
  subOscSkew: new parameter.Parameter(2, scales.sinSkew, true),
  subOscBesselComp: new parameter.Parameter(0.25, scales.besselComp, true),
  subInvertPhase: new parameter.Parameter(0, scales.boolean),
  enableMonoBass: new parameter.Parameter(1, scales.boolean),
  asymModAmount: new parameter.Parameter(0, scales.asymAmount, true),

  lorGain: new parameter.Parameter(0, scales.lorGain, false),
  lorDuration: new parameter.Parameter(1.0, scales.lorDuration, true),
  lorWidth: new parameter.Parameter(0.1, scales.lorWidth, true),
};

for (let i = 0; i < nOsc; ++i) {
  param[`osc${i}_oscillatorType`] = new parameter.Parameter(0, scales.oscillatorType);
  param[`osc${i}_envDuration`] = new parameter.Parameter(4, scales.envDuration, true);
  param[`osc${i}_envCurve`] = new parameter.Parameter(1, scales.envCurve, true);
  param[`osc${i}_envSustain`] = new parameter.Parameter(0, scales.envSustain, true);
  param[`osc${i}_envSaturation`] = new parameter.Parameter(0, scales.envSaturation, true);
  param[`osc${i}_pmIndex`] = new parameter.Parameter(0, scales.pmIndex, true);
  param[`osc${i}_sinPhase`] = new parameter.Parameter(0, scales.sinPhase, true);
  param[`osc${i}_sinSkew`] = new parameter.Parameter(1, scales.sinSkew, true);
  param[`osc${i}_sinShaper`] = new parameter.Parameter(0, scales.sinShaper, true);
  param[`osc${i}_freqNumerator`] = new parameter.Parameter(3, scales.freqNumerator, true);
  param[`osc${i}_freqDenominator`] = new parameter.Parameter(3, scales.freqDenominator, true);
  param[`osc${i}_combTime`] = new parameter.Parameter(1, scales.combTime, true);
  param[`osc${i}_combFeedback`] = new parameter.Parameter(0, scales.combFeedback, true);
}

const recipeBook = parameter.addLocalRecipes(localRecipeBook);
await parameter.loadJson(param, recipeBook, []);

function getSampleRateScaler() {
  return parseInt(menuitems.sampleRateScalerItems[param.sampleRateScaler.dsp]);
}

function render() {
  audio.render(
    parameter.toMessage(param, {
      sampleRate: audio.audioContext.sampleRate * getSampleRateScaler(),
      nOsc: nOsc,
    }),
    "link",
    playControl.togglebuttonQuickSave.state === 1,
  );
}

const audio = new wave.Audio(
  2,
  "./renderer.js",
  undefined,
  (wave) => {
    for (let i = 0; i < waveView.length; ++i) { waveView[i].set(wave.data[i], wave.peakValue); }
  },
);

const pageTitle = widget.pageTitle(document.body);
const divMain = widget.div(document.body, "main", undefined);

const divLeft = widget.div(divMain, undefined, "controlBlock");
const divMid = widget.div(divMain, undefined, "controlBlock");
const divRight = widget.div(divMain, undefined, "controlBlock");

const headingWaveform = widget.heading(divLeft, 6, "Waveform");
const waveView = [
  new widget.WaveView(
    divLeft, uiSize.waveViewWidth, uiSize.waveViewHeight, audio.wave.data[0], false),
  new widget.WaveView(
    divLeft, uiSize.waveViewWidth, uiSize.waveViewHeight, audio.wave.data[1], false),
];

const pRenderStatus = widget.paragraph(divLeft, "renderStatus", undefined);
audio.renderStatusElement = pRenderStatus;

const recipeExportDialog = new widget.RecipeExportDialog(document.body, (ev) => {
  parameter.downloadJson(param, version, recipeExportDialog.author, recipeExportDialog.recipeName);
});
const recipeImportDialog = new widget.RecipeImportDialog(document.body, (ev, data) => {
  const recipeName = parameter.addRecipe(param, recipeBook, data);
  if (recipeName) {
    widget.option(playControl.selectRandom, recipeName);
    playControl.selectRandom.value = recipeName;
    recipeBook.get(recipeName).randomize(param);
    render();
    widget.refresh(ui);
  }
});

const playControl = widget.playControl(
  divLeft,
  (ev) => { audio.play(getSampleRateScaler()); },
  (ev) => { audio.stop(); },
  (ev) => { audio.save(false, [], getSampleRateScaler()); },
  (ev) => {},
  (ev) => {
    recipeBook.get(playControl.selectRandom.value).randomize(param);
    render();
    widget.refresh(ui);
  },
  [...recipeBook.keys()],
  (ev) => {
    const recipeOptions = {author: "temp", recipeName: util.getTimeStamp()};
    const currentRecipe = parameter.dumpJsonObject(param, version, recipeOptions);
    const optionName = parameter.addRecipe(param, recipeBook, currentRecipe);
    widget.option(playControl.selectRandom, optionName);
  },
  (ev) => { recipeExportDialog.open(); },
  (ev) => { recipeImportDialog.open(); },
);

const detailRender = widget.details(divLeft, "Render");
const detailLor = widget.details(divLeft, "Attack Enhancement");
const detailBass = widget.details(divLeft, "Bass Enhancement");
const detailFM = widget.details(divMid, "FM Oscillators");
const detailLFO = widget.details(divMid, "Pitch LFO");
const detailSub = widget.details(divMid, "Sub Oscillator");
const detailUnison = widget.details(divRight, "Unison");

const ui = {
  renderDuration: new widget.NumberInput(detailRender, "Length [s]", param.renderDuration, render),
  fadeIn: new widget.NumberInput(detailRender, "Declick In [s]", param.fadeIn, render),
  fadeOut: new widget.NumberInput(detailRender, "Declick Out [s]", param.fadeOut, render),
  decayTo: new widget.NumberInput(detailRender, "Decay To [dB]", param.decayTo, render),
  overSample: new widget.ComboBoxLine(detailRender, "Oversampling", param.overSample, render),
  sampleRateScaler:
    new widget.ComboBoxLine(detailRender, "Sample Rate Scale", param.sampleRateScaler, render),
  envelopeType: new widget.ComboBoxLine(detailRender, "Env Type", param.envelopeType, render),
  bypassEnvelopes: new widget.ToggleButtonLine(
    detailRender, ["Bypass Envelopes Off", "Bypass Envelopes On"], param.bypassEnvelopes, render),
  integerPitch: new widget.ToggleButtonLine(
    detailRender, ["Integer Pitch Off", "Integer Pitch On"], param.integerPitch, render),

  note: new widget.NumberInput(detailUnison, "Note [st.]", param.note, render),
  nUnison: new widget.NumberInput(detailUnison, "nUnison", param.nUnison, render),
  unisonDetune: new widget.NumberInput(detailUnison, "Detune [cent]", param.unisonDetune, render),
  unisonPhase: new widget.NumberInput(detailUnison, "Phase", param.unisonPhase, render),
  unisonCombTime: new widget.NumberInput(detailUnison, "Comb Time", param.unisonCombTime, render),
  seed: new widget.NumberInput(detailUnison, "Seed", param.seed, render),

  lfoDuration: new widget.NumberInput(detailLFO, "Duration [ratio]", param.lfoDuration, render),
  lfoPmIndex: new widget.NumberInput(detailLFO, "PM Index", param.lfoPmIndex, render),
  lfoPhase: new widget.NumberInput(detailLFO, "Phase", param.lfoPhase, render),
  lfoFreqDenominator: new widget.NumberInput(detailLFO, "f0 / N", param.lfoFreqDenominator, render),

  enableMonoBass: new widget.ToggleButtonLine(
    detailBass, ["Mono Bass Off", "Mono Bass On"], param.enableMonoBass, render),
  modHpfCutoff:
    new widget.NumberInput(detailBass, "Mod HPF Cutoff [Hz]", param.modHpfCutoff, render),
  asymModAmount: new widget.NumberInput(detailBass, "Asym Mod Amount", param.asymModAmount, render),

  subOscGain: new widget.NumberInput(detailSub, "Sub Osc Gain", param.subOscGain, render),
  subOscOctave: new widget.NumberInput(detailSub, "Sub Octave", param.subOscOctave, render),
  subOscSkew: new widget.NumberInput(detailSub, "Sub Skew", param.subOscSkew, render),
  subOscBesselComp:
    new widget.NumberInput(detailSub, "Adaptive Bass", param.subOscBesselComp, render),
  subInvertPhase: new widget.ToggleButtonLine(
    detailSub, ["Invert Phase Off", "Invert Phase On"], param.subInvertPhase, render),

  lorGain: new widget.NumberInput(detailLor, "Gain [dB]", param.lorGain, render),
  lorDuration: new widget.NumberInput(detailLor, "Duration [ratio]", param.lorDuration, render),

  // // Uncomment to expose the parameter.
  // lorWidth: new widget.NumberInput(detailLor, "Width", param.lorWidth, render),
};

const contentFuncs = [];
for (let i = 0; i < nOsc; ++i) {
  contentFuncs.push((tabParent) => {
    let widgets = {
      oscillatorType:
        new widget.ComboBoxLine(tabParent, "Osc. Type", param[`osc${i}_oscillatorType`], render),
      envDuration:
        new widget.NumberInput(tabParent, "Duration [ratio]", param[`osc${i}_envDuration`], render),
      envCurve: new widget.NumberInput(tabParent, "Env Curve", param[`osc${i}_envCurve`], render),
      envSustain:
        new widget.NumberInput(tabParent, "Env Sustain", param[`osc${i}_envSustain`], render),
      envSaturation:
        new widget.NumberInput(tabParent, "Env Saturation", param[`osc${i}_envSaturation`], render),
      pmIndex: new widget.NumberInput(tabParent, "PM Index", param[`osc${i}_pmIndex`], render),
      sinPhase: new widget.NumberInput(tabParent, "Phase", param[`osc${i}_sinPhase`], render),
      sinSkew: new widget.NumberInput(tabParent, "Sin Skew", param[`osc${i}_sinSkew`], render),
      sinShaper:
        new widget.NumberInput(tabParent, "Sin Shaper", param[`osc${i}_sinShaper`], render),
      freqNumerator:
        new widget.NumberInput(tabParent, "f0 * N", param[`osc${i}_freqNumerator`], render),
      freqDenominator:
        new widget.NumberInput(tabParent, "f0 / N", param[`osc${i}_freqDenominator`], render),
      combTime:
        new widget.NumberInput(tabParent, "Comb Time [ms]", param[`osc${i}_combTime`], render),
      combFeedback:
        new widget.NumberInput(tabParent, "Comb Feedback", param[`osc${i}_combFeedback`], render),
    };
    return {
      index: i,
      label: `Oscillator ${i}`,
      widgets: widgets,
    };
  });
}

const tabView = new widget.TabView(detailFM, "oscillatorTab", contentFuncs);
ui.oscillatorTabs = tabView;

render();
window.addEventListener("load", (ev) => { widget.refresh(ui); });
