// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {palette} from "./palette.js";

/*
Display single channel waveform.
*/
export class WaveView {
  #offset; // Index to start drawing waveform.
  #length; // Number of samples to draw.
  #data;   // Waveform data. Must be array of numbers.
  #isUpperHalf;
  #isMouseDown;
  #lastX;

  constructor(parent, width, height, data, autoScale) {
    this.div = document.createElement("div");
    this.div.className = "canvasMargin";
    parent.appendChild(this.div);

    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.addEventListener("wheel", (e) => this.onWheel(e), false);
    this.canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e), false);
    this.canvas.addEventListener("pointerup", (e) => this.onPointerUp(e), false);
    this.canvas.addEventListener("pointermove", (e) => this.onPointerMove(e), false);
    this.canvas.addEventListener("pointerleave", (e) => this.onPointerLeave(e), false);
    this.div.appendChild(this.canvas);
    this.context = this.canvas.getContext("2d");

    this.#offset = 0;
    this.#length = 0;
    this.#data = null;
    this.autoScale = autoScale;
    this.#isUpperHalf = false;
    this.#isMouseDown = false;
    this.#lastX = 0;

    this.set(data);
  }

  set(data) {
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

    this.draw();
  }

  onPointerDown(event) {
    this.#isMouseDown = true;
    let rect = event.target.getBoundingClientRect();
    this.#lastX = Math.floor(event.clientX - rect.left);
  }

  onPointerUp(event) { this.#isMouseDown = false; }

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

  onPointerLeave(event) { this.#isMouseDown = false; }

  onWheel(event) {
    event.preventDefault(); // Prevent page scrolling.
    if (event.ctrlKey || event.altKey) {
      this.scroll(event);
    } else {
      this.zoom(event);
    }
  }

  scroll(event) {
    let dx = Math.floor(this.#length / 8);
    if (event.deltaY > 0) {
      this.#offset += dx;
    } else {
      this.#offset -= dx;
    }

    // Clamp offset.
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

    // Adjust length.
    this.#length = Math.floor(this.#length);
    if (this.#length > this.#data.length) {
      this.#length = this.#data.length;
    } else if (this.#length < 16) {
      this.#length = 16;
    }

    // Adjust offset.
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
