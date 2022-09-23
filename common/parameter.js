import * as util from "./util.js";

export function toMessage(param, info) {
  let dest = {};
  for (const key in param) {
    if (Array.isArray(param[key])) {
      dest[key] = param[key].map(element => element.dsp);
    } else {
      dest[key] = param[key].dsp;
    }
  }
  return Object.assign({}, dest, info);
}

/*
`Parameter` is basically a glue between GUI and DSP that enables flexible value
scaling. DSP value is considered as ground truth of current state.
*/
export class Parameter {
  #raw; // DSP value.

  constructor(defaultDsp, scale, displayDsp = false) {
    console.assert(defaultDsp >= scale.minDsp, new Error());
    console.assert(defaultDsp <= scale.maxDsp, new Error());

    this.scale = scale;
    this.displayDsp = displayDsp;

    this.defaultDsp = defaultDsp;
    this.defaultUi = this.scale.toUi(defaultDsp);
    this.#raw = defaultDsp;

    if (scale.constructor.name == "IntScale") {
      console.assert(Number.isInteger(this.defaultUi), new Error());
      this.step = 1;
    } else {
      this.step = "any";
    }
  }

  resetToDefault() { this.#raw = this.defaultDsp; }

  get ui() { return this.scale.toUi(this.#raw); }
  set ui(x) { this.#raw = this.scale.toDsp(x); }

  get dsp() { return this.#raw; }
  set dsp(x) { this.#raw = util.clamp(x, this.scale.minDsp, this.scale.maxDsp); }

  get normalized() {
    return (this.ui - this.scale.minUi) / (this.scale.maxUi - this.scale.minUi);
  }
  set normalized(x) {
    this.ui
      = this.scale.minUi + (this.scale.maxUi - this.scale.minUi) * util.clamp(x, 0, 1);
  }

  get display() { return this.displayDsp ? this.dsp : this.ui; }
  set display(x) { this.displayDsp ? (this.dsp = x) : (this.ui = x); }
  get defaultDispaly() { return this.displayDsp ? this.defaultDsp : this.defaultUi; }
  get minDisplay() { return this.displayDsp ? this.scale.minDsp : this.scale.minUi; }
  get maxDisplay() { return this.displayDsp ? this.scale.maxDsp : this.scale.maxUi; }
}

export class IntScale {
  constructor(min, max) {
    console.assert(Number.isFinite(min) && Number.isInteger(min), new Error());
    console.assert(Number.isFinite(max) && Number.isInteger(max), new Error());

    this.min = Math.floor(min);
    this.max = Math.floor(max);
  }

  get minUi() { return this.min; }
  get maxUi() { return this.max; }

  get minDsp() { return this.min; }
  get maxDsp() { return this.max; }

  toDsp(uiValue) { return Math.floor(uiValue); }
  toUi(dspValue) { return Math.floor(dspValue); }
}

export class LinearScale {
  constructor(min, max) {
    console.assert(Number.isFinite(min), new Error());
    console.assert(Number.isFinite(max), new Error());

    this.min = min;
    this.max = max;
  }

  get minUi() { return this.min; }
  get maxUi() { return this.max; }

  get minDsp() { return this.min; }
  get maxDsp() { return this.max; }

  toDsp(uiValue) { return uiValue; }
  toUi(dspValue) { return dspValue; }
}

// Decibel in UI, amplitude in DSP.
export class DecibelScale {
  constructor(minDB, maxDB, minToZero) {
    console.assert(Number.isFinite(minDB) || -Infinity === minDB, new Error());
    console.assert(Number.isFinite(maxDB), new Error());
    console.assert(typeof minToZero === "boolean", new Error());

    this.minToZero = minToZero;
    this.minDB = minDB;
    this.maxDB = maxDB;
    this.minAmp = minToZero ? 0 : util.dbToAmp(minDB);
    this.maxAmp = util.dbToAmp(maxDB);

    console.assert(
      this.maxDB > this.minDB, "maxDB must be greater than minDB.", new Error());
  }

  get minUi() { return this.minDB; }
  get maxUi() { return this.maxDB; }

  get minDsp() { return this.minAmp; }
  get maxDsp() { return this.maxAmp; }

  toDsp(dB) {
    if (this.minToZero && dB <= this.minDB) return 0;
    return util.dbToAmp(dB);
  }

  toUi(amplitude) { return util.clamp(util.ampToDB(amplitude), this.minDB, this.maxDB); }
}

// Decibel in UI, amplitude in DSP. `offset` is in amplitude.
//
// A use case is filter Q factor.
export class NegativeDecibelScale {
  constructor(minDB, maxDB, offset, minToZero) {
    console.assert(Number.isFinite(minDB) || -Infinity === minDB, new Error());
    console.assert(Number.isFinite(maxDB), new Error());
    console.assert(Number.isFinite(offset), new Error());
    console.assert(typeof minToZero === "boolean", new Error());

    this.scale = new DecibelScale(minDB, maxDB, minToZero);
    this.offset = offset;
  }

  get minUi() { return -this.scale.maxDB; }
  get maxUi() { return -this.scale.minDB; }

  get minDsp() { return this.offset - this.scale.maxAmp; }
  get maxDsp() { return this.offset - this.scale.minAmp; }

  toDsp(negativeDB) { return this.offset - this.scale.toDsp(-negativeDB); }
  toUi(amplitude) { return 1 - this.scale.toUi(this.offset - amplitude); }
}

export class MidiPitchScale {
  constructor(minPitch, maxPitch, minToZero) {
    console.assert(Number.isFinite(minPitch) || -Infinity === minPitch, new Error());
    console.assert(Number.isFinite(maxPitch), new Error());
    console.assert(typeof minToZero === "boolean", new Error());

    this.minToZero = minToZero;
    this.minPitch = minPitch;
    this.maxPitch = maxPitch;
    this.minHz = minToZero ? 0 : util.midiPitchToFreq(minPitch);
    this.maxHz = util.midiPitchToFreq(maxPitch);

    console.assert(
      this.maxPitch > this.minPitch,
      "maxPitch must be greater than minPitch.",
      new Error(),
    );
  }

  get minUi() { return this.minPitch; }
  get maxUi() { return this.maxPitch; }

  get minDsp() { return this.minHz; }
  get maxDsp() { return this.maxHz; }

  toDsp(pitch) {
    if (this.minToZero && pitch <= this.minPitch) return 0;
    return util.midiPitchToFreq(pitch);
  }

  toUi(frequency) {
    return util.clamp(util.freqToMidiPitch(frequency), this.minPitch, this.maxPitch);
  }
}

// It works, but this is probably bad idea.
export class MenuItemScale {
  constructor(items) {
    console.assert(Array.isArray(items), new Error());
    this.items = items;
  }

  get minUi() { return 0; }
  get maxUi() { return this.items.length; }

  get minDsp() { return 0; }
  get maxDsp() { return this.items.length; }

  toDsp(index) { return Math.floor(index); }
  toUi(index) { return Math.floor(index); }
}
