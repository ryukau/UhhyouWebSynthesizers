# Code Walkthrough
This document provides an overview of code structure, so to reduce the time to figure out where to read.

For simple things, using search tools is probably faster than reading this text. [`rg`](https://github.com/BurntSushi/ripgrep), [`fd`](https://github.com/sharkdp/fd), and [`fzf`](https://github.com/junegunn/fzf) are example of search tools. I personally use [VS Code's built in search box](https://code.visualstudio.com/docs/editor/codebasics#_search-across-files).

## Directory Structure
Directories start with a capital letter are synthesizers. Below is a list of directories that starts with a small letter.

- `common`: Common components used across synthesizers.
- `docs`: Documentations.
- `lib`: External libraries.
- `oldsynth`: Old web synthesizers written without using components in `common` directory.
- `style`: Style related things like CSS and fonts.

## Structure of a Synthesizer
A synthesizer always have following files:

- `synth.html`: The entry point, and it doesn't do anything other than loading CSS and `main.js`.
- `main.js`: First JavsScript to be loaded. It mostly contains GUI definitions.
- `renderer.js`: DSP part. Loaded as Web Worker.

`FDNReverb` might be a good example because the code is relatively short.

### Audio File Handling
See `common/wave.js`.

### Parameter Scaling
See `Parameter` class in `common/parameter.js`.

A parameter has 3 different representations:

- Raw value.
- Display value.
- Normalized value. Used in GUI, but only internally.

Why not use raw value everywhere? That's because sometimes human perception differs from machine representation. [Sound pressure level](https://en.wikipedia.org/wiki/Sound_pressure#Sound_pressure_level) is an example of this problem, as decibel approximates human perception of loudness better than raw amplitude. So there must be an scaling mechanism to represent a same value in different ways.

Raw value is used in DSP. They are refered as "DSP values" or `*.dsp` in code. For example, -20 dB becomes 0.1 on raw value.

Display value is used in GUI. This is what human reads.

Normalized value is used for `<input type="range">`, and other slider type controls. A slider holds a normalized value to determine where to put a handle.

- If a slider is moved, it converts a normalized value to a display value for GUI (mostly for `<input type="number">`), and converts to a raw value for DSP.
- If a value is changed from `<input type="number">`, then a slider receives a display value, and converts it to a normalized value.
- If a value is changed from DSP, then a slider receives a raw value, and converts it to a normalized value. (**Note**: UhhyouWebSynthesizers doesn't have this feature, but audio plugins sometimes deal with this case.)

### Randomization
`loadJson` function in `common/parameter.js` might be a nice starting point.

This section is about internals of randomiztion. User manual is separately available on `docs/randomization.md`.

A set of randomiztion for all parameters is called "recipe" in this repository. There are 2 kinds of recipe:

- JSON recipe.
- JavaScript recipe.

There are 2 sources of recipe:

- Local recipe, or preset.
- User recipe.

All the randomiztion codes can be traced from `<Synth>/main.js`. Recipe data processings are written in `common/parameter.js`. Recipe related GUI components are written in `common/gui/widget.js`.

#### Recipe Components in `<Synth>/main.js`
`widget.playControl` takes lambda functions related to randomization and recipe import and export.

`recipeBook` holds all the recipes including the ones that are imported, and the ones temporarily pushed by Push button.

`localRecipeJsonPath` and `localRecipeBook` are the presets. `docs/randomization.md` provides the details of `localRecipeBook`.

`recipeExportDialog` and `recipeImportDialog` creates modal dialog for recipe import and recipe export.

#### `FullRandomizer` Data Format
This is more complicated than I expected, so the rationales are documented.

`FullRandomizer` and `Randomizer` are internal helper classes defined in `common/parameter.js`. They are responsible to apply JSON recipes to parameters.

`FullRandomizer.recipe` property has following data structure.

```javascript
randomizationRecipes = {
  "author0 - recipe0": {
    parameter0: randomizer0,
    parameter1: randomizer1,
    parameter2: [randomizer2_0, randomizer2_1, /* ... */],
    parameter3: [
      [randomizer3_0_0, randomizer3_0_1, /* ... */],
      [randomizer3_1_0, randomizer3_1_1, /* ... */], // ...
    ], // ...
  }, // ...
};
```

This structure is used because of parameter lock functionality. At first, I considered to check if the parameter is locked or not inside of a `Randomizer.randomFunc`, like below:

```javascript
(prm) => {
  if (this.lockRandomization) return;
  prm.display = someRandom();
}
```

This is error prone because it's possible to forget the check when adding new randomizations It's better if it can be written like below:

```javascript
(prm) => {
  prm.display = someRandom();
};
```

To do this, `Parameter.randomize` method is added to `Parameter` class in `common/parameter.js`. It looks like below:

```javascript
randomize(randomFunc) {
  if (!this.lockRandomization) randomFunc(this);
}
```

and it's called like below:

```javascript
prm.randomize(rnd.randomFunc);
```

where `prm` is an instance of `Parameter`, and `rnd` is an instance of `Randomizer`. `rnd.randomFunc` is the lambda described above, that is `(prm) => { /* ... */}`.

`recursion` lambda in `FullRandomizer.randomize` method is calling `Parameter.randomize`. Recursion is there to handle multi-dimensional arrays.

There's an issue that local recipe for array of parameters doesn't follow this style. `applyLocalRecipe` function in `common/parameter.js` has following part:

```javascript
if (Array.isArray(prm)) {
  // This is a bad hack.
  if (!prm[0].lockRandomization) recipe[key](prm);
}
```

It's a bad hack because `lockRandomization` is leaking outside of `Parameter`. However, all the local JavaScript recipes have to be rewritten in order to fix the leak. I don't think it's worth the effor, so they are staying as is, for now.

### Old Synth
Synthesizers in `oldsynth` are written in entirely different style. I've never thought I make this much synthesizers, so their structures are pretty dirty when it comes to code reusing. Duplications are everywhere, and they might subtly differ to each other.

I'd recommend to avoid spending time in `oldsynth` directory unless you really want to modify one of them.

GUI is mostly defined in `index.js`, and GUI widgets are likely comes from `canvas.js`. Some relatively newer synths have `renderer.js` and that contains DSP code. Older ones don't even have `renderer.js`, and DSP is clammed into `index.js`.

### Concerns or Possible Changes
There are some reserved parameter names as a result of dirty hack. See `Audio.render()` in `common/wave.js`.

`*Delay` classes in `common/dsp/delay.js` takes seconds for constructor, but samples for `setTime` method. It's better to use samples to represent time in DSP.

## Aims
UhhyouWebSynthesizers are mostly about experimentation. So the code aims to produce prototypes as fast as possible.

I'm trying to maximize code reuse on GUI. This is because I know internals and don't need visualization.

On DSP, duplication with subtle difference is allowed for fine tuning. For example, it's better to reimplement feedback comb if components on the feedback path interact with the feedback signal.

Providing escape hatch is important. Most ideas aren't great. So it's better to write quick dirty code to check if it's worth pursuing before committing to write better structured code.
