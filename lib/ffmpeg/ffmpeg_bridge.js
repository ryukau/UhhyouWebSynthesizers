import createFFmpegModule from './ffmpeg.js';

let wasmModule = null;

async function getModule() {
  if (!wasmModule) { wasmModule = await createFFmpegModule(); }
  return wasmModule;
}

/**
 * Decodes an audio file blob into a Float64Array containing interleaved double-precision float PCM.
 * Custom read-only properties 'sampleRate' and 'channels' are attached to the returned
 * Float64Array.
 * @param {Blob} blob
 * @returns {Promise<Float64Array>}
 */
export async function decode(blob) {
  const Module = await getModule();
  const arrayBuffer = await blob.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  // Write file into MEMFS virtual filesystem
  const tempFilename = `/input_${Date.now()}_audio`;
  Module.FS.writeFile(tempFilename, uint8Array);

  try {
    const decoded = Module.decode(tempFilename);
    const float64Array = decoded.data;

    if (float64Array.length === 0) {
      throw new Error("Decoding failed. Decoded audio buffer size is 0.");
    }

    // Attach layout details as read-only properties on the Float64Array
    Object.defineProperties(float64Array, {
      sampleRate: {value: decoded.sampleRate, writable: false, enumerable: true},
      channels: {value: decoded.channels, writable: false, enumerable: true}
    });

    return float64Array;

  } finally {
    try {
      Module.FS.unlink(tempFilename); // Free file virtual memory
    } catch (e) { console.error("Failed to clean up virtual file.", e); }
  }
}

/**
 * Resamples an interleaved Float64Array.
 * Custom read-only properties 'sampleRate' and 'channels' are attached to the returned
 * Float64Array.
 * @param {Float64Array} inputFloat64Array
 * @param {number} inSampleRate
 * @param {number} outSampleRate
 * @param {number} channels
 * @returns {Promise<Float64Array>}
 */
export async function resample(inputFloat64Array, inSampleRate, outSampleRate, channels) {
  const Module = await getModule();
  const resampledData = Module.resample(inputFloat64Array, inSampleRate, outSampleRate, channels);

  Object.defineProperties(resampledData, {
    sampleRate: {value: outSampleRate, writable: false, enumerable: true},
    channels: {value: channels, writable: false, enumerable: true}
  });

  return resampledData;
}
