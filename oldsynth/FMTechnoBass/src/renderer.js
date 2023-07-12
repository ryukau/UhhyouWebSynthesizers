importScripts(
  "lib/bezier-easing.js",
  "prng.js",
  "envelope.js",
);

const TWO_PI = 2 * Math.PI;
const HALF_PI = Math.PI / 2;

function noteToFreq(note) { return 440 * 2 ** ((note - 69) / 12); }

function dbToAmp(dB, min) {
  if (dB <= min) return 0;
  return 10 ** (dB / 20);
}

class Downsampler8 {
  constructor() {
    this.nSection = 6;

    this.co = [
      [
        2.0478175697515062e-05, 5.313899743869536e-06, 2.047817569751506e-05,
        -1.7517115385026274, 0.7700392502488301
      ],
      [1.0, -1.438980096034124, 1.0, -1.774966834164871, 0.8105614413580351],
      [1.0, -1.7274028784750513, 1.0, -1.808053369266683, 0.867640704095363],
      [
        1.0, -1.8120823742998813, 1.0000000000000004, -1.8388054096377313,
        0.9192163691033324
      ],
      [
        1.0, -1.8441397779182482, 1.0000000000000002, -1.8637392843186766,
        0.9580528037069385
      ],
      [1.0, -1.855844538281174, 1.0, -1.8856454058448944, 0.9871065355804314],
    ];

    this.x0 = new Array(this.nSection).fill(0);
    this.x1 = new Array(this.nSection).fill(0);
    this.x2 = new Array(this.nSection).fill(0);
    this.y0 = new Array(this.nSection).fill(0);
    this.y1 = new Array(this.nSection).fill(0);
    this.y2 = new Array(this.nSection).fill(0);
  }

  push(input) {
    this.x0[0] = input;
    for (var i = 1; i < this.nSection; ++i) this.x0[i] = this.y0[i - 1];

    for (var i = 0; i < this.nSection; ++i) {
      this.y0[i] = +this.co[i][0] * this.x0[i] + this.co[i][1] * this.x1[i]
        + this.co[i][2] * this.x2[i] - this.co[i][3] * this.y1[i]
        - this.co[i][4] * this.y2[i];
    }

    this.x2 = this.x1.slice();
    this.x1 = this.x0.slice();
    this.y2 = this.y1.slice();
    this.y1 = this.y0.slice();
  }

  output() { return this.y0[this.nSection - 1]; }

  processArray(sound) {
    var buf = new Array(Math.floor(sound.length / 8)).fill(0);
    for (var i = 0; i < buf.length; ++i) {
      var index = 8 * i;
      for (var j = 0; j < 8; ++j) this.push(sound[index + j]);
      buf[i] = this.output();
    }
    return buf;
  }
}

class WaveShaper {
  constructor(shapeFunc) {
    const length = 2048;
    this.end = length - 1;

    this.curve = new Array(length);
    for (var i = 0; i < length; ++i) this.curve[i] = shapeFunc(i / this.end);
  }

  process(input) {
    const absed = Math.abs(input);
    if (absed >= 1.0) return this.curve[this.end];

    const pos = this.end * absed;
    const idx = Math.floor(pos);
    const frac = pos - idx;

    const c0 = this.curve[idx];
    const c1 = this.curve[idx + 1];
    return Math.sign(input) * c0 + frac * (c1 - c0);
  }
}

class Oscillator {
  constructor(skew, shape, phase) {
    this.phase = phase;
    this.y1 = 0;
    this.skew = skew;
    this.shaper = new WaveShaper(this.getShapeFunc(shape));
  }

  getShapeFunc(shape) {
    if (shape > 1e-5) {
      const range = TWO_PI * shape;
      const normalize = range < HALF_PI ? Math.sin(range) : 1;
      return (x) => Math.sin(range * x) / normalize;
    }
    return (x) => x;
  }

  process(sampleRate, pitchHz, modIn) {
    this.phase += pitchHz / sampleRate;
    this.phase -= Math.floor(this.phase);
    var ph = TWO_PI * Math.pow(this.phase, this.skew);
    return this.shaper.process(Math.sin(ph + modIn));
  }
}

class DecayEnvelope {
  constructor(timeInSample, saturation, curve, sustain) {
    this.env = new ExpDecay(timeInSample);
    this.shaper = new WaveShaper((x) => x + saturation * (Math.tanh(4 * x) - x));
    this.curve = curve;
    this.sustain = sustain;
  }

  process() {
    return this.sustain
      + (1 - this.sustain) * this.shaper.process(this.env.env() ** this.curve);
  }
}

function calcEnd(value, amount, min, max) {
  var diff = max - min;
  if (amount > 0) return value + amount * (max - value);
  return value + amount * (value - min);
}

function normalize(sound, length) {
  if (length === undefined) length = sound.length;

  var max = 0;
  for (var i = 0; i < length; ++i) {
    var absed = Math.abs(sound[i]);
    if (max < absed) max = absed;
  }

  if (max > 0) {
    for (var i = 0; i < length; ++i) sound[i] /= max;
  }
  return sound;
}

class OscBlock {
  constructor(
    frequency,
    durationInSample,
    sinPhase = 0,
    sinSkew = 1,
    sinShaper = 0,
    envCurve = 1,
    envSustain = 0,
    envSaturation = 0,
  ) {
    this.oscFreq = frequency;
    this.osc = new Oscillator(sinSkew, sinShaper, sinPhase);
    this.env = new DecayEnvelope(durationInSample, envSaturation, envCurve, envSustain);
  }

  process(sampleRate, modIn) {
    return this.env.process() * this.osc.process(sampleRate, this.oscFreq, modIn);
  }
}

onmessage = (event) => {
  var params = event.data;
  var sampleRate = params.sampleRate;
  if (params.overSampling) sampleRate *= 8;
  var rng = getRng(params.seed + params.channel);

  var durationInSample = sampleRate * params.length;
  var sound = new Array(Math.floor(durationInSample)).fill(0);
  var nUnison = params.nUnison;
  var unisonDetune = params.unisonDetune / 100; // Unit is cent.
  var unisonPhase = params.unisonPhase / nUnison;
  for (var unison = 0; unison < nUnison; ++unison) {
    var frequency = noteToFreq(params.note + unison * unisonDetune);

    var osc = new Array(params.nOsc);
    var pmIndex = new Array(params.nOsc);
    for (var i = 0; i < params.nOsc; ++i) {
      var prm = params.oscData[i];
      osc[i] = new OscBlock(
        frequency * prm.freqNumerator / prm.freqDenominator,
        Math.floor(durationInSample * prm.envDuration),
        prm.sinPhase + unison * unisonPhase * rng(),
        prm.sinSkew,
        prm.sinShaper,
        prm.envCurve,
        prm.envSustain,
        prm.envSaturation,
      );
      pmIndex[i] = prm.pmIndex;
    }

    var lfo = new OscBlock(
      frequency / params.lfoFreqDenominator,
      Math.floor(durationInSample * params.lfoDuration),
      params.lfoPhase,
    );
    var lfoIndex = params.lfoPmIndex;

    var feedback = 0;
    var last = osc.length - 1;
    for (var i = 0; i < sound.length; ++i) {
      feedback = osc[last].process(sampleRate, pmIndex[last] * feedback);
      var buf = feedback;
      for (var j = osc.length - 2; j > 0; --j) {
        buf = osc[j].process(sampleRate, pmIndex[j] * buf);
      }
      var mod0 = pmIndex[0] * buf + lfoIndex * lfo.process(sampleRate, 0);
      sound[i] += osc[0].process(sampleRate, mod0);
    }
  }

  if (params.overSampling) {
    var downsampler = new Downsampler8();
    sound = downsampler.processArray(sound);
  }

  postMessage(sound);
};
