# Randomization
- **2024-01-24: This text is outdated. It will be updated. Don't read this.**

This text provides information about how to add randomization recipes.

It requires to setup development environment. See ["How to Use without Internet"](https://github.com/ryukau/UhhyouWebSynthesizers#how-to-use-without-internet) section in top level `README.md`. You also need a text editor to write some JavaScript.

## Adding A New Recipe
**Note**: Some old synths are in `oldsynth` directory, and the steps in this text don't exactly work for them. I'd recommend not to spend time on old synths code, but if you really need some information, feel free to contact me.

If you prefer to just read the code, following 2 files might be better examples.

- `FDNReverb/main.js` : A smaller example.
- `TechnoSnare/main.js` : More comprehensive.

### Open Relevant Code
1. Open `UhhyouWebSynthesizer` directory.
2. Open directory of a synthesizer you want to add a recipe.
3. Open `main.js`.

`main.js` is the only file that needs editing.

### Add Recipe Name
Add the name of recipe to `selectRandom` in `main.js`.

`selectRandom` looks like following.

```javascript
const selectRandom = widget.select(
  divPlayControl, "Randomize Recipe", "randomRecipe", undefined, ["Default"], "Default",
  (ev) => { randomize(); });
```

To find `selectRandom`, use search functionality of your text editor. Shortcut for search is probably <kbd>Ctrl</kbd> + <kbd>f</kbd>. Or maybe <kbd>/</kbd> or <kbd>Ctrl</kbd> + <kbd>s</kbd>.

After adding a recipe, it will look like following. `"🌞A New Recipe🌞"` is added.

```javascript
const selectRandom = widget.select(
  divPlayControl, "Randomize Recipe", "randomRecipe", undefined,
  ["Default", "🌞A New Recipe🌞"], "Default", (ev) => { randomize(); });
```

**Info**: In this repository, `clang-format` is used to automatically format the code.

### Add Recipe Branch
Go to `randomize()` function. It's probably writtein near the top of `main.js`.

`randomize()` looks like following.

```javascript
function randomize() {
  for (const key in param) {
    if (key === "renderDuration") continue;
    if (key === "matrixSize") continue;
    if (key === "fadeOut") continue;

    if (Array.isArray(param[key])) {
      param[key].forEach(e => { e.normalized = Math.random(); });
    } else if (param[key].scale instanceof parameter.MenuItemScale) {
      // Do nothing for now.
    } else {
      param[key].normalized = Math.random();
    }
  }

  render();
  widget.refresh(ui);
}
```

First thing is to add a branch to your recipe. Some synths already have branching.

```javascript
function randomize() {
  if (selectRandom.value === "🌞A New Recipe🌞") {
    // This branch is added.
    // ☂️
  } else {
    for (const key in param) {
      if (key === "renderDuration") continue;
      if (key === "matrixSize") continue;
      if (key === "fadeOut") continue;

      if (Array.isArray(param[key])) {
        param[key].forEach(e => { e.normalized = Math.random(); });
      } else if (param[key].scale instanceof parameter.MenuItemScale) {
        // Do nothing for now.
      } else {
        param[key].normalized = Math.random();
      }
    }
  }

  render();
  widget.refresh(ui);
}
```

### About Parameters
Parameters are defined in `param` object. `param` look like following.

```javascript
const param = {
  renderDuration: new parameter.Parameter(1, scales.renderDuration, true),
  fadeOut: new parameter.Parameter(0.002, scales.fade, true),
  overSample: new parameter.Parameter(1, scales.overSample),

  delayTime: createArrayParameters(0.01, scales.delayTime),
};
```

For example, to access `renderDuration` parameter in new recipe branch, you can call `param["renderDuration"]`.

Some parameters are in `Array`, and those array parameters are the ones not calling `new parameter.Parameter()`.

A parameter has 3 different values to represent single quantity.

- Raw value. (`param[key].dsp`)
- Display value. (`param[key].display`)
- Normalized value. (`param[key].normalized`)

Normalized value is the easiest to use for randomization because the range is always in `[0, 1]`. Raw value is used in renderer. Most of the parameters are displaying raw value. If the unit of parameter is decibel (dB), then display value is likely used.

**Info**: For reason behind different values in a single parameter, take a look at ["Parameter Scaling"](https://github.com/ryukau/UhhyouWebSynthesizers/blob/main/docs/code_walkthrough.md#parameter-scaling) section in `docs/code_walkthrough.md`.

### Write A Recipe
Following text only considers the inside of new recipe branch, that is where `☂️` comment is written in above snippet.

#### Enable Full Randomization
Copy following code into your recipe. The code randomize all parameters, except the ones in ComboBox.

```javascript
for (const key in param) {
  // Write individual parameter randomization here.
  // 🌵
}

if (Array.isArray(param[key])) {
  param[key].forEach(e => { e.normalized = Math.random(); });
} else if (param[key].scale instanceof parameter.MenuItemScale) {
  // Do nothing for now.
} else {
  param[key].normalized = Math.random();
}
```

Following sections only considers the scope where `🌵` comment is written.

**Aside**: I'm pretty sure that copy-pasting above code for every recipe is a bad idea. May be changed in later version.

#### Skip Randomization
To skip randomization, `continue` is used.

```javascript
if (key === "renderDuration") continue;
```

#### Assign Randomized Value
To randomize a value something like following can be used.

```javascript
if (key === "renderDuration") {
  param[key].normalized = Math.random();
  continue;
}
```

To narrow randomization range for normalized value, use `util.uniformDistributionMap()`.

```javascript
if (key === "renderDuration") {
  // Narrowing range to [0.5, 0.8).
  param[key].normalized = util.uniformDistributionMap(Math.random(), 0.5, 0.8);
  continue;
}
```

For raw values, other distribution might be useful.

- `util.uniformIntDistributionMap()` always outputs integers.
- `util.exponentialMap()` may sound better for amplitude and frequencies.

**Info**: Other distributions are available on `common/util.js`.

#### Bounding or Clamping
Sometimes you want to get the bound of a parameter value.

A parameter is always defined with a scale, like `scales.renderDuration` in below.

```javascript
const param = {
  renderDuration: new parameter.Parameter(0.5, scales.renderDuration, true),
};
```

A scale has following methods.

- `minDsp()`
- `maxDsp()`
- `minUi()`
- `maxUi()`

`*Dsp()` provides bounds of a raw value. `*Ui()` provides bounds of a display value.

So if you want to randomize the entire range of a parameter with normal distribution, the code looks like following.

```javascript
if (key === "renderDuration") {
  const min = scales.renderDuration.minDsp();
  const max = scales.renderDuration.minDsp();
  const center = (max + min) / 2;
  const range = (max - min) / 6; // See info below for the reason of 6.
  const value
    = util.normalDistributionMap(Math.random(), Math.random(), center, range);
  param[key].dsp = util.clamp(value, min, max);
  continue;
}
```

**Info**: On normal distribution, 99.7% of the value falls between -3 sigma and +3 sigma ([68–95–99.7 rule](https://en.wikipedia.org/wiki/68%E2%80%9395%E2%80%9399.7_rule)).
