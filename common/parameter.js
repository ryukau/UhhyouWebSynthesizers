// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import * as util from "./util.js";

export function toMessage(param, info) {
  const mapValue = (val) => Array.isArray(val) ? val.map(mapValue) : val.dsp;
  let dest = {};
  for (const key in param) { dest[key] = mapValue(param[key]); }
  return Object.assign({}, dest, info);
}

/**
`Parameter` provides different representations of a same value. DSP value is considered as
the ground truth of current state.
*/
export class Parameter {
  static isRandomizing = false;
  static history = null;
  #raw; // DSP value.

  constructor(defaultDsp, scale, displayDsp = false, comment = "") {
    console.assert(
      defaultDsp >= scale.minDsp, "Parameter default DSP value is less than scale.minDsp",
      new Error());
    console.assert(
      defaultDsp <= scale.maxDsp, "Parameter default DSP value is greater than scale.maxDsp",
      new Error());

    this.scale = scale;
    this.displayDsp = displayDsp;
    this.comment = comment;

    // Not sure if this is a good idea, because a functionality of Randomizer is leaking.
    this.lockRandomization = false;

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

  #guardWrite() { return Parameter.isRandomizing && this.lockRandomization; }

  get ui() { return this.scale.toUi(this.#raw); }
  set ui(x) {
    if (this.#guardWrite()) { return; }
    this.#raw = this.scale.toDsp(x);
  }

  get dsp() { return this.#raw; }
  set dsp(x) {
    if (this.#guardWrite()) { return; }
    this.#raw = util.clamp(x, this.scale.minDsp, this.scale.maxDsp);
  }

  get normalized() {
    if (this.ui <= this.scale.minUi) return 0;
    return (this.ui - this.scale.minUi) / (this.scale.maxUi - this.scale.minUi);
  }
  set normalized(x) {
    if (this.#guardWrite()) { return; }
    this.ui = this.normalizedToUi(x);
  }

  get display() { return this.displayDsp ? this.dsp : this.ui; }
  set display(x) {
    if (this.#guardWrite()) { return; }
    this.displayDsp ? (this.dsp = x) : (this.ui = x);
  }
  get defaultDispaly() { return this.displayDsp ? this.defaultDsp : this.defaultUi; }
  get minDisplay() {
    if (this.displayDsp) return this.scale.minDsp;
    return this.scale.minToZero ? -Infinity : this.scale.minUi;
  }
  get maxDisplay() { return this.displayDsp ? this.scale.maxDsp : this.scale.maxUi; }

  uiToNormalized(x) {
    if (x <= this.scale.minUi) return 0;
    if (this.scale.maxUi === this.scale.minUi) return 0;
    return (x - this.scale.minUi) / (this.scale.maxUi - this.scale.minUi);
  }
  normalizedToUi(x) {
    if (x <= 0 && this.scale.minToZero) return -Infinity;
    return this.scale.minUi + (this.scale.maxUi - this.scale.minUi) * util.clamp(x, 0, 1);
  }

  dspToNormalized(x) { return this.uiToNormalized(this.scale.toUi(x)); }
  normalizedToDsp(x) { return this.scale.toDsp(this.normalizedToUi(x)); }

  displayToNormalized(x) {
    return this.displayDsp ? this.dspToNormalized(x) : this.uiToNormalized(x);
  }
  normalizedToDisplay(x) {
    return this.displayDsp ? this.normalizedToDsp(x) : this.normalizedToUi(x);
  }

  randomize(randomFunc) {
    if (!this.lockRandomization) randomFunc(this);
  }
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

  toDsp(uiValue) { return Math.floor(uiValue + 0.5); }
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
    console.assert(
      Number.isFinite(minDB) || -Infinity === minDB, "minDB must be finite or -inf.", new Error());
    console.assert(Number.isFinite(maxDB), "maxDB must be finite.", new Error());
    console.assert(typeof minToZero === "boolean", "minToZero must be boolean.", new Error());

    this.minToZero = minToZero;
    this.minDB = minDB;
    this.maxDB = maxDB;
    this.minAmp = minToZero ? 0 : util.dbToAmp(minDB);
    this.maxAmp = util.dbToAmp(maxDB);

    console.assert(this.maxDB > this.minDB, "maxDB must be greater than minDB.", new Error());
  }

  get minUi() { return this.minDB; }
  get maxUi() { return this.maxDB; }

  get minDsp() { return this.minAmp; }
  get maxDsp() { return this.maxAmp; }

  toDsp(dB) {
    if (this.minToZero && dB <= this.minDB) return 0;
    return util.dbToAmp(dB);
  }

  toUi(amplitude) {
    if (this.minToZero && amplitude <= this.minAmp) return -Infinity;
    return util.clamp(util.ampToDB(amplitude), this.minDB, this.maxDB);
  }
}

// Decibel in UI, amplitude in DSP. `offset` is in amplitude.
//
// Example use cases are feedback of a comb filter, and filter Q factor.
export class NegativeDecibelScale {
  constructor(minDB, maxDB, offset, minToZero) {
    console.assert(Number.isFinite(minDB) || -Infinity === minDB, new Error());
    console.assert(Number.isFinite(maxDB), new Error());
    console.assert(Number.isFinite(offset), new Error());
    console.assert(typeof minToZero === "boolean", new Error());

    this.scale = new DecibelScale(minDB, maxDB, minToZero);
    this.offset = offset;
  }

  get minToZero() { return this.scale.minToZero; }

  get minUi() { return -this.scale.maxDB; }
  get maxUi() { return -this.scale.minDB; }

  get minDsp() { return this.offset - this.offset * this.scale.maxAmp; }
  get maxDsp() { return this.offset - this.offset * this.scale.minAmp; }

  toDsp(negativeDB) { return this.offset - this.offset * this.scale.toDsp(-negativeDB); }
  toUi(amplitude) {
    const raw = this.scale.toUi((this.offset - amplitude) / this.offset);
    if (!Number.isFinite(raw)) { return raw === -Infinity ? Infinity : -Infinity; }
    return raw === 0 ? 0 : -raw;
  }
}

// DecibelScale with negative values when normalized value is below 0.5.
//
// - When the normalized value is 0.5, `toDsp()` outputs 0.
// - The same decibel range is used for positive and negative values.
//
// Added to use for feedback or resonance. Increasing normalized value makes the
// output approach `offset` (defaulting to 1).
export class BipolarNegativeDecibelScale {
  #center = 0.5;

  constructor(minDB, maxDB, offset = 1) {
    console.assert(Number.isFinite(minDB), new Error("minDB must be a finite number."));
    console.assert(
      Number.isFinite(maxDB) && maxDB > minDB, new Error("maxDB must be greater than minDB."));
    console.assert(Number.isFinite(offset), new Error("offset must be a finite number."));

    this.minDB = minDB;
    this.maxDB = maxDB;
    this.offset = offset;

    this.minAmp = 10 ** (minDB / 20);
    this.maxAmp = 10 ** (maxDB / 20);
    this.diffDB = maxDB - minDB;
  }

  get minUi() { return 0; }
  get maxUi() { return 1; }

  get minDsp() { return -(this.offset - this.minAmp); }
  get maxDsp() { return this.offset - this.minAmp; }

  toDsp(normalized) {
    if (normalized > this.#center) {
      const ratio = (normalized - this.#center) / (1 - this.#center);
      const dB = this.maxDB - ratio * this.diffDB;
      return this.offset - (10 ** (dB / 20));
    } else if (normalized < this.#center) {
      const ratio = (this.#center - normalized) / this.#center;
      const dB = this.maxDB - ratio * this.diffDB;
      return -(this.offset - (10 ** (dB / 20)));
    }
    return 0;
  }

  toUi(amplitude) {
    const absAmp = Math.abs(amplitude);
    const minDspVal = this.offset - this.maxAmp;

    if (absAmp <= minDspVal) { return this.#center; }

    const maxDspVal = this.offset - this.minAmp;
    const clampedDsp = Math.min(absAmp, maxDspVal);
    const rawAmp = this.offset - clampedDsp;
    const dB = 20 * Math.log10(rawAmp);
    const ratio = (this.maxDB - dB) / this.diffDB;

    return amplitude > 0 ? this.#center + (1 - this.#center) * ratio
                         : this.#center - this.#center * ratio;
  }
}

// Similar to DecibelScale, but can have negative values when normalized value is below
// 0.5.
//
// - When the normalized value is 0.5, `toDsp()` outputs 0.
// - The same range is used for positive and negative values.
//
// This scale is added for FM or PM amount.
export class SymmetricLogScale {
  #center = 0.5;

  constructor(positiveMinValue, positiveMaxValue) {
    console.assert(
      Number.isFinite(positiveMinValue) && positiveMinValue > 0,
      new Error("positiveMinValue must be positive."));
    console.assert(
      Number.isFinite(positiveMaxValue) && positiveMaxValue > positiveMinValue,
      new Error("positiveMaxValue must be greater than positiveMinValue."));

    this.minValue = positiveMinValue;
    this.maxValue = positiveMaxValue;

    this.minExp = Math.log(positiveMinValue);
    this.diffExp = Math.log(positiveMaxValue) - this.minExp;
  }

  get minUi() { return 0; }
  get maxUi() { return 1; }

  get minDsp() { return -this.maxValue; }
  get maxDsp() { return this.maxValue; }

  toDsp(normalized) {
    if (normalized > this.#center) {
      const ratio = (normalized - this.#center) / (1 - this.#center);
      return Math.exp(ratio * this.diffExp + this.minExp);
    } else if (normalized < this.#center) {
      const ratio = (this.#center - normalized) / this.#center;
      return -Math.exp(ratio * this.diffExp + this.minExp);
    }
    return 0;
  }

  toUi(amplitude) {
    const absAmp = Math.abs(amplitude);

    if (absAmp < this.minValue) { return this.#center; }

    const clampedAmp = Math.min(absAmp, this.maxValue);
    const value = (Math.log(clampedAmp) - this.minExp) / this.diffExp;

    return amplitude > 0 ? this.#center + (1 - this.#center) * value
                         : this.#center - this.#center * value;
  }
}

// Similar to SymmetricLogScale, but increasing the normalized value makes
// the output approach `offset` (defaulting to 1). Can have negative values
// when normalized value is below 0.5.
//
// - When the normalized value is 0.5, `toDsp()` outputs 0.
// - The same logarithmic range is used for positive and negative values.
//
// Added to use for feedback or resonance using explicit min/max positive values.
export class NegativeSymmetricLogScale {
  #center = 0.5;

  constructor(positiveMinValue, positiveMaxValue, offset = 1) {
    console.assert(
      Number.isFinite(positiveMinValue) && positiveMinValue > 0,
      new Error("positiveMinValue must be positive."));
    console.assert(
      Number.isFinite(positiveMaxValue) && positiveMaxValue > positiveMinValue,
      new Error("positiveMaxValue must be greater than positiveMinValue."));
    console.assert(Number.isFinite(offset), new Error("offset must be a finite number."));

    this.minValue = positiveMinValue;
    this.maxValue = positiveMaxValue;
    this.offset = offset;

    this.minExp = Math.log(positiveMinValue);
    this.diffExp = Math.log(positiveMaxValue) - this.minExp;
  }

  get minUi() { return 0; }
  get maxUi() { return 1; }

  get minDsp() { return -(this.offset - this.minValue); }
  get maxDsp() { return this.offset - this.minValue; }

  toDsp(normalized) {
    if (normalized > this.#center) {
      const ratio = (normalized - this.#center) / (1 - this.#center);
      const expVal = Math.exp((1 - ratio) * this.diffExp + this.minExp);
      return this.offset - expVal;
    } else if (normalized < this.#center) {
      const ratio = (this.#center - normalized) / this.#center;
      const expVal = Math.exp((1 - ratio) * this.diffExp + this.minExp);
      return -(this.offset - expVal);
    }
    return 0;
  }

  toUi(amplitude) {
    const absAmp = Math.abs(amplitude);
    const minDspVal = this.offset - this.maxValue;

    if (absAmp <= minDspVal) { return this.#center; }

    const maxDspVal = this.offset - this.minValue;
    const clampedDsp = Math.min(absAmp, maxDspVal);
    const expVal = this.offset - clampedDsp;
    const value = (Math.log(expVal) - this.minExp) / this.diffExp;
    const ratio = 1 - value;

    return amplitude > 0 ? this.#center + (1 - this.#center) * ratio
                         : this.#center - this.#center * ratio;
  }
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
    if (this.minToZero && frequency <= this.minHz) return -Infinity;
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

/**
`version` is there to handle old presets in case of breaking change. Use incremental
number and document the change somewhere. No need to be semver.

`options` format:

```
{
  author: <string>,
  recipeName: <string>,
  fullRange: <boolean>,
}
```

`author` and `recipeName` are used as a name of the recipe.

`fullRange` is used to dump full randomization recipe. This is only used to make first
recipe.json which will be copied to make other recipes.
*/
export function dumpJsonObject(param, version, options = {}) {
  // Handle options.
  const fullRange = options.fullRange === true;
  const author = options.author !== undefined ? `${options.author}` : "";
  const recipeName = options.recipeName !== undefined ? `${options.recipeName}`
                                                      : (fullRange === true ? "Full" : "Init");

  // Prepare destination `data`.
  let data = {
    meta: {author, recipeName, version},
    parameters: {},
  };

  // Fill `data.parameters`.
  const recursion = (prm, fullRange) => {
    if (Array.isArray(prm)) return prm.map(prm => recursion(prm, fullRange));
    return parameterToObject(prm, fullRange);
  };
  for (const [key, prm] of Object.entries(param)) {
    data.parameters[key] = recursion(prm, fullRange === true);
  }
  return data;
}

export function dumpJsonString(param, version, options = {}) {
  return JSON.stringify(dumpJsonObject(param, version, options));
}

export function downloadJson(param, version, author, recipeName) {
  const data = dumpJsonString(param, version, {author, recipeName});
  const blob = new Blob([data], {type: "application/json"});
  const url = window.URL.createObjectURL(blob);

  let a = document.createElement("a");
  a.style = "display: none";
  a.href = url;
  a.download = `${document.title}_${author}_${recipeName}.json`;
  document.body.appendChild(a);
  a.click();

  // Introducing delay to enable download on Firefox.
  setTimeout(() => {
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, 100);
}

// Used in `dumpJsonObject`.
function parameterToObject(prm, fullRange) {
  let obj = {};

  {
    let info = {};
    if (typeof prm.comment === "string" && prm.comment.length > 0) { info.comment = prm.comment; }
    info.min = prm.minDisplay === -Infinity ? "-Infinity" : prm.minDisplay;
    info.max = prm.maxDisplay;
    obj.info = info;
  }

  {
    let random = {};
    const val = fullRange ? prm.minDisplay : prm.display;
    random.min = val === -Infinity ? "-Infinity" : val;
    random.max = prm.maxDisplay;
    random.type = "display";
    obj.random = random;
  }

  return obj;
}

function addRecipeRecursion(recipeName, key, parameter, randomInfo) {
  if (Array.isArray(parameter) && !Array.isArray(randomInfo)) {
    console.warn(
      `Recipe "${recipeName}" doesn't specify array for array parameter "${key}".`, new Error());
  } else if (!Array.isArray(parameter) && Array.isArray(randomInfo)) {
    console.warn(
      `Recipe "${recipeName}" specifies array for non-array parameter "${key}".`, new Error());
  }

  if (Array.isArray(parameter) && Array.isArray(randomInfo)) {
    if (parameter.length !== randomInfo.length) {
      console.warn(`Array length mismatch on "${key}".`);
    }
    return parameter.map(
      (item,
       idx) => { return addRecipeRecursion(recipeName, `${key}_${idx}`, item, randomInfo[idx]); });
  }

  return new Randomizer(key, parameter, randomInfo);
}

export function addRecipe(parameters, recipeBook, newRecipe) {
  const author = newRecipe.meta?.author ?? "";
  const recipeName = newRecipe.meta?.recipeName ?? "WAV Import";
  const name = `${author} - ${recipeName}`;
  if (recipeBook.has(name)) {
    console.warn(`Recipe "${name}" is overwritten. Set unique author and name.`);
  }

  let dest = new Map();
  for (const [key, randomInfo] of Object.entries(newRecipe.parameters)) {
    dest.set(key, addRecipeRecursion(name, key, parameters[key], randomInfo));
  }
  recipeBook.set(name, new FullRandomizer(dest));

  return name;
}

function sortMapInPlace(map) {
  const sortedEntries = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  map.clear();
  for (const [key, value] of sortedEntries) { map.set(key, value); }
  return map;
}

/**
Return value is a Map with following structure. Note that the value of `parameter*` may be
a nested Array.

```
randomizationRecipes = {
  "author0 - recipe0": {
    parameter0: randomizer0,
    parameter1: randomizer1,
    parameter2: [randomizer2_0, randomizer2_1, ...],
    parameter3: [
      [randomizer3_0_0, randomizer3_0_1, ...],
      [randomizer3_1_0, randomizer3_1_1, ...], ...
    ], ...
  }, ...
};
```
*/
export async function loadJson(parameters, recipeBook, recipeJsonPaths) {
  // Support both loadJson(param, recipeBook, paths) and loadJson(param, paths).
  if (Array.isArray(recipeBook)) {
    recipeJsonPaths = recipeBook;
    recipeBook = new Map();
  }

  if (typeof window !== "undefined" && window.__onLoadJson) {
    window.__onLoadJson(parameters, recipeBook);
  }

  const fetchRecipe = async (recipeJsonPaths) => {
    let container = [];
    for (let idx = 0; idx < recipeJsonPaths.length; ++idx) {
      await fetch(recipeJsonPaths[idx])
        .then(response => response.json())
        .then(json => { container.push(json); })
        .catch(console.error);
    }
    return container;
  };

  let rawRecipes = await fetchRecipe(recipeJsonPaths);
  for (const src of rawRecipes) addRecipe(parameters, recipeBook, src);

  return sortMapInPlace(recipeBook);
}

// `FullRandomizer` and `Randomizer` could be functions, but written as classes for easier
// debugging.
class FullRandomizer {
  constructor(recipe) { this.recipe = recipe; }

  #apply(parameters, action) {
    const recursion = (prm, rnd) => {
      if (Array.isArray(prm) ^ Array.isArray(rnd)) {
        console.warn("Array length mismatch.", prm, rnd, new Error());
        return;
      }
      if (Array.isArray(prm) && Array.isArray(rnd)) {
        for (let i = 0; i < prm.length; ++i) recursion(prm[i], rnd[i]);
        return;
      }
      if (prm) action(prm, rnd);
    };
    for (const [key, randomizer] of this.recipe) recursion(parameters[key], randomizer);
  }

  randomize(parameters) { this.#apply(parameters, (prm, rnd) => prm.randomize(rnd.randomFunc)); }
  setParameters(parameters) { this.#apply(parameters, (prm, rnd) => rnd.setFunc(prm)); }
}

class Randomizer {
  // `key` isn't necessary but convenient to debug recursion.
  constructor(key, parameter, randomInfo) {
    this.key = key;
    const {setFunc, randomFunc} = this.#createFuncs(parameter, randomInfo);
    this.setFunc = setFunc;
    this.randomFunc = randomFunc;
  }

  #parseDisplayValue(val) {
    if (val === "-Infinity" || val === null) return -Infinity;
    return Number.isFinite(val) ? val : undefined;
  }

  #createFuncs(parameter, randomInfo) {
    const noop = () => {};
    const rnd = randomInfo.random;
    if (!parameter || rnd.type === "bypass") return {setFunc: noop, randomFunc: noop};

    let dMin = this.#parseDisplayValue(rnd.min);
    if (dMin === undefined) return {setFunc: noop, randomFunc: noop};

    const baseVal = dMin;
    const setFunc = (prm) => { prm.display = baseVal; };

    let dMax = this.#parseDisplayValue(rnd.max);
    if (dMax === undefined) return {setFunc, randomFunc: noop};
    if (dMin === dMax) return {setFunc, randomFunc: setFunc};
    if (dMin > dMax) [dMin, dMax] = [dMax, dMin];

    const nMin = parameter.displayToNormalized(dMin);
    const nDiff = parameter.displayToNormalized(dMax) - nMin;
    const randomFunc = (prm) => { prm.normalized = nMin + nDiff * Math.random(); };
    return {setFunc, randomFunc};
  }
}

function applyLocalRecipe(parameter, recipe) {
  if (typeof recipe === "function") {
    Parameter.isRandomizing = true;
    recipe(parameter);
    Parameter.isRandomizing = false;
    return;
  }

  // The rest is kept for backward compatibility.
  for (const [key, prm] of Object.entries(parameter)) {
    if (recipe.hasOwnProperty(key)) {
      if (Array.isArray(prm)) {
        const first = Array.isArray(prm[0]) ? prm[0][0] : prm[0];
        if (!first?.lockRandomization) recipe[key](prm);
      } else {
        prm.randomize(recipe[key]);
      }
    } else if (Array.isArray(prm)) {
      const randomizeRecursion = (item) => {
        if (Array.isArray(item)) {
          item.forEach(randomizeRecursion);
        } else if (item instanceof Parameter) {
          item.randomize((x) => { x.normalized = Math.random(); });
        }
      };
      prm.forEach(randomizeRecursion);
    } else if (prm.scale instanceof MenuItemScale) {
      // Do nothing if randomization is not specified in `recipe`.
    } else {
      prm.randomize((x) => { x.normalized = Math.random(); });
    }
  };
}

export function addLocalRecipes(localRecipeBook, recipeBook = new Map()) {
  for (const [key, recipe] of Object.entries(localRecipeBook)) {
    recipeBook.set(` - ${key}`, {randomize: (param) => applyLocalRecipe(param, recipe)});
  }
  return sortMapInPlace(recipeBook);
}

/**
 * Recursively captures all .dsp values as well as registered custom widget states.
 */
export function captureState(paramTree) {
  const snapshot = (node) => {
    if (Array.isArray(node)) return node.map(snapshot);
    if (node instanceof Parameter) return node.dsp;
    if (node !== null && typeof node === "object") {
      const dest = {};
      for (const key of Object.keys(node)) { dest[key] = snapshot(node[key]); }
      return dest;
    }
    return node;
  };

  const paramState = snapshot(paramTree);
  if (HistoryManager.customProviders && HistoryManager.customProviders.size > 0) {
    const customState = {};
    for (const [id, provider] of HistoryManager.customProviders) {
      customState[id] = provider.get();
    }
    return {__param: paramState, __custom: customState};
  }
  return paramState;
}

/**
 * Recursively restores .dsp values and registered custom widget states.
 */
export function restoreState(paramTree, stateTree) {
  const restore = (node, state) => {
    if (state === undefined) return;
    if (Array.isArray(node) && Array.isArray(state)) {
      for (let i = 0; i < Math.min(node.length, state.length); ++i) { restore(node[i], state[i]); }
    } else if (node instanceof Parameter) {
      node.dsp = state;
    } else if (node !== null && typeof node === "object" && typeof state === "object") {
      for (const key of Object.keys(state)) {
        if (key in node) restore(node[key], state[key]);
      }
    }
  };

  const isCompound = stateTree && typeof stateTree === "object" && "__param" in stateTree;
  const paramData = isCompound ? stateTree.__param : stateTree;
  const customData = isCompound ? stateTree.__custom : (stateTree?.__custom ?? {});

  restore(paramTree, paramData);

  if (HistoryManager.customProviders) {
    for (const [id, provider] of HistoryManager.customProviders) {
      if (customData && id in customData) {
        provider.set(customData[id]);
      } else if (provider.initialState !== undefined) {
        // Fallback to initial state if snapshot predates this widget's creation
        provider.set(provider.initialState);
      }
    }
  }
}

/**
 * Fast deep equality check for captured states to avoid redundant history entries.
 */
export function isStateEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; ++i) {
      if (!isStateEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (typeof a === "object" && typeof b === "object") {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
      if (!isStateEqual(a[key], b[key])) return false;
    }
    return true;
  }
  return false;
}

export class HistoryManager {
  static customProviders = new Map();
  #param;
  #entries = [];
  #currentIndex = -1;
  #maxEntries;
  #onRestore;
  #onUpdate;
  #gestureSnapshot = null;
  #gestureLabel = null;

  static registerCustom(id, provider) {
    provider.initialState = provider.get();
    HistoryManager.customProviders.set(id, provider);
  }

  constructor(param, options = {}) {
    this.#param = param;
    this.#maxEntries = options.maxEntries ?? 10000;
    this.#onRestore = options.onRestore ?? (() => {});
    this.#onUpdate = options.onUpdate ?? (() => {});

    Parameter.history = this;
    this.recordInitial("Initial State");
  }

  get canUndo() { return this.#currentIndex > 0; }
  get canRedo() { return this.#currentIndex < this.#entries.length - 1; }
  get currentIndex() { return this.#currentIndex; }
  get entries() { return this.#entries; }

  recordInitial(label = "Initial State") {
    const state = captureState(this.#param);
    this.#entries = [{label, state}];
    this.#currentIndex = 0;
    this.#onUpdate();
  }

  push(label) {
    const newState = captureState(this.#param);
    const current = this.#entries[this.#currentIndex]?.state;
    if (current && isStateEqual(current, newState)) return;

    if (this.#currentIndex < this.#entries.length - 1) {
      this.#entries = this.#entries.slice(0, this.#currentIndex + 1);
    }

    this.#entries.push({label, state: newState});
    if (this.#entries.length > this.#maxEntries) {
      this.#entries.shift();
    } else {
      this.#currentIndex++;
    }
    this.#onUpdate();
  }

  transaction(label, actionFunc) {
    const beforeState = captureState(this.#param);
    actionFunc();
    const afterState = captureState(this.#param);

    if (isStateEqual(beforeState, afterState)) return;

    if (this.#currentIndex < this.#entries.length - 1) {
      this.#entries = this.#entries.slice(0, this.#currentIndex + 1);
    }

    this.#entries.push({label, state: afterState});
    if (this.#entries.length > this.#maxEntries) {
      this.#entries.shift();
    } else {
      this.#currentIndex++;
    }
    this.#onUpdate();
  }

  beginGesture(label) {
    if (this.#gestureSnapshot === null) {
      this.#gestureSnapshot = captureState(this.#param);
      this.#gestureLabel = label;
    }
  }

  endGesture() {
    if (!this.#gestureSnapshot) return;
    const afterState = captureState(this.#param);

    if (!isStateEqual(this.#gestureSnapshot, afterState)) {
      if (this.#currentIndex < this.#entries.length - 1) {
        this.#entries = this.#entries.slice(0, this.#currentIndex + 1);
      }
      this.#entries.push({label: this.#gestureLabel, state: afterState});
      if (this.#entries.length > this.#maxEntries) {
        this.#entries.shift();
      } else {
        this.#currentIndex++;
      }
      this.#onUpdate();
    }

    this.#gestureSnapshot = null;
    this.#gestureLabel = null;
  }

  undo() {
    if (!this.canUndo) return;
    this.jumpTo(this.#currentIndex - 1);
  }

  redo() {
    if (!this.canRedo) return;
    this.jumpTo(this.#currentIndex + 1);
  }

  jumpTo(index) {
    if (index < 0 || index >= this.#entries.length || index === this.#currentIndex) return;
    this.#currentIndex = index;
    restoreState(this.#param, this.#entries[index].state);
    this.#onRestore(this.#entries[index].state);
    this.#onUpdate();
  }

  setOnRestore(callback) { this.#onRestore = callback; }
  setOnUpdate(callback) { this.#onUpdate = callback; }
}
