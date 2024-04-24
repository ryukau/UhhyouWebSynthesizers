# UhhyouWebSynthesizers
A collection of WAVE file generators run on browser.

- [Index Page](https://ryukau.github.io/UhhyouWebSynthesizers/)

Generators in this collection output WAVE file. These files are intended to be used on external DAW or sampler. For real-time effects and synthesizers, take a look at [my plugin repository](https://github.com/ryukau/VSTPlugins).

If you are interested in the code, [`docs/code_walkthrough.md`](https://github.com/ryukau/UhhyouWebSynthesizers/blob/main/docs/code_walkthrough.md) and [`docs/randomization.md`](https://github.com/ryukau/UhhyouWebSynthesizers/blob/main/docs/randomization.md) might provide some information.

# How to Use without Internet
This section is written for non-programmers.

1. Install [Python 3](https://www.python.org/).
2. Download and extract (or unzip) this repository somewhere. Extracted directory is referred as `UhhyouWebSynthesizers` in following command.
3. Open terminal (PowerShell on Windows), and run following command.

```bash
cd path/to/UhhyouWebSynthesizers
python server.py
```

- Replace `path/to` according to your environment.
- `python server.py` automatically opens `index.html` on your browser.
- If `python` line fails, try replacing `python` to `python3`.

To update, delete existing `UhhyouWebSynthesizers` directory and download again. Or, install [Git](https://git-scm.com/) and run following command.

```bash
cd path/to/UhhyouWebSynthesizers
git pull
```

# License
Apache-2.0 except `lib` and `oldsynth/PADchoir` directory. `LICENSE.txt` contains complete Apache-2.0 license text.

All codes in `lib` follow licenses of original library authors.

All codes in `oldsynth/PADchoir` directory follow GPLv2+. `oldsynth/PADchoir/oscilgen.js` is a JavaScript port of `OscilGen.cpp` in [Yoshimi](https://yoshimi.github.io/downloads.html), which is under GPLv2+.

- The license text of GPLv2+ is in `oldsynth/PADchoir/LICENSE`.
- The list of authors of `OscilGen.cpp` are writte in `oldsynth/PADchoir/oscilgen.js`.
