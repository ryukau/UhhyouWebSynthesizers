import createFFmpegModule from './ffmpeg.js';

let wasmModule = null;
let fileCounter = 0;

async function getModule() {
  if (!wasmModule) { wasmModule = await createFFmpegModule(); }
  return wasmModule;
}

/**
 * Decodes an audio file blob directly into a SharedArrayBuffer backed Float64Array.
 * @param {Blob} blob
 * @returns {Promise<Float64Array>}
 */
export async function decode(blob) {
  const Module = await getModule();
  const arrayBuffer = await blob.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  const tempFilename = `/input_${Date.now()}_${++fileCounter}_audio`;
  if (fileCounter >= Number.MAX_SAFE_INTEGER) { fileCounter = 0; }

  try {
    Module.FS.writeFile(tempFilename, uint8Array);
  } catch (e) {
    throw new Error(
      `Memory allocation failed writing file to virtual FS (size too large): ${e.message || e}`);
  }

  try {
    const decoded = Module.decode_direct(tempFilename);
    if (decoded.error && decoded.error.length > 0) {
      if (decoded.data_ptr) Module.free_buffer(decoded.data_ptr);
      throw new Error(decoded.error);
    }

    const ptr = decoded.data_ptr;
    const totalSamples = decoded.total_samples;

    if (!ptr || totalSamples === 0) {
      if (ptr) Module.free_buffer(ptr);
      throw new Error("Decoding failed. Decoded audio buffer size is 0.");
    }

    try {
      const byteLength = totalSamples * 8;
      const sab = (typeof SharedArrayBuffer !== "undefined") ? new SharedArrayBuffer(byteLength)
                                                             : new ArrayBuffer(byteLength);

      const sharedArray = new Float64Array(sab);
      const wasmView = Module.HEAPF64.subarray(ptr >> 3, (ptr >> 3) + totalSamples);
      sharedArray.set(wasmView);

      Object.defineProperties(sharedArray, {
        sampleRate: {value: decoded.sample_rate, writable: false, enumerable: true},
        channels: {value: decoded.channels, writable: false, enumerable: true}
      });

      return sharedArray;
    } finally { Module.free_buffer(ptr); }

  } finally {
    try {
      Module.FS.unlink(tempFilename);
    } catch (e) { console.error("Failed to clean up virtual file.", e); }
  }
}

/**
 * Resamples an interleaved Float64Array using direct pointer streaming.
 * @param {Float64Array} inputFloat64Array
 * @param {number} inSampleRate
 * @param {number} outSampleRate
 * @param {number} channels
 * @returns {Promise<Float64Array>}
 */
export async function resample(inputFloat64Array, inSampleRate, outSampleRate, channels) {
  const Module = await getModule();
  const inLength = inputFloat64Array.length;

  if (inLength === 0 || channels <= 0) {
    const emptySab
      = (typeof SharedArrayBuffer !== "undefined") ? new SharedArrayBuffer(0) : new ArrayBuffer(0);
    const emptyArray = new Float64Array(emptySab);
    Object.defineProperties(emptyArray, {
      sampleRate: {value: outSampleRate, writable: false, enumerable: true},
      channels: {value: channels, writable: false, enumerable: true}
    });
    return emptyArray;
  }

  const inPtr = Module.alloc_buffer(inLength);
  if (!inPtr) {
    throw new Error("Memory allocation failed in WebAssembly for input audio buffer.");
  }
  Module.HEAPF64.set(inputFloat64Array, inPtr >> 3);

  let resResult;
  try {
    resResult = Module.resample_direct(inPtr, inLength, inSampleRate, outSampleRate, channels);
  } finally { Module.free_buffer(inPtr); }

  if (resResult.error && resResult.error.length > 0) {
    if (resResult.data_ptr) Module.free_buffer(resResult.data_ptr);
    throw new Error(resResult.error);
  }

  const outPtr = resResult.data_ptr;
  const totalSamples = resResult.total_samples;

  if (!outPtr || totalSamples === 0) {
    if (outPtr) Module.free_buffer(outPtr);
    const emptySab
      = (typeof SharedArrayBuffer !== "undefined") ? new SharedArrayBuffer(0) : new ArrayBuffer(0);
    const emptyArray = new Float64Array(emptySab);
    Object.defineProperties(emptyArray, {
      sampleRate: {value: outSampleRate, writable: false, enumerable: true},
      channels: {value: channels, writable: false, enumerable: true}
    });
    return emptyArray;
  }

  try {
    const outBytes = totalSamples * 8;
    const sab = (typeof SharedArrayBuffer !== "undefined") ? new SharedArrayBuffer(outBytes)
                                                           : new ArrayBuffer(outBytes);

    const sharedArray = new Float64Array(sab);
    const wasmView = Module.HEAPF64.subarray(outPtr >> 3, (outPtr >> 3) + totalSamples);
    sharedArray.set(wasmView);

    Object.defineProperties(sharedArray, {
      sampleRate: {value: outSampleRate, writable: false, enumerable: true},
      channels: {value: channels, writable: false, enumerable: true}
    });

    return sharedArray;
  } finally { Module.free_buffer(outPtr); }
}
