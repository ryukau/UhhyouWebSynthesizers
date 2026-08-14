export function makeShared(floatArray) {
  if (typeof SharedArrayBuffer === "undefined") { return floatArray; }
  if (floatArray.buffer instanceof SharedArrayBuffer) { return floatArray; }
  try {
    const sab = new SharedArrayBuffer(floatArray.byteLength);
    const shared = new Float64Array(sab);
    shared.set(floatArray);
    if ("sampleRate" in floatArray) {
      Object.defineProperties(shared, {
        sampleRate: {value: floatArray.sampleRate, writable: false, enumerable: true},
        channels: {value: floatArray.channels, writable: false, enumerable: true},
      });
    }
    return shared;
  } catch (err) {
    if (err instanceof RangeError || (err.name && err.name.includes("RangeError"))) {
      throw new Error(
        `Memory allocation failed for SharedArrayBuffer (the size is too large): ${err.message}`);
    }
    throw err;
  }
}

/**
 * Manages loaded audio files, caching, and on-demand resampling without redundant copying.
 */
export class AudioFileManager {
  #items;

  /**
   * @param {number} size - Number of audio slots to allocate.
   */
  constructor(size = 1) {
    this.#items = Array.from({length: size}, () => ({
                                               originalAudio: null,
                                               resampledAudio: null,
                                               resampledAudioSampleRate: 0,
                                             }));
  }

  get size() { return this.#items.length; }

  /**
   * Sets and resamples an audio file slot to the target sample rate.
   * @param {number} index
   * @param {Float64Array} decodedData
   * @param {number} targetRate
   */
  async setAudio(index, decodedData, targetRate) {
    if (index < 0 || index >= this.#items.length) return;

    this.#items[index].originalAudio = decodedData;
    this.#items[index].resampledAudio = null;
    this.#items[index].resampledAudioSampleRate = 0;

    try {
      await this.#resampleItem(this.#items[index], targetRate);
    } catch (err) {
      this.clearAudio(index);
      throw err;
    }
  }

  /**
   * Clears the audio in a specific slot.
   * @param {number} index
   */
  clearAudio(index) {
    if (index < 0 || index >= this.#items.length) return;
    this.#items[index].originalAudio = null;
    this.#items[index].resampledAudio = null;
    this.#items[index].resampledAudioSampleRate = 0;
  }

  /**
   * Resamples an individual item to targetRate.
   */
  async #resampleItem(item, targetRate) {
    if (!item.originalAudio) return;

    if (item.originalAudio.sampleRate === targetRate) {
      item.resampledAudio = makeShared(item.originalAudio);
      item.resampledAudioSampleRate = targetRate;
      return;
    }

    if (item.resampledAudioSampleRate === targetRate && item.resampledAudio) return;

    const {resample} = await import("../lib/ffmpeg/ffmpeg_bridge.js");
    const resampled = await resample(
      item.originalAudio,
      item.originalAudio.sampleRate,
      targetRate,
      item.originalAudio.channels,
    );
    item.resampledAudio = makeShared(resampled);
    item.resampledAudioSampleRate = targetRate;
  }

  /**
   * Resamples all active audio slots when sampleRateScaler changes.
   * @param {number} targetRate
   */
  async resample(targetRate) {
    for (const item of this.#items) {
      if (item.originalAudio && item.resampledAudioSampleRate !== targetRate) {
        await this.#resampleItem(item, targetRate);
      }
    }
  }

  /**
   * Returns audio data formatted for transmission to the renderer worker.
   */
  toMessage() {
    const loadedAudios = this.#items.map(item => {
      if (!item.resampledAudio || !item.originalAudio) return null;
      return {
        data: item.resampledAudio,
        channels: item.originalAudio.channels,
        sampleRate: item.resampledAudioSampleRate,
      };
    });
    return {loadedAudios};
  }
}
