# UhhyouWebSynthesizers
A collection of sample generators that run on browser.

- [Index Page](https://ryukau.github.io/UhhyouWebSynthesizers/)

Generators in this collection outputs wav file to use on external DAW or sampler. If you are looking for instruments or effects that runs on real-time, take a look at [my plugin repository](https://github.com/ryukau/VSTPlugins).

# Known Issue
Rendering doesn't work on Firefox 104.0.2. It requires support for ECMAScript modules on Web Workers.

- [Worker() - Web APIs | MDN](https://developer.mozilla.org/en-US/docs/Web/API/Worker/Worker#browser_compatibility)
- [1247687 - Implement worker modules](https://bugzilla.mozilla.org/show_bug.cgi?id=1247687)

# How to Use without Internet
**Important**: Old synthesizers are on different repositories. They require extra steps to use without the internet.

1. Install [Python 3](https://www.python.org/).
2. Download and extract (or unzip) this repository somewhere. Extracted directory is refered as `UhhyouWebSynthesizers` in following command.
3. Open terminal (PowerShell on Windows), and run following command.

```bash
cd path/to/UhhyouWebSynthesizers
python server.py
```

- Replace `path/to` according to your environment.
- `python server.py` automatically opens `index.html` on your browser.
- If `python` line fails, try replacing `python` to `python3`.

# License
Apache-2.0 except `lib` directory. `LICENSE.txt` contains complete Apache-2.0 license text.

All codes in `lib` follow licenses of original authors.
