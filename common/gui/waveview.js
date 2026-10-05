// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {palette} from "./palette.js";

/**
Display single channel waveform.
*/
export class WaveView {
  #offset; // Index to start drawing waveform.
  #length; // Number of samples to draw.
  #data;   // Waveform data. Must be array of numbers.
  #isUpperHalf;
  #isMouseDown;
  #lastX;
  #peakText;
  #rmsPeakText;
  #displayRms = false; // For debugging.

  constructor(parent, width, height, data, autoScale) {
    this.div = document.createElement("div");
    this.div.className = "canvasMargin";
    parent.appendChild(this.div);

    this.liveRegion = document.createElement("span");
    this.liveRegion.classList.add("sr-only");
    this.liveRegion.setAttribute("role", "status");
    this.liveRegion.setAttribute("aria-live", "polite");
    this.liveRegion.setAttribute("aria-atomic", "true");
    Object.assign(this.liveRegion.style, {
      position: "absolute",
      width: "1px",
      height: "1px",
      padding: "0",
      margin: "-1px",
      overflow: "hidden",
      clip: "rect(0, 0, 0, 0)",
      whiteSpace: "nowrap",
      border: "0",
    });
    this.div.appendChild(this.liveRegion);

    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.tabIndex = 0;
    this.canvas.ariaLabel = "Waveform display, canvas";
    this.canvas.ariaDescription
      = "Arrow keys to scroll horizontally. +/- to zoom in and out. Home/End to jump to boundaries.";
    this.canvas.style.cursor = "grab";
    this.canvas.addEventListener("wheel", (e) => this.onWheel(e), false);
    this.canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e), false);
    this.canvas.addEventListener("pointerup", (e) => this.onPointerUp(e), false);
    this.canvas.addEventListener("pointermove", (e) => this.onPointerMove(e), false);
    this.canvas.addEventListener("pointerleave", (e) => this.onPointerLeave(e), false);
    this.canvas.addEventListener("keydown", (e) => this.onKeyDown(e), false);
    this.div.appendChild(this.canvas);
    this.context = this.canvas.getContext("2d");

    this.#offset = 0;
    this.#length = 0;
    this.#data = null;
    this.autoScale = autoScale;
    this.#isUpperHalf = false;
    this.#isMouseDown = false;
    this.#lastX = 0;
    this.#peakText = "";
    this.#rmsPeakText = "";

    window.matchMedia?.("(prefers-color-scheme: dark)")
      .addEventListener?.("change", () => this.draw());

    this.set(data);
  }

  #announce(text) {
    if (!this.liveRegion) return;
    // Alternate invisible character to ensure screen readers re-announce identical strings.
    this.liveRegion.textContent = this.liveRegion.textContent === text ? `${text}\u00A0` : text;
  }

  #formatDb(db) {
    if (Number.isNaN(db)) {
      return "+nan dB";
    } else if (db === Infinity) {
      return "+inf dB";
    } else if (db === -Infinity) {
      return "-inf dB";
    }
    let dbStr = db.toFixed(2);
    if (dbStr[0] !== "-") { dbStr = "+" + dbStr; }
    return `${dbStr} dB`;
  }

  set(data, rawPeak = null) {
    this.#offset = 0;
    if (Array.isArray(data)) {
      this.#data = data;
      this.#length = data.length;
    } else {
      this.#data = [];
      this.#length = 0;
    }

    if (this.autoScale) {
      this.#isUpperHalf = true;
      for (let i = 0; i < this.#data.length; ++i) {
        if (this.#data[i] < 0) {
          this.#isUpperHalf = false;
          break;
        }
      }
    }

    // Calculate peak gain and RMS peak.
    let maxVal = 0;
    let sumSq = 0;
    if (rawPeak === null) {
      this.#peakText = "";
      this.#rmsPeakText = "";
    } else {
      const hasRawPeak = rawPeak !== undefined && Number.isFinite(rawPeak);
      if (hasRawPeak) { maxVal = rawPeak; }
      for (let i = 0; i < this.#data.length; ++i) {
        const val = this.#data[i];
        if (!hasRawPeak) {
          const absVal = Math.abs(val);
          if (absVal > maxVal) { maxVal = absVal; }
        }
        sumSq += val * val;
      }

      const peak = 20 * Math.log10(maxVal);
      this.#peakText = this.#formatDb(peak);

      const rmsVal = this.#data.length > 0 ? Math.sqrt(sumSq / this.#data.length) : 0;
      const rmsPeak = 20 * Math.log10(rmsVal);
      this.#rmsPeakText = this.#formatDb(rmsPeak);
    }

    this.draw();

    if (this.#data && this.#data.length > 0) {
      let msg = `Waveform loaded: ${this.#data.length} samples`;
      if (this.#peakText) { msg += `, peak ${this.#peakText}`; }
      this.#announce(msg);
    }
  }

  onPointerDown(event) {
    this.#isMouseDown = true;
    this.canvas.style.cursor = "grabbing";
    let rect = event.target.getBoundingClientRect();
    this.#lastX = Math.floor(event.clientX - rect.left);
  }

  onPointerUp(event) {
    const wasDragging = this.#isMouseDown;
    this.#isMouseDown = false;
    this.canvas.style.cursor = "grab";
    if (wasDragging && this.#data?.length > 0) {
      this.#announce(`Offset ${this.#offset} of ${this.#data.length}`);
    }
  }

  onPointerMove(event) {
    if (!this.#isMouseDown) return;

    let rect = event.target.getBoundingClientRect();
    let x = Math.floor(event.clientX - rect.left);

    let scroll = this.#length * (x - this.#lastX) / this.canvas.width;
    this.#offset -= (scroll > 0) ? Math.ceil(scroll) : Math.floor(scroll);
    if (this.#offset < 0) {
      this.#offset = 0;
    } else if (this.#offset + this.#length > this.#data.length) {
      this.#offset = this.#data.length - this.#length;
    }
    this.draw();

    this.#lastX = x;
  }

  onPointerLeave(event) {
    this.#isMouseDown = false;
    this.canvas.style.cursor = "grab";
  }

  onWheel(event) {
    event.preventDefault();
    if (event.ctrlKey || event.altKey) {
      this.scroll(event);
    } else {
      this.zoom(event);
    }
  }

  onKeyDown(event) {
    if (this.#length === 0 || this.#data === null) return;

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      let dx = Math.max(1, Math.floor(this.#length / 8));
      this.#offset = Math.max(0, this.#offset - dx);
      this.draw();
      this.#announce(
        this.#offset === 0 ? `Start of waveform: offset 0 of ${this.#data.length}`
                           : `Offset ${this.#offset} of ${this.#data.length}`);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      let dx = Math.max(1, Math.floor(this.#length / 8));
      let maxOffset = Math.max(0, this.#data.length - this.#length);
      this.#offset = Math.min(maxOffset, this.#offset + dx);
      this.draw();
      this.#announce(
        this.#offset === maxOffset
          ? `End of waveform: offset ${this.#offset} of ${this.#data.length}`
          : `Offset ${this.#offset} of ${this.#data.length}`);
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      this.zoom({offsetX: this.canvas.width / 2, deltaY: -1});
      this.#announce(`Zoomed in: ${this.#length} samples visible, offset ${this.#offset}`);
    } else if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      this.zoom({offsetX: this.canvas.width / 2, deltaY: 1});
      this.#announce(`Zoomed out: ${this.#length} samples visible, offset ${this.#offset}`);
    } else if (event.key === "Home") {
      event.preventDefault();
      this.#offset = 0;
      this.draw();
      this.#announce(`Start of waveform: offset 0 of ${this.#data.length}`);
    } else if (event.key === "End") {
      event.preventDefault();
      this.#offset = Math.max(0, this.#data.length - this.#length);
      this.draw();
      this.#announce(`End of waveform: offset ${this.#offset} of ${this.#data.length}`);
    }
  }

  scroll(event) {
    let dx = Math.floor(this.#length / 8);
    if (event.deltaY > 0) {
      this.#offset += dx;
    } else {
      this.#offset -= dx;
    }

    let maxOffset = this.#data.length - this.#length - 1;
    this.#offset = Math.max(0, Math.min(this.#offset, maxOffset));

    this.draw();
  }

  zoom(event) {
    let positionX = (event.offsetX < 0) ? 0 : event.offsetX;
    let xOffset = Math.max(positionX / this.canvas.width, 0);
    let scale = 2;
    let previous = this.#length;
    if (event.deltaY > 0) {
      this.#length *= scale;
    } else {
      this.#length /= scale;
    }
    this.#offset += xOffset * (previous - this.#length);

    this.#length = Math.floor(this.#length);
    if (this.#length > this.#data.length) {
      this.#length = this.#data.length;
    } else if (this.#length < 16) {
      this.#length = 16;
    }

    this.#offset = Math.floor(this.#offset);
    if (this.#offset < 0) {
      this.#offset = 0;
    } else {
      this.#offset += Math.min(0, this.#data.length - (this.#length + this.#offset));
    }

    this.draw();
  }

  draw() {
    const width = this.canvas.width;
    const height = this.canvas.height;

    // Clear.
    this.context.fillStyle = palette.background;
    this.context.fillRect(0, 0, width, height);

    let y0 = this.#isUpperHalf ? height : height / 2;
    this.drawAxes(y0);
    this.drawWave(y0);

    // Text.
    const fontSize = 12;
    this.context.fillStyle = palette.foreground;
    this.context.font = `${fontSize}px ${palette.fontFamily}`;
    this.context.fillText(`${this.#offset}/${this.#data.length}`, 0, fontSize + 1);

    // Peak gain indicator and RMS peak indicator.
    this.context.textAlign = "right";
    this.context.fillText(this.#peakText, width, fontSize + 1);
    if (this.#displayRms) { this.context.fillText(this.#rmsPeakText, width, (fontSize + 1) * 2); }
    this.context.textAlign = "left";
  }

  drawAxes(y0) {
    this.context.strokeStyle = palette.overlay;
    this.context.lineWidth = 0.5;
    this.context.setLineDash([6, 4]);
    this.context.beginPath();
    this.context.moveTo(0, y0);
    this.context.lineTo(this.canvas.width, y0);
    this.context.stroke();
    this.context.setLineDash([]);
  }

  drawWave(y0) {
    if (this.#length === 0 || this.canvas.width === 0) return;

    this.context.strokeStyle = palette.waveform;
    this.context.fillStyle = palette.waveform;
    this.context.lineCap = "round";
    this.context.save();
    this.context.translate(0, y0);
    this.context.scale(1, -1);

    if (this.#length >= 2 * this.canvas.width) {
      this.drawWaveWide();
    } else {
      this.drawWaveNarrow();
    }
    this.context.restore();
  }

  #setY(y) {
    const h = this.canvas.height;
    return y * (this.#isUpperHalf ? h : h / 2);
  }

  drawWaveWide() {
    const width = this.canvas.width;
    const offset = this.#offset;
    const step = this.#length / width;

    const maxY = new Float32Array(width);

    this.context.lineWidth = 0.5;
    this.context.setLineDash([]);
    this.context.beginPath();

    for (let x = 0; x < width; ++x) {
      let indexStart = Math.floor(offset + x * step);
      let indexEnd = Math.floor(offset + (x + 1) * step);

      if (indexStart === indexEnd) { indexEnd = indexStart + 1; }
      if (indexEnd > this.#data.length) { indexEnd = this.#data.length; }
      if (indexStart >= this.#data.length) { indexStart = this.#data.length - 1; }

      let min = Number.MAX_VALUE;
      let max = -Number.MAX_VALUE;

      for (let index = indexStart; index < indexEnd; ++index) {
        const val = this.#data[index];
        if (val < min) min = val;
        if (val > max) max = val;
      }

      const minY = this.#setY(min);
      maxY[x] = this.#setY(max);

      if (x === 0) {
        this.context.moveTo(x, minY);
      } else {
        this.context.lineTo(x, minY);
      }
    }

    for (let x = width - 1; x >= 0; --x) { this.context.lineTo(x, maxY[x]); }

    this.context.closePath();
    this.context.fill();
    this.context.stroke();
  }

  drawWaveNarrow() {
    if (this.#length <= 1) return;

    const widthMinusOne = this.canvas.width - 1;
    const last = this.#length - 1;

    let px = new Array(this.#length);
    let py = new Array(this.#length);
    px[0] = 0;
    py[0] = this.#setY(this.#data[this.#offset]);
    for (let i = 1; i < this.#length; ++i) {
      px[i] = i * widthMinusOne / last;
      py[i] = this.#setY(this.#data[this.#offset + i]);
    }

    this.context.lineWidth = 1;
    this.context.setLineDash([]);
    this.context.beginPath();
    this.context.moveTo(px[0], py[0]);
    for (let i = 1; i < this.#length; ++i) { this.context.lineTo(px[i], py[i]); }
    this.context.stroke();

    const dotRadius = 3;
    const intervalX = widthMinusOne / last;
    if (intervalX > 3 * dotRadius) {
      for (let i = 0; i < this.#length; ++i) {
        this.context.beginPath();
        this.context.arc(px[i], py[i], dotRadius, 0, Math.PI * 2, false);
        this.context.fill();
      }
    }
  }
}
