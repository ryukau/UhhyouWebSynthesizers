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

To make a new randomization, change the properties listed below.

- `meta.author`
  - `author`
  - `recipeName`
- `parameters.**.random`
  - `min`
  - `max`
  - `type` (`bypass` or `display`)

To edit JSON recipes, [FracturedJson](https://j-brooke.github.io/FracturedJson/) might be useful. FracturedJson can vertically align properties which makes it easier to skim. [VS Code extension](https://marketplace.visualstudio.com/items?itemName=j-brooke.fracturedjsonvsc) is also available.

The rest of this section is references for all properties in JSON recipe.

### `meta`
`meta` section has 3 keys:

- `meta.author` is the author of a recipe.
- `meta.recipeName` is the name of a recipe.
- `meta.version` is the version of a synthesizer.

`author` and `recipeName` are intended to make nested menus. (**TODO**: Change to use HTML `optgroup` tag.)

`author` is used for namespaceing. So it's better to put an unique string. On the other hand, it's okay to use generic names like "Bass Drum" as a `recipeName`.

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
JavaScrip recipes for a synthesizer are written in `<Synth>/main.js`. They mostly exists for convenience, but also allows more flexible randomization compared to JSON recipes.

Recipe data is written as `localRecipeBook` object that looks like following.

```javascript
const localRecipeBook = {
  "Default": (param) => {
    param.renderDuration.resetToDefault();
    param.matrixSize.resetToDefault();
    param.fadeOut.resetToDefault();
    param.lowpassCutoffHz.forEach(p => p.resetToDefault());
    param.highpassCutoffHz.forEach(p => p.resetToDefault());

    param.delayTime.forEach(e => { e.dsp = 0.01 + 0.01 * Math.random() - 0.005; });
  },
};
```

Top level keys are recipe names. In above example, there is 1 recipe which name is `"Default"`. It holds a lambda that takes the same `param` defined in the `main.js`.

To see what's comming in as `param`, `console.log` may be used:

```javascript
(param) => { console.log(param); },
```

### About `Parameter` Class
`Parameter` class is defined in `common/parameter.js`. It has 4 inputs of a parameter value.

- `display`: This value is what you see on GUI.
- `dsp`: Used in DSP code.
- `ui`: May be used to display the value for GUI.
- `normalized`: Only internally used.

Those different representations are used for conversions like:

- Amplitude <-> Decibel.
- Frequency <-> MIDI notes.

They are also used for more parameter specific scalings. For example, feedback of delay is typically using some unusual scaling. For more detailed documentation, see "Parameter Scaling" section in `docs/code_walkthrough.md`.

To get the value range of a parameter, following properties are available on `Parameter` class:

| Type         | Min            | Max            |
|--------------|----------------|----------------|
| `display`    | `minDisplay`   | `maxDisplay`   |
| `dsp`        | `scale.minDsp` | `scale.maxDsp` |
| `ui`         | `scale.minUi`  | `scale.maxUi`  |
| `normalized` | `0.0`          | `1.0`          |

For example, `Parameter.scale.minDsp` returns the minimum DSP value of a parameter. The range of `normalized` value is always in `[0.0, 1.0]`.

### Example Random Function
In this section, `gain` is used as an example parameter name.

For most cases, I'd recommend to assign a random value to `Parameter.display` like below.

```javascript
param.gain.display = someRandomFunction();
```

Another easy one is `Parameter.normalized`, because the value range is fixed to `[0.0, 1.0]`.

```javascript
param.gain.normalized = Math.random(); /* Almost full range randomization (never sets 1.0). */
```

To use `Parameter.dsp` and `Parameter.ui`, it's probably better to read `param` in `<Synth>/main.js`, and `*Scale` classes in `common/parameter.js`.
