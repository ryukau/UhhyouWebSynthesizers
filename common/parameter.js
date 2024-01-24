// Copyright 2022 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

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

/**
`Parameter` provides different representations of a same value. DSP value is considered as
ground truth of current state.
*/
export class Parameter {
  #raw; // DSP value.

  constructor(defaultDsp, scale, displayDsp = false, comment = "") {
    console.assert(defaultDsp >= scale.minDsp, new Error());
    console.assert(defaultDsp <= scale.maxDsp, new Error());

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

  uiToDsp(x) { return this.scale.toDsp(x); }
  dspToUi(x) { return this.scale.toUi(x); }

  uiToNormalized(x) {
    if (this.scale.maxUi === this.scale.minUi) return this.scale.minUi;
    return (x - this.scale.minUi) / (this.scale.maxUi - this.scale.minUi);
  }
  normalizedToUi(x) {
    return this.scale.minUi + (this.scale.maxUi - this.scale.minUi) * util.clamp(x, 0, 1);
  }
  dspToNormalized(x) {
    if (this.scale.maxDsp === this.scale.minDsp) return this.scale.minDsp;
    return (x - this.scale.minDsp) / (this.scale.maxDsp - this.scale.minDsp);
  }
  normalizedToDsp(x) {
    return this.scale.minDsp
      + (this.scale.maxDsp - this.scale.minDsp) * util.clamp(x, 0, 1);
  }
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

  get minUi() { return -this.scale.maxDB; }
  get maxUi() { return -this.scale.minDB; }

  get minDsp() { return this.offset - this.scale.maxAmp; }
  get maxDsp() { return this.offset - this.scale.minAmp; }

  toDsp(negativeDB) { return this.offset - this.offset * this.scale.toDsp(-negativeDB); }
  toUi(amplitude) { return 1 - this.scale.toUi(this.offset - amplitude); }
}

// Similar to DecibelScale, but can have negative values when normalized value is below
// 0.5.
//
// - When normalized value is in 0.5, `toDsp()` outputs 0.
// - Same range is used for positive and negative values.
//
// This scale is added for FM or PM amount.
export class BipolarExponentialScale {
  #center = 0.5;

  constructor(positiveMinValue, positiveMaxValue) {
    console.assert(
      Number.isFinite(positiveMinValue) && positiveMinValue > 0, new Error());
    console.assert(
      Number.isFinite(positiveMaxValue) && positiveMaxValue > 0, new Error());

    this.minValue = positiveMinValue;
    this.maxValue = positiveMaxValue;

    this.minExp = Math.log(positiveMinValue);
    this.diffExp = Math.log(positiveMaxValue) - this.minExp;

    this.upperRangeStart = this.#center * (1 + Number.EPSILON);
    this.lowerRangeEnd = this.#center * (1 - Number.EPSILON);
  }

  get minUi() { return 0; }
  get maxUi() { return 1; }

  get minDsp() { return -this.maxValue; }
  get maxDsp() { return this.maxValue; }

  toDsp(normalized) {
    if (normalized >= this.upperRangeStart) {
      const ratio = (normalized - this.upperRangeStart) / (1 - this.upperRangeStart);
      return Math.exp(ratio * this.diffExp + this.minExp);
    } else if (normalized <= this.lowerRangeEnd) {
      const ratio = 1 - normalized / this.lowerRangeEnd;
      return -Math.exp(ratio * this.diffExp + this.minExp);
    }
    return 0;
  }

  toUi(amplitude) {
    if (amplitude > 0) {
      const value = (Math.log(amplitude) - this.minExp) / this.diffExp;
      return value * (1 - this.upperRangeStart) + this.upperRangeStart;
    } else if (amplitude < 0) {
      const value = (Math.log(-amplitude) - this.minExp) / this.diffExp;
      return (1 - value) * this.lowerRangeEnd;
    }
    return this.#center;
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
export function dumpJsonObject(param, version, options) {
  // Handle options.
  const fullRange = options.fullRange === true;
  const author = options.author !== undefined ? `${options.author}` : "";
  const recipeName = options.recipeName !== undefined
    ? `${options.recipeName}`
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

export function dumpJsonString(param, version, options) {
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
    if (typeof prm.comment === "string" && prm.comment.length > 0) {
      info.comment = prm.comment;
    }
    info.min = prm.minDisplay;
    info.max = prm.maxDisplay;
    obj.info = info;
  }

  {
    let random = {};
    if (fullRange) {
      random.min = prm.minDisplay;
      random.max = prm.maxDisplay;
    } else {
      random.min = prm.display;
      random.max = prm.display;
    }
    random.type = "display"; // Add more type as required.
    obj.random = random;
  }

  return obj;
};

function addRecipeRecursion(recipeName, key, parameter, randomInfo) {
  if (Array.isArray(parameter) && !Array.isArray(randomInfo)) {
    console.warn(
      `Recipe "${recipeName}" doesn't specify array for array parameter "${key}".`,
      new Error());
  } else if (!Array.isArray(parameter) && Array.isArray(randomInfo)) {
    console.warn(
      `Recipe "${recipeName}" specifies array for non-array parameter "${key}".`,
      new Error());
  }

  if (Array.isArray(parameter) && Array.isArray(randomInfo)) {
    if (parameter.length !== randomInfo.length) {
      console.warn(`Array length mismatch on "${key}".`);
    }
    return parameter.map((item, idx) => {
      return addRecipeRecursion(recipeName, `${key}_${idx}`, item, randomInfo[idx]);
    });
  }

  return new Randomizer(key, parameter, randomInfo);
}

export function addRecipe(parameters, recipeBook, newRecipe) {
  const name = `${newRecipe.meta.author} - ${newRecipe.meta.recipeName}`;
  if (recipeBook.has(name)) {
    console.warn(`Recipe name conflict on "${name}". Set unique author.`);
    return;
  }

  let dest = new Map();
  for (const [key, randomInfo] of Object.entries(newRecipe.parameters)) {
    dest.set(key, addRecipeRecursion(name, key, parameters[key], randomInfo));
  }
  recipeBook.set(name, new FullRandomizer(dest));

  return name;
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
export async function loadJson(parameters, recipeJsonPaths) {
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
  let recipeBook = new Map();
  for (const src of rawRecipes) addRecipe(parameters, recipeBook, src);

  return new Map([...recipeBook.entries()].sort()); // Sort by key.
}

// `FullRandomizer` and `Randomizer` could be function, but written as a class for easier
// debugging.
class FullRandomizer {
  constructor(recipe) { this.recipe = recipe; }

  randomize(parameters) {
    const recursion = (prm, rnd) => {
      if (Array.isArray(prm) ^ Array.isArray(rnd)) {
        console.warn("Array length mismatch.", prm, rnd, new Error());
        return;
      }
      if (Array.isArray(prm) && Array.isArray(rnd)) {
        for (let i = 0; i < prm.length; ++i) recursion(prm[i], rnd[i]);
        return;
      };
      prm.randomize(rnd.randomFunc);
    };
    for (let [key, randomizer] of this.recipe) recursion(parameters[key], randomizer);
  }
}

class Randomizer {
  // `key` isn't necessary but convenient to debug recursion.
  constructor(key, parameter, randomInfo) {
    this.key = key;
    this.randomFunc = this.#getRandomFunc(parameter, randomInfo);
  }

  #getRandomFunc(parameter, randomInfo) {
    const rnd = randomInfo.random;
    if (rnd.type === "bypass") return () => {};

    // The rest is a branch for `rnd.type === "display"`.
    // `d*` for display value, `n*` for normalized value.
    let dMin = rnd.min;
    let dMax = rnd.max;
    if (!Number.isFinite(dMin) || !Number.isFinite(dMax)) return () => {};
    if (dMin === dMax) return (prm) => { prm.display = dMin; };
    if (dMin > dMax) [dMin, dMax] = [dMax, dMin];

    const nMin = parameter.displayToNormalized(dMin);
    const nMax = parameter.displayToNormalized(dMax) - nMin;
    return (prm) => { prm.normalized = nMin + nMax * Math.random(); };
  }
}

function applyLocalRecipe(parameter, recipe) {
  for (const [key, prm] of Object.entries(parameter)) {
    if (recipe.hasOwnProperty(key)) {
      if (Array.isArray(prm)) {
        // This is a bad hack.
        if (!prm[0].lockRandomization) recipe[key](prm);
      } else {
        prm.randomize(recipe[key]);
      }
    } else if (Array.isArray(prm)) {
      prm.forEach(item => item.randomize((x) => { x.normalized = Math.random(); }));
    } else if (prm.scale instanceof MenuItemScale) {
      // Do nothing if randomization is not specified in `recipe`.
    } else {
      prm.randomize((x) => { x.normalized = Math.random(); });
    }
  };
}

export function addLocalRecipes(source, target) {
  let tgt = new Map(target); // Don't mutate original.
  for (const [key, recipe] of Object.entries(source)) {
    tgt.set(` - ${key}`, {randomize: (param) => applyLocalRecipe(param, recipe)});
  }
  return new Map([...tgt.entries()].sort()); // Sort by key.
}
