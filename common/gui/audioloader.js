export class AudioLoader {
  constructor(parent, label, onLoadSuccessFunc, onLoadFailureFunc, maxDuration = 16) {
    this.maxDuration = maxDuration;
    this.onLoadSuccessFunc = onLoadSuccessFunc;
    this.onLoadFailureFunc = onLoadFailureFunc;

    this.container = document.createElement("div");
    this.container.classList.add("audioLoaderContainer");
    parent.appendChild(this.container);

    this.divDragAndDropArea = document.createElement("div");
    this.divDragAndDropArea.classList.add("audioLoaderDragAndDropArea");
    this.divDragAndDropArea.setAttribute("tabindex", "0");
    this.divDragAndDropArea.setAttribute("role", "button");
    this.divDragAndDropArea.setAttribute(
      "aria-label", "Drag & drop or click to upload an audio file");

    this.divDragAndDropArea.addEventListener("drop", (e) => this.#onDropFile(e));
    this.divDragAndDropArea.addEventListener("dragover", (e) => this.#onDragOver(e));
    this.divDragAndDropArea.addEventListener("dragleave", (e) => this.#onDragLeave(e));
    this.divDragAndDropArea.addEventListener("click", () => this.inputFile.click());

    this.divDragAndDropArea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault(); // Prevents page scrolling on Space press
        this.inputFile.click();
      }
    });

    this.container.appendChild(this.divDragAndDropArea);

    this.spanLabel = document.createElement("span");
    this.spanLabel.classList.add("audioLoaderLabel");
    this.spanLabel.textContent = label;
    this.divDragAndDropArea.appendChild(this.spanLabel);

    this.spanDragAndDropArea = document.createElement("span");
    this.spanDragAndDropArea.classList.add("audioLoaderInstruction");
    this.spanDragAndDropArea.textContent = `Drag & Drop . Max ${this.maxDuration}s`;
    this.divDragAndDropArea.appendChild(this.spanDragAndDropArea);

    this.inputFile = document.createElement("input");
    this.inputFile.type = "file";
    this.inputFile.accept = "audio/*";
    this.inputFile.style.display = "none";
    this.inputFile.addEventListener("change", (e) => this.#onInputFileChange(e));
    this.container.appendChild(this.inputFile);

    this.spanStatus = document.createElement("span");
    this.spanStatus.classList.add("audioLoaderStatus");
    this.spanStatus.textContent = "Empty";
    this.divDragAndDropArea.appendChild(this.spanStatus);
  }

  #onDragOver(event) {
    event.preventDefault();
    this.divDragAndDropArea.classList.add("dragover");
  }

  #onDragLeave(event) { this.divDragAndDropArea.classList.remove("dragover"); }

  #onDropFile(event) {
    event.preventDefault();
    this.divDragAndDropArea.classList.remove("dragover");
    const files = event.dataTransfer.files;
    if (files.length > 0) { this.#processFile(files[0]); }
  }

  #onInputFileChange(event) {
    const files = this.inputFile.files;
    if (files.length > 0) { this.#processFile(files[0]); }
  }

  async #processFile(file) {
    this.spanStatus.textContent = "Decoding audio file...";
    this.spanStatus.classList.remove("success", "error", "warning");

    try {
      const {decode} = await import("../../lib/ffmpeg/ffmpeg_bridge.js");
      let decodedData = await decode(file);

      // Record original duration in samples prior to any trimming
      const originalSamples = Math.floor(decodedData.length / decodedData.channels);
      const totalSeconds = originalSamples / decodedData.sampleRate;

      let isTrimmed = false;
      const maxSamples = Math.floor(this.maxDuration * decodedData.sampleRate);
      if (originalSamples > maxSamples) {
        console.warn(
          `Audio file "${file.name}" exceeds maximum duration of ${this.maxDuration}s (${
            totalSeconds.toFixed(2)}s). Trimming to ${this.maxDuration}s.`,
        );

        const maxElements = maxSamples * decodedData.channels;
        const trimmed = decodedData.slice(0, maxElements);
        Object.defineProperties(trimmed, {
          sampleRate: {value: decodedData.sampleRate, writable: false, enumerable: true},
          channels: {value: decodedData.channels, writable: false, enumerable: true},
        });
        decodedData = trimmed;
        isTrimmed = true;
      }

      const samples = Math.floor(decodedData.length / decodedData.channels);
      const totalSecondsTrimmed = samples / decodedData.sampleRate;
      const minutes = Math.floor(totalSecondsTrimmed / 60);
      const seconds = Math.floor(totalSecondsTrimmed % 60).toString().padStart(2, "0");

      if (isTrimmed) {
        this.spanStatus.textContent = `Warning: Trimmed to ${this.maxDuration}s\nLoaded: ${
          file.name}\n ${minutes}:${seconds} (${originalSamples} samples), ${
          decodedData.channels}ch, ${decodedData.sampleRate}Hz`;
        this.spanStatus.classList.add("warning");
      } else {
        this.spanStatus.textContent = `Loaded: ${file.name}\n ${minutes}:${seconds} (${
          originalSamples} samples), ${decodedData.channels}ch, ${decodedData.sampleRate}Hz`;
        this.spanStatus.classList.add("success");
      }

      if (this.onLoadSuccessFunc) { this.onLoadSuccessFunc(decodedData, file.name); }
    } catch (err) {
      console.error(err);
      this.spanStatus.textContent = `Error: ${err.message || err}`;
      this.spanStatus.classList.add("error");

      if (this.onLoadFailureFunc) { this.onLoadFailureFunc(err); }
    }
  }
}
