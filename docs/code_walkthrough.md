# Code Walkthrough
This document provides an overview of code structure, so to reduce the time to figure out where to read.

For simple things, using search tools is probably faster than reading this text. [`rg`](https://github.com/BurntSushi/ripgrep), [`fd`](https://github.com/sharkdp/fd), and [`fzf`](https://github.com/junegunn/fzf) are example of search tools. I personally use [VS Code's built in search box](https://code.visualstudio.com/docs/editor/codebasics#_search-across-files).

## Directory Structure
Directories start with capital letter are synthesizers. Below is a list of directories that starts with small letters.

- `common`: Common components used across synthesizers.
- `docs`: Documentations.
- `lib`: External libraries.
- `oldsynth`: Old web synthesizers written without using components in `common` directory.
- `style`: Style related things like CSS and fonts.

### Old Synth
Synthesizers in `oldsynth` are written in entirely different style. I've never thought I make this much synthesizers, so their structures are pretty dirty when it comes to code reusing. Duplications are everywhere, and they might subtly differ to each other.

I'd recommend to avoid spending time in `oldsynth` directory unless you really want to modify one of them.

GUI is mostly defined in `index.js`, and GUI widgets are likely comes from `canvas.js`. Some relatively newer synths have `renderer.js` and that contains DSP code. Older ones don't even have `renderer.js`, and DSP is clammed into `index.js`.

## Structure of a Synthesizer
A synthesizer always have following files:

- `synth.html`: The entry point, and it doesn't do anything other than loading CSS and `main.js`.
- `main.js`: First JavsScript to be loaded. It mostly contains GUI definitions.
- `renderer.js`: DSP part. Loaded as Web Worker.

These 3 files are also found in all other synthesizers. `FDNReverb` might be a good example because the code is relatively short.

### Audio File Handling
See `common/wave.js`.

### Parameter Scaling
A parameter has 3 different representations:

- Raw value.
- Display value.
- Normalized value. Used in GUI, but only internally.

Why not use raw value everywhere? Well, that's because sometimes human perception differs from machine representation. [Sound pressure level](https://en.wikipedia.org/wiki/Sound_pressure#Sound_pressure_level) is an example of this problem, as decibel approximates human perception of loudness better than raw amplitude. So there must be an scaling mechanism to represent a same value in different ways.

Raw value is used in DSP. They are refered as "DSP values" or `*.dsp` in codes. For example, -20 dB becomes 0.1 on raw value.

Display value is used in GUI. This is what human reads.

Normalized value is used for `<input type="range">`, and other slider type controls. A slider holds a normalized value for where to put a handle.

- If a slider is moved, it converts the normalized value to display value for GUI (mostly for `<input type="number">`), and converts to raw value for DSP.
- If the value is changed from `<input type="number">`, then a slider receives display value, and converts it to normalized value.
- If the value is changed from DSP, then a slider receives raw value, and converts it to normalized value. (**Note**: UhhyouWebSynthesizers doesn't have this feature, but audio plugins sometimes deal with this case.)

## Aims
UhhyouWebSynthesizers is mostly about experimentation. So the code aims to produce prototypes as fast as possible.

I'm trying to maximize code reuse on GUI. This is because I know internals and don't need visualization.

On DSP, duplication with subtle difference is allowed for fine tuning. For example, it's better to reimplement feedback comb if components on feedback path interact with feedback signal.

Providing escape hatch is important. Most ideas aren't great. So it's better to write quick dirty code to check if it's worth pursuing before committing to write better structured code.

### Concerns or Possible Changes
There's some GUI boilerplate in `main.js`

GUI can't receive values from DSP. This can be problematic as currently there's no way to put `smpl` or `cue` points on WAVE file from DSP side.

There are some reserved parameter names as a result of dirty hack. See `Audio.render()` in `common/wave.js`.
