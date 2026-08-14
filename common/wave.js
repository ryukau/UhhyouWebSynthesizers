// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import * as util from "./util.js";

export class Audio {
  #source;
  #gain;
  #startTime = 0;
  #cachedBuffer = null;
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

  play(upFold = 1) {
    if (!this.#cachedBuffer) {
      let buffer = this.audioContext.createBuffer(
        this.wave.channels, this.wave.frames, upFold * this.audioContext.sampleRate);

      for (let i = 0; i < this.wave.channels; ++i) {
        buffer.copyToChannel(new Float32Array(this.wave.data[i]), i, 0);
      }
      this.#cachedBuffer = buffer;
    }

    this.stop();

    this.#gain = this.audioContext.createGain();
    this.#gain.gain.value = 1;
    this.#gain.connect(this.audioContext.destination);

    this.#source = this.audioContext.createBufferSource();
    this.#source.buffer = this.#cachedBuffer; // Use the cached buffer
    this.#source.connect(this.#gain);

    this.#startTime = this.audioContext.currentTime + this.#fadeOutDuration + 0.001;
    this.#source.start(this.#startTime);
  }

  stop() {
    if (this.#source === undefined) return;

    const gainToFade = this.#gain;
    const now = this.audioContext.currentTime;

    try {
      gainToFade.gain.setTargetAtTime(0, now, 0.003);

      setTimeout(() => {
        try {
          gainToFade.disconnect();
        } catch (e) {}
      }, 50);
    } catch (e) { console.warn("Audio stop handled gracefully:", e); }

    this.#source = undefined;
    this.#gain = undefined;
  }

  save(loop = false, cue = [], upFold = 1) {
    const buffer = Wave.toBuffer(this.wave, this.wave.channels);
    const header = Wave.fileHeader(
      upFold * this.audioContext.sampleRate, this.wave.channels, buffer.length, loop, cue);

    const blob = new Blob([header, buffer], {type: "application/octet-stream"});
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.style = "display: none";
    a.href = url;
    a.download = `${document.title}_${util.getTimeStamp()}.wav`;
    document.body.appendChild(a);
    a.click();

    // Introducing delay to enable download on Firefox.
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 100);
  }

  render(parameter, normalize = "link", quickSave = false, onRenderFinished = () => {}) {
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
            //
            // Making an assumption that `sampleRateScaler` is always power of 2. :(
            parameter.sampleRateScaler === undefined ? 1 : (1 << parameter.sampleRateScaler),
            quickSave,
          );

          delete event.data.sound;
          onRenderFinished(event.data);
        }
      };
    });
  }

  finalize(
    normalize,
    fadeInSeconds,
    fadeOutSeconds,
    stereoMerge,
    sampleRateScaler,
    quickSave,
  ) {
    const upRate = sampleRateScaler * this.audioContext.sampleRate;
    this.wave.declickIn(fadeInSeconds * upRate);
    this.wave.declickOut(fadeOutSeconds * upRate);
    this.wave.stereoMerge(stereoMerge);

    const peak = this.wave.findPeak();
    this.wave.peakValue = peak === null ? 0 : peak.value;

    if (normalize === "link") {
      this.wave.normalize(this.wave.peakValue);
    } else if (normalize === "perChannel") {
      this.wave.normalizePerChannel();
    }

    this.#cachedBuffer = null;

    this.onRenderFinish(this.wave);

    if (this.renderStatusElement !== undefined) {
      this.renderStatusElement.textContent = "Rendering finished. ✓";
    }

    if (quickSave) this.save(false, [], sampleRateScaler);
  }
}

export class Wave {
  constructor(channels) {
    this.data = [];
    for (let i = 0; i < channels; ++i) this.data.push([]);
  }

  get frames() { return this.data.length > 0 ? this.data[0].length : 0; }
  get channels() { return this.data.length; }

  get left() { return this.data[0]; }
  set left(data) { this.data[0] = data; }

  get right() { return this.data[1]; }
  set right(data) { this.data[1] = data; }

  isMono() { return this.data.length === 1; }
  isStereo() { return this.data.length === 2; }

  // Align channel lengths to the longest one.
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
    } else if (peakValue === 0) {
      console.warn("Divisor is 0.");
      return;
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

      if (max <= 0) continue;

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
    if (this.data.length === 0) return;
    const length = this.data[0].length;
    this.declickIn(Math.floor(length * fadein / 100));
    this.declickOut(Math.floor(length * fadeout / 100));
  }

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

  // amount is in [0, 1]. 0 stays intact, 1 merges to mono.
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
    if (channel < 0 || channel >= this.channels) return;
    for (let ch = 0; ch < this.channels; ++ch) {
      if (channel !== ch) this.data[ch] = Array.from(this.data[channel]);
    }
  }

  rotate(channel, amount) {
    if (channel < 0 || channel >= this.channels) return;
    let data = this.data[channel];
    const len = data.length;
    if (len === 0) return;

    amount = amount % len;
    if (amount === 0) return;

    if (amount > 0) {
      let temp = data.splice(len - amount, amount);
      this.data[channel] = temp.concat(data);
    } else if (amount < 0) {
      let temp = data.splice(0, Math.abs(amount));
      this.data[channel] = data.concat(temp);
    }
  }

  static fileHeader(sampleRate, channels, bufferLengthBytes, loop = false, cue = false) {
    /*
    References:
    https://www.mmsp.ece.mcgill.ca/Documents/AudioFormats/WAVE/WAVE.html
    https://web.archive.org/web/20250613232553/http://www.piclist.com/techref/io/serial/midi/wave.html
    https://web.archive.org/web/20230108120912/https://sites.google.com/site/musicgapi/technical-documents/wav-file-format
    */

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
      loop = loop === true ? [{start: 0, end: (bufferLengthBytes / fmt.bytesPerFrame) - 1}] : [];
    }

    const cueChunkSize = cue.length >= 1 ? 8 + 4 + 24 * cue.length : 0;
    const smplChunkSize = loop.length >= 1 ? 8 + 36 + 24 * loop.length : 0;

    let riffChunkSize = 50 + cueChunkSize + smplChunkSize;

    let cueId = 0;

    let header = [
      ascii("RIFF"),
      u32(riffChunkSize + bufferLengthBytes),
      ascii("WAVE"),

      ascii("fmt "),
      u32(18),
      u16(0x0003), // 0x0003 = IEEE Float
      u16(fmt.channels),
      u32(fmt.sampleRate),
      u32(fmt.sampleRate * fmt.bytesPerFrame),
      u16(fmt.bytesPerFrame),
      u16(fmt.sampleSize),
      u16(0x0000),

      ascii("fact"),
      u32(4),
      u32(bufferLengthBytes / fmt.bytesPerFrame),
    ];

    if (cue.length >= 1) {
      header.push(ascii("cue "), u32(cueChunkSize - 8), u32(cue.length));
      for (let index = 0; index < cue.length; ++index) {
        header.push(
          u32(cueId),
          u32(cue[index].start), // position in sample frames
          ascii("data"), u32(0),
          u32(0),               // blockStart (always 0 for uncompressed PCM)
          u32(cue[index].start) // sampleOffset
        );
        ++cueId;
      }
    }

    if (loop.length >= 1) {
      header.push(
        ascii("smpl"), u32(smplChunkSize - 8), u32(0), u32(0),
        u32(Math.round(1e9 / fmt.sampleRate)), // samplePeriod
        u32(60), u32(0), u32(0), u32(0), u32(loop.length), u32(24 * loop.length));

      for (let index = 0; index < loop.length; ++index) {
        header.push(
          u32(cueId), u32(0),
          u32(loop[index].start), // start frame
          u32(loop[index].end),   // end frame
          u32(0), u32(0));
        ++cueId;
      }
    }

    header.push(ascii("data"), u32(bufferLengthBytes));

    return this.#concatTypedArray(header);
  }

  static #concatTypedArray(arrays) {
    let dest = new Uint8Array(arrays.reduce((sum, arr) => sum + arr.byteLength, 0));
    let index = 0;
    arrays.forEach(arr => {
      let byteView = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
      dest.set(byteView, index);
      index += arr.byteLength;
    });
    return dest;
  }

  static toBuffer(wave) {
    wave.align();
    const channels = wave.channels;
    if (channels === 0) return new Uint8Array(0);
    let f32 = new Float32Array(wave.frames * channels);
    for (let i = 0; i < wave.frames; ++i) {
      const ic = i * channels;
      for (let j = 0; j < channels; ++j) f32[ic + j] = wave.data[j][i];
    }
    return new Uint8Array(f32.buffer);
  }
}
