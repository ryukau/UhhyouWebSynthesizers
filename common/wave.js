// Copyright 2022 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

export class Audio {
  #source;
  #gain;
  #rendererPath;
  #fadeOutDuration = 0.01;

  constructor(channels, rendererPath, renderStatusElement, onRenderFinish) {
    this.audioContext = new AudioContext();
    this.wave = new Wave(channels);
    this.#rendererPath = rendererPath;
    this.renderStatusElement = renderStatusElement;
    this.onRenderFinish = onRenderFinish;
    this.workers = [];
    for (let ch = 0; ch < this.wave.channels; ++ch) {
      this.workers.push({
        worker: new Worker(this.#rendererPath, {type: "module"}),
        isRunning: false,
      });
    }
  }

  play() {
    let buffer = this.audioContext.createBuffer(
      this.wave.channels, this.wave.frames, this.audioContext.sampleRate);

    for (let i = 0; i < this.wave.channels; ++i) {
      buffer.copyToChannel(new Float32Array(this.wave.data[i]), i, 0);
    }

    this.stop();

    // Gain node is used to remove pop noise when stopping in the middle of sound.
    this.#gain = this.audioContext.createGain();
    this.#gain.gain.value = 1;
    this.#gain.connect(this.audioContext.destination);

    this.#source = this.audioContext.createBufferSource();
    this.#source.buffer = buffer;
    this.#source.connect(this.#gain);
    this.#source.start(this.audioContext.currentTime + this.#fadeOutDuration + 0.001);
  }

  stop() {
    if (this.#source === undefined) return;
    this.#gain.gain.setValueAtTime(1, this.audioContext.currentTime);
    this.#gain.gain.linearRampToValueAtTime(
      0, this.audioContext.currentTime + this.#fadeOutDuration);
    this.#source.stop(this.audioContext.currentTime + this.#fadeOutDuration + 0.001);
  }

  save(loop = false, cue = []) {
    let buffer = Wave.toBuffer(this.wave, this.wave.channels);
    let header = Wave.fileHeader(
      this.audioContext.sampleRate, this.wave.channels, buffer.length, loop, cue);

    let blob = new Blob([header, buffer], {type: "application/octet-stream"});
    let url = window.URL.createObjectURL(blob);

    let a = document.createElement("a");
    a.style = "display: none";
    a.href = url;
    a.download = document.title + "_" + Date.now() + ".wav";
    document.body.appendChild(a);
    a.click();

    // Introducing delay to enable download on Firefox.
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 100);
  }

  render(parameter, normalize = "link", quickSave = false) {
    if (this.renderStatusElement !== undefined) {
      this.renderStatusElement.textContent = "⚠ Rendering ⚠";
    }

    for (let ch = 0; ch < this.wave.channels; ++ch) {
      if (this.workers[ch].isRunning) {
        this.workers[ch].worker.terminate();
        this.workers[ch].worker = new Worker(this.#rendererPath, {type: "module"});
      } else {
        this.workers[ch].isRunning = true;
      }
      this.workers[ch].worker.postMessage(Object.assign({}, parameter, {channel: ch}));
    }

    this.workers.forEach((value, index) => {
      value.worker.onmessage = (event) => {
        this.wave.data[index] = event.data.sound;
        this.workers[index].isRunning = false;
        if (this.workers.every((v) => !v.isRunning)) {
          if (this.wave.channels === 1) this.wave.copyChannel(index);

          this.finalize(
            normalize,
            parameter.fadeIn === undefined ? 0 : parameter.fadeIn,
            parameter.fadeOut === undefined ? 0 : parameter.fadeOut,
            parameter.stereoMerge === undefined ? 0 : parameter.stereoMerge,
            quickSave,
          );
        }
      };
    });
  }

  finalize(
    normalize,
    fadeInSeconds,
    fadeOutSeconds,
    stereoMerge,
    quickSave,
  ) {
    this.wave.declickIn(fadeInSeconds * this.audioContext.sampleRate);
    this.wave.declickOut(fadeOutSeconds * this.audioContext.sampleRate);
    this.wave.stereoMerge(stereoMerge);

    if (normalize === "link") {
      this.wave.normalize();
    } else if (normalize === "perChannel") {
      this.wave.normalizePerChannel();
    }

    this.onRenderFinish(this.wave);

    if (this.renderStatusElement !== undefined) {
      this.renderStatusElement.textContent = "Rendering finished. ✓";
    }

    if (quickSave) this.save();
  }
}

export class Wave {
  constructor(channels) {
    this.data = [];
    for (let i = 0; i < channels; ++i) this.data.push([]);
  }

  get frames() { return this.data[0].length; }
  get channels() { return this.data.length; }

  get left() { return this.data[0]; }
  set left(data) { this.data[0] = data; }

  get right() { return this.data[1]; }
  set right(data) { this.data[1] = data; }

  isMono() { return this.data.length === 1; }
  isStereo() { return this.data.length === 2; }

  // Align channel length to the longest one.
  align() {
    let maxLength = 0;
    for (let i = 0; i < this.data.length; ++i) {
      if (maxLength < this.data[i].length) maxLength = this.data[i].length;
    }
    for (let i = 0; i < this.data.length; ++i) {
      for (let j = this.data[i].length; j < maxLength; ++j) this.data[i].push(0);
    }
  }

  findPeak() {
    let peak = null;
    let max = -Number.MAX_VALUE;
    for (let channel = 0; channel < this.data.length; ++channel) {
      for (let sample = 0; sample < this.data[channel].length; ++sample) {
        let value = Math.abs(this.data[channel][sample]);
        if (max < value) {
          max = value;
          peak = {channel, sample, value};
        }
      }
    }
    return peak;
  }

  // If argument is not set, normalize the peak value to 1.0.
  normalize(divisor) {
    let peakValue = divisor;
    if (!Number.isFinite(divisor)) {
      let peak = this.findPeak();
      if (peak === null || peak.value === 0) {
        console.warn("findPeak failed.");
        return;
      }
      this.peakValue = peak.value;
      peakValue = this.peakValue;
    }

    for (let i = 0; i < this.data.length; ++i) {
      for (let j = 0; j < this.data[i].length; ++j) this.data[i][j] /= peakValue;
    }
  }

  normalizePerChannel() {
    for (let channel = 0; channel < this.data.length; ++channel) {
      let max = -Number.MAX_VALUE;
      for (let sample = 0; sample < this.data[channel].length; ++sample) {
        const value = Math.abs(this.data[channel][sample]);
        if (max < value) max = value;
      }

      if (max <= Number.EPSILON) continue;

      for (let sample = 0; sample < this.data[channel].length; ++sample) {
        this.data[channel][sample] /= max;
      }
    }
  }

  declick(fadein, fadeout) {
    this.declickIn(fadein);
    this.declickOut(fadeout);
  }

  declickRatio(fadein, fadeout) {
    const length = this.data[0].length;
    this.declickIn(Math.floor(length * fadein / 100));
    this.declickOut(Math.floor(length * fadeout / 100));
  }

  // Using quater cosine from equal power panning.
  #fadeCurve(t) { return Math.cos((1 - t) * Math.PI / 2); }

  declickIn(fadeLength) {
    for (let channel = 0; channel < this.data.length; ++channel) {
      const length = Math.min(fadeLength, this.data[channel].length);
      for (let sample = 0; sample < length; ++sample) {
        this.data[channel][sample] *= this.#fadeCurve(sample / length);
      }
    }
  }

  declickOut(fadeLength) {
    for (let channel = 0; channel < this.data.length; ++channel) {
      const length = Math.min(fadeLength, this.data[channel].length);
      const last = this.data[channel].length - 1;
      for (let sample = 0; sample < length; ++sample) {
        this.data[channel][last - sample] *= this.#fadeCurve(sample / length);
      }
    }
  }

  // amount is in [0, 1]. 0 stays intact, 1 is merge to mono.
  stereoMerge(amount) {
    if (amount === 0) return;
    if (this.data.length !== 2) return;

    if (this.data[0].length !== this.data[1].length) return;

    amount /= 2;
    for (let i = 0; i < this.data[0].length; ++i) {
      const s0 = this.data[0][i];
      const s1 = this.data[1][i];
      this.data[0][i] = s0 + amount * (s1 - s0);
      this.data[1][i] = s1 + amount * (s0 - s1);
    }
  }

  copyChannel(channel) {
    for (let ch = 0; ch < this.channels; ++ch) {
      if (channel !== ch) this.data[ch] = Array.from(this.data[channel]);
    }
  }

  rotate(channel, amount) {
    let data = this.data[channel];
    if (amount > 0) {
      let temp = data.splice(amount, data.length - amount);
      this.data[channel] = temp.concat(data);
    } else if (amount < 0) {
      let temp = data.splice(0, Math.abs(amount));
      this.data[channel] = data.concat(temp);
    }
  }

  // References:
  // http://www.piclist.com/techref/io/serial/midi/wave.html
  // https://web.archive.org/web/20230108120912/https://sites.google.com/site/musicgapi/technical-documents/wav-file-format
  static fileHeader(sampleRate, channels, bufferLengthBytes, loop = false, cue = false) {
    const ascii = (string) => {
      let ascii = new Uint8Array(string.length);
      for (let i = 0; i < string.length; ++i) ascii[i] = string.charCodeAt(i);
      return ascii;
    };
    const u16 = (value) => { return new Uint16Array([value]); };
    const u32 = (value) => { return new Uint32Array([value]); };

    let sampleSize = 32;
    let fmt = {
      sampleRate: sampleRate,
      sampleSize: sampleSize,
      channels: channels,
      bytesPerFrame: channels * sampleSize / 8,
    };

    if (!Array.isArray(cue)) cue = [];

    if (!Array.isArray(loop)) {
      loop
        = loop === true ? [{start: 0, end: bufferLengthBytes - fmt.bytesPerFrame}] : [];
    }

    //
    // +8 is 4 byte ascii ID and following 4 byte chunk size.
    //
    // fmt_, 18 + 8 = 26 [byte]
    // fact, 4 + 8 = 12 [byte]
    // cue_, 4 + 8 + 24 * numCue [byte]
    // smpl, 36 + 8 + 24 * numLoop [byte]
    // data, 4 + bufferLengthBytes [byte]
    //
    const cueChunkSize = cue.length >= 1 ? 8 + 4 + 24 * cue.length : 0;
    const smplChunkSize = loop.length >= 1 ? 8 + 36 + 24 * loop.length : 0;
    let riffChunkSize = 42 + cueChunkSize + smplChunkSize;

    let cueId = 0; // To avoid duplicate of IDs in cue and smpl.

    let header = [
      ascii("RIFF"),                          // # "riff" Chunk
      u32(riffChunkSize + bufferLengthBytes), // riffChunkSize
      ascii("WAVE"),                          // # "wave" Chunk

      ascii("fmt "),                           // # "fmt_" Chunk
      u32(18),                                 // fmtChunkSize
      u16(0x0003),                             // formatTag, 0x0003 = IEEE 32 bit float
      u16(fmt.channels),                       // channels
      u32(fmt.sampleRate),                     // samplePerSec
      u32(fmt.sampleRate * fmt.bytesPerFrame), // bytesPerSec
      u16(fmt.bytesPerFrame),                  // blockAlign
      u16(fmt.sampleSize),                     // bitsPerSample
      u16(0x0000),                             // cbSize

      ascii("fact"),                              // fact
      u32(4),                                     // factChunkSize
      u32(bufferLengthBytes / fmt.bytesPerFrame), // sampleLength
    ];

    if (cue.length >= 1) {
      header.push.apply(header, [
        ascii("cue "),         // # "cue " Chunk
        u32(cueChunkSize - 8), // cueChunkSize
        u32(cue.length),       // numCuePoints
      ]);
      for (let index = 0; index < cue.length; ++index) {
        header.push.apply(header, [
          u32(cueId),                                          // ID
          u32(0),                                              // position
          ascii("data"),                                       // dataChunkID
          u32(0),                                              // chunkStart
          u32(cue[index].start),                               // blockStart
          u32((cue.length - index) * 24 + smplChunkSize - 12), // sampleOffset
        ]);
        ++cueId;
      }
    }

    if (loop.length >= 1) {
      header.push.apply(header, [
        ascii("smpl"),             // # "smpl" Chunk
        u32(smplChunkSize - 8),    // smplChunkSize
        u32(0),                    // manufacturer
        u32(0),                    // product
        u32(1e9 / fmt.sampleRate), // samplePeriod
        u32(60),                   // midiUnityNote
        u32(0),                    // midiPitchFraction
        u32(0),                    // smpteFormat
        u32(0),                    // smpteOffset
        u32(loop.length),          // numSampleLoops
        u32(24 * loop.length),     // samplerData
      ]);

      for (let index = 0; index < loop.length; ++index) {
        header.push.apply(header, [
          u32(cueId),             // cuePointID
          u32(0),                 // type
          u32(loop[index].start), // start
          u32(loop[index].end),   // end
          u32(0),                 // fraction
          u32(0),                 // playCount
        ]);
        ++cueId;
      }
    }

    header.push.apply(header, [
      ascii("data"),          // data
      u32(bufferLengthBytes), // dataChunkSize
    ]);

    return this.#concatTypedArray(header)
  }

  static #concatTypedArray(arrays) {
    let dest = new Uint8Array(arrays.reduce((sum, arr) => sum + arr.byteLength, 0));
    let index = 0;
    arrays.forEach(arr => {
      new Uint8Array(arr.buffer).forEach(value => {
        dest[index] = value;
        ++index;
      });
    });
    return dest;
  }

  // Transpose `data` to Wave file buffer.
  static toBuffer(wave, channels) {
    wave.align();
    let f32 = new Float32Array(wave.frames * channels);
    for (let i = 0; i < wave.frames; ++i) {
      const ic = i * channels;
      for (let j = 0; j < channels; ++j) f32[ic + j] = wave.data[j][i];
    }
    return new Uint8Array(f32.buffer);
  }
}
