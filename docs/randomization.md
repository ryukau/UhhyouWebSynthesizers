# Randomization
This text provides information about how to add randomization recipes.

There are 2 kinds of recipes:

- [JSON](https://www.json.org) file.
- JavaScript recipe.

JSON recipe is easier to edit. Export button saves current parameter states as a JSON recipe.

JavaScript recipe is more flexible. However, it requires to modify source code.

## JSON Recipe
A JSON recipe can be obtained from Export button. Below is an example of the format.

```javascript
{
  "meta": {
    "author": "Tux",
    "recipeName": "Boot Up",
    "version": 0
  },
  "parameters": {
    "singleParameter": {
      "info"  : {"min": 0.01              , "max": 100                                 },
      "random": {"min": 0.3333333333333333, "max": 0.3333333333333333, "type": "bypass"}
    },
    "arrayParameter": [
      {
        "info"  : {"comment": "x1", "min": 0.0, "max": 1.0                   },
        "random": {                 "min": 0.6, "max": 0.6, "type": "display"}
      },
      {
        "info"  : {"comment": "y1", "min": 0.0, "max": 1.0                   },
        "random": {                 "min": 0.4, "max": 0.4, "type": "display"}
      }
    ],
  }
}
```

Below is a list of the properties used for a randomization. Other values are there for convenience.

- `meta.author`
- `meta.recipeName`
- `parameters.**.random.min`
- `parameters.**.random.max`
- `parameters.**.random.type` (optional, `bypass` or `display`)

To edit JSON recipes, [FracturedJson](https://j-brooke.github.io/FracturedJson/) might be useful. FracturedJson can vertically aligns properties which makes it easier to skim. [VS Code extension](https://marketplace.visualstudio.com/items?itemName=j-brooke.fracturedjsonvsc) is also available.

The rest of this section is references for each properties.

### `meta`
`meta` section has 3 keys:

- `meta.author` is the author of a recipe.
- `meta.recipeName` is the name of a recipe.
- `meta.version` is the version of a synthesizer.

`author` is used for namespaceing. So it's better to put an unique string here. Consequentially, it's okay to put generic name as a `recipeName`. Those 2 values are intended to make nested menus.

### `parameters`
There are 2 kinds of parameters:

- Single value parameter.
- Array of parameters.

#### Single Value Parameter
A single value parameter has following properties.

```json
{
  "info"  : {"min": 0.01              , "max": 100                                 },
  "random": {"min": 0.3333333333333333, "max": 0.3333333333333333, "type": "bypass"}
}
```

`info` is parameter information. It's provided for convenience and doesn't affect randomization.

- `info.comment` may be available on some parameters to provide a context. It's omitted for most parameters.
- `info.min` is minimum value of a parameter.
- `info.max` is maximum value of a parameter.

`random` contains the values used for a randomization.

- `random.min` is lower bound of a randomization.
- `random.max` is upper bound of a randomization.
- `random.type` can be following values:
  - `bypass`: Randomization doesn't change the parameter. `min` and `max` are ignored.
  - `display`: Randomization uses display scaling, that is the scaling used for GUI.

#### Array of Parameters
An array of parameters consists from single value parameters. The array may be nested to represent 2D or higher dimensional data.

## JavaScript Recipe
JavaScrip recipes for a synthesizer are written in `<Synth>//main.js`. They mostly exists for my convenience, but also allows more flexible randomization compared to JSON recipes.

Recipe data is written as `localRecipeBook` object that looks like following.

```javascript
const localRecipeBook = {
  "Default": {
    renderDuration:
      (prm) => { prm.dsp = util.uniformDistributionMap(Math.random(), 0.1, 0.8); },
    fadeIn: () => {},
    fadeOut: () => {},
    decayTo: (prm) => { prm.ui = util.uniformDistributionMap(Math.random(), -40, 0); },
    overSample: () => {},
    sampleRateScaler: () => {},
    baseFreq: (prm) => { prm.dsp = util.uniformDistributionMap(Math.random(), 10, 90); },
  },
};
```

Top level keys are recipe names. In above example, there is 1 recipe which name is `"Default"`.

Second level keys are paremeter names. Parameter names are defined in `param` variable in `main.js`. To find it, search with `const param`.

Second level values are random functions. In above example there are:

- Empty functions that do nothing. `() => {}`
- Functions that takes `prm` as an argument. `(prm) => { /* assignment to prm */ }`

Empty functions are used to bypass the randimization. In other words, the value set by user won't be changed even when Random button is clicked.

Functions that takes `prm` is used for randomization. `prm` may be a single value parameter or an array of parameters. For a single value parameter, `prm` is an instance of `Parameter` class defined in `common/parameter.js`. For an array of parameters, `prm` is an `Array` of `Parameter` instances. Note that the array might be nested to represent 2D or higher dimensional data.

To see what's comming in as `prm`, `console.log` may be used:

```javascript
(prm) => { console.log(prm); },
```

The output of `console.log` will show up in the developer console of your web browser as shown in the image below.

![An image of a result of `console.log(prm)` showing up in developer console of Safari.`](img/randomization/console_log_of_prm.png)

### About `Parameter` Class
`Parameter` class is defined in `common/parameter.js`. It has 4 inputs of a parameter value.

- `display`: This value is what you see on GUI.
- `dsp`: Used in DSP code.
- `ui`: May be used to display the value for GUI.
- `normalized`: Only internally used.

These different representation are used for conversions like:

- Amplitude <-> Decibel.
- Frequency <-> MIDI notes.

They are also used for more parameter specific scalings. For example, feedback of delay is typically using some unusual scaling. For more detailed documentation, see "Parameter Scaling" section in `docs/code_walkthrough.md`.

To get the value range of a parameter, following properties are available:

| Type         | Min            | Max            |
| ------------ | -------------- | -------------- |
| `display`    | `minDisplay`   | `maxDisplay`   |
| `dsp`        | `scale.minDsp` | `scale.maxDsp` |
| `ui`         | `scale.minUi`  | `scale.maxUi`  |
| `normalized` | `0.0`          | `1.0`          |

For example, `prm.scale.minDsp` returns the minimum DSP value of a parameter. The range of `normalized` value is always in `[0.0, 1.0]`.

### Example Random Function
For most cases, I'd recommend to assign a random value to `prm.display` like below.

```javascript
(prm) => { prm.display = someRandomFunction(); },
```

Another easy one is `prm.normalized`, because the value range is fixed to `[0.0, 1.0]`.

```javascript
(prm) => { prm.normalized = Math.random(); /* Full range randomization. */ },
```

To use `prm.dsp` and `prm.ui`, it's probably better to read `param` in `<Synth>/main.js`, and `*Scale` classed in `common/parameter.js`.
