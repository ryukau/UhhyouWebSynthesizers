# UhhyouWebSynthesizers
A collection of sample generators that run on browser.

- [Index Page](https://ryukau.github.io/UhhyouWebSynthesizers/)

Generators in this collection outputs wav file to use on DAW or sampler. If you are looking for instruments or effects that runs on real-time, take a look at [my plugin repository](https://github.com/ryukau/VSTPlugins).

# Known Issue
Rendering doesn't work on Firefox 104.0.2. It requires support for ECMAScript modules on Web Workers.

- [Worker() - Web APIs | MDN](https://developer.mozilla.org/en-US/docs/Web/API/Worker/Worker#browser_compatibility)
- [1247687 - Implement worker modules](https://bugzilla.mozilla.org/show_bug.cgi?id=1247687)

# License
All rights are reserved, except the codes from third parties in `lib` directory. All codes in `lib` follow licenses of original authors.

Current state is temporary. I'm not yet decided which license to use, but probably settles to Apache.
