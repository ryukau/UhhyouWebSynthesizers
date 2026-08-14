/**
 * Wraps a Float64Array in a SharedArrayBuffer for safe zero-copy sharing with Web Workers.
 * @param {Float64Array} floatArray
 * @returns {Float64Array}
 */
export function makeShared(floatArray) {
  if (typeof SharedArrayBuffer === "undefined") {
    return floatArray; // Fallback to standard array copy if SharedArrayBuffer is unsupported
  }
  const sab = new SharedArrayBuffer(floatArray.byteLength);
  const shared = new Float64Array(sab);
  shared.set(floatArray);
  return shared;
}

/**
 * Manages loaded audio files, caching, and on-demand resampling.
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

    await this.#resampleItem(this.#items[index], targetRate);
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
      if (!item.resampledAudio || item.resampledAudioSampleRate !== targetRate) {
        item.resampledAudio = makeShared(item.originalAudio);
        item.resampledAudioSampleRate = targetRate;
      }
      return;
    }

    if (item.resampledAudioSampleRate === targetRate) return;

    try {
      const {resample} = await import("../lib/ffmpeg/ffmpeg_bridge.js");
      const resampled = await resample(
        item.originalAudio,
        item.originalAudio.sampleRate,
        targetRate,
        item.originalAudio.channels,
      );
      item.resampledAudio = makeShared(resampled);
      item.resampledAudioSampleRate = targetRate;
    } catch (err) { console.error("Resampling failed:", err); }
  }

  /**
   * Resamples all active audio slots if targetRate changed.
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
    const loadedAudios = [];
    for (const item of this.#items) {
      if (item.resampledAudio && item.originalAudio) {
        loadedAudios.push({
          data: item.resampledAudio,
          channels: item.originalAudio.channels,
          sampleRate: item.resampledAudioSampleRate,
        });
      }
    }

    const first = loadedAudios[0];
    return {
      loadedAudios,
      loadedAudio: first ? first.data : null,
      loadedAudioChannels: first ? first.channels : 0,
      loadedAudioSampleRate: first ? first.sampleRate : 0,
    };
  }
}
