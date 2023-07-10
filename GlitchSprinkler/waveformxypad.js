// Copyright 2023 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {palette} from "../common/gui/palette.js";
import {clamp, dbToAmp} from "../common/util.js";

import {computePolynomial} from "./polynomial.js"

// Solve `A x = b` for `x`.
function solve(A, b, size) {
  if (size > A.length) console.error("Provided size exceeds matrix size.");
  if (A.length != b.length) console.error("A.length != b.length");
  for (let i = 0; i < size; ++i) {
    if (A[i].length != A.length) console.error(`A[${i}].length != A.length`);
  }

  let lu = structuredClone(A);
  for (let i = 0; i < size; ++i) {
    if (Math.abs(A[i][i]) <= Number.EPSILON) { // Pivoting.
      let j = i + 1;
      for (; j < size; ++j) {
        if (Math.abs(A[j][i]) <= Number.EPSILON) continue;
        [A[i], A[j]] = [A[j], A[i]];
        [b[i], b[j]] = [b[j], b[i]];
        break;
      }
      if (j >= size) {
        console.warn("Matrix A can't be solved.", A, b, size);
        return [];
      }
    }

    for (let j = i; j < size; ++j) {
      let sum = 0;
      for (let k = 0; k < i; ++k) sum += lu[i][k] * lu[k][j];
      lu[i][j] = A[i][j] - sum;
    }
    for (let j = i + 1; j < size; ++j) {
      let sum = 0;
      for (let k = 0; k < i; ++k) sum += lu[j][k] * lu[k][i];
      lu[j][i] = (A[j][i] - sum) / lu[i][i];
    }
  }

  let y = new Array(size);
  for (let i = 0; i < size; ++i) {
    let sum = 0;
    for (let j = 0; j < i; ++j) sum += lu[i][j] * y[j];
    y[i] = b[i] - sum;
  }

  let x = new Array(size);
  for (let i = size - 1; i >= 0; --i) {
    let sum = 0;
    for (let j = i + 1; j < size; ++j) sum += lu[i][j] * x[j];
    x[i] = (y[i] - sum) / lu[i][i];
  }
  return x;
}

export class WaveformXYPad {
  #isMouseDown = false;
  #controlRadius = 8;
  #controlPoints;
  #detailIndex = 0;
  #focusedPoint = -1;
  #grabbedPoint = -1;
  #coefficients;

  constructor(
    parent,
    width,
    height,
    label,
    polyOrder,
    onChangeFunc,
  ) {
    this.divContainer = document.createElement("div");
    this.divContainer.classList.add("equalizerContainer");
    parent.appendChild(this.divContainer);

    this.divCanvasMargin = document.createElement("div");
    this.divCanvasMargin.classList.add("canvasMargin");
    this.divContainer.appendChild(this.divCanvasMargin);

    this.canvas = document.createElement("canvas");
    this.canvas.classList.add("envelopeView");
    this.canvas.ariaLabel = `${label}, canvas`;
    this.canvas.ariaDescription = "";
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.tabIndex = 0;
    this.canvas.addEventListener("mousedown", (e) => this.onMouseDown(e), false);
    this.canvas.addEventListener("mousemove", (e) => this.onMouseMove(e), false);
    this.canvas.addEventListener("mouseup", (e) => this.onMouseUp(e), false);
    this.canvas.addEventListener("mouseleave", (e) => this.onMouseLeave(e), false);
    this.canvas.addEventListener("wheel", (e) => this.onWheel(e), false);
    this.divCanvasMargin.appendChild(this.canvas);
    this.context = this.canvas.getContext("2d");

    this.divNormalizedView = document.createElement("div");
    this.divNormalizedView.classList.add("canvasMargin");
    this.divContainer.appendChild(this.divNormalizedView);

    this.normalizedView = document.createElement("canvas");
    this.normalizedView.classList.add("envelopeView");
    this.normalizedView.ariaLabel = `${label}, canvas`;
    this.normalizedView.ariaDescription = "";
    this.normalizedView.width = width;
    this.normalizedView.height = height / 2;
    this.normalizedView.tabIndex = 0;
    this.divNormalizedView.appendChild(this.normalizedView);
    this.nvCtx = this.normalizedView.getContext("2d");

    this.onChangeFunc = onChangeFunc;

    this.#controlPoints = new Array(polyOrder - 2);
    for (let idx = 0; idx < this.#controlPoints.length; ++idx) {
      const ratio = (idx + 1) / (this.#controlPoints.length + 1);
      this.#controlPoints[idx] = {
        x: this.canvas.width * ratio,
        y: (Math.sin(2 * Math.PI * ratio) + 1) * this.canvas.height / 2,
      };
    }

    this.#coefficients = new Array(this.#controlPoints.length + 2).fill(0);

    this.#updateCoefficients();
    this.refresh();
  }

  refresh() { this.draw(); }
  coefficients() { return structuredClone(this.#coefficients); }

  #updateCoefficients() {
    const size = this.#controlPoints.length + 2;

    let b = new Array(size);
    b[0] = 0;
    b[size - 1] = 0;
    for (let i = 1; i < size - 1; ++i) {
      b[i]
        = (this.#controlPoints[i - 1].y - this.canvas.height * 0.5) / this.canvas.height;
    }

    // A[n] = [x[n]^0, x[n]^1, x[n]^2, x[n]^3, ...].
    let A = new Array(size);
    for (let i = 0; i < size; ++i) A[i] = new Array(size);
    A[0].fill(0);
    A[0][0] = 1;
    A.at(-1).fill(1);
    for (let i = 1; i < size - 1; ++i) {
      const polyX = this.#controlPoints[i - 1].x / this.canvas.width;
      for (let j = 0; j < size; ++j) A[i][j] = polyX ** j;
    }

    this.#coefficients = solve(A, b, size);
  }

  #getMousePosition(event) {
    const rect = event.target.getBoundingClientRect();
    return {x: event.clientX - rect.left, y: event.clientY - rect.top};
  }

  #hitTest(mouse) {
    for (let index = 0; index < this.#controlPoints.length; ++index) {
      const dx = this.#controlPoints[index].x - mouse.x;
      const dy = this.#controlPoints[index].y - mouse.y;
      if (dx * dx + dy * dy > this.#controlRadius * this.#controlRadius) continue;
      return index;
    }
    return -1;
  }

  randomize() {
    const length = this.#controlPoints.length;
    for (let idx = 0; idx < length; ++idx) {
      const pt = this.#controlPoints[idx];
      pt.x = 0.5 * (1 - Math.cos(Math.PI * (idx + 1) / (length + 1))) * this.canvas.width;
      pt.y = Math.random() * this.canvas.height;
    }
    this.#updateCoefficients();
  }

  onMouseDown(event) {
    this.canvas.requestPointerLock();
    this.#isMouseDown = true;

    const mouse = this.#getMousePosition(event);
    this.#grabbedPoint = this.#hitTest(mouse);

    if (this.#grabbedPoint >= 0 && event.altKey) {
    }

    this.draw();
  }

  onMouseMove(event) {
    if (!this.#isMouseDown) {
      let prevFocused = this.#focusedPoint;
      this.#focusedPoint = this.#hitTest(this.#getMousePosition(event));
      if (prevFocused === this.#focusedPoint) return;
      if (this.#focusedPoint >= 0) this.#detailIndex = this.#focusedPoint;
    } else {
      if (this.#grabbedPoint < 0) return;

      const movementX = clamp(event.movementX, -24, 24);
      const movementY = clamp(event.movementY, -24, 24);

      const point = this.#controlPoints[this.#grabbedPoint];
      point.x = clamp(point.x + movementX, 1, this.canvas.width - 1);
      point.y = clamp(point.y + movementY, 0, this.canvas.height);

      for (let idx = 0; idx < this.#controlPoints.length; ++idx) {
        if (idx == this.#grabbedPoint) continue;
        if (this.#controlPoints[idx].x == point.x) point.x += 0.1;
      }

      this.#updateCoefficients();
    }
    this.draw();
  }

  onMouseUp(event) {
    document.exitPointerLock();
    this.#isMouseDown = false;
    this.onChangeFunc();
  }

  onMouseLeave(event) {
    this.onChangeFunc();
    this.draw();
  }

  onWheel(event) {
    event.preventDefault(); // Prevent page scrolling.

    if (event.deltaY == 0) return;

    this.#focusedPoint = this.#hitTest(this.#getMousePosition(event));
    if (this.#focusedPoint < 0) return;

    this.#detailIndex = this.#focusedPoint;

    const amount = event.deltaY > 0 ? 1 : -1;
    const sensi = event.shiftKey ? 0.01 : event.ctrlKey ? 1 : 0.2;

    this.draw();
  }

  draw() {
    const width = this.canvas.width;
    const height = this.canvas.height;

    // Background.
    this.context.fillStyle = palette.background;
    this.context.fillRect(0, 0, width, height);

    // Draw grid.
    this.context.lineWidth = 0.5;
    this.context.strokeStyle = "#f0f0f0";
    this.context.fillStyle = "#808080";
    this.context.font = `bold ${palette.fontSize * 3 / 4}px ${palette.fontFamily}`;
    const nGrid = 12;
    for (let idx = 1; idx < nGrid; ++idx) {
      const ratio = idx / nGrid;

      const x = ratio * width;
      const y = ratio * height;

      this.context.beginPath();
      this.context.moveTo(x, 0);
      this.context.lineTo(x, height);
      this.context.stroke();

      this.context.beginPath();
      this.context.moveTo(0, y);
      this.context.lineTo(width, y);
      this.context.stroke();

      // this.context.textAlign = "left";
      // this.context.textBaseline = "top";
      // this.context.fillText(`${idx}/${nGrid}`, x, 4);
      // this.context.textBaseline = "bottom";
      // this.context.fillText(`${idx}/${nGrid}`, x, height);

      // this.context.textBaseline = "middle";
      // this.context.textAlign = "left";
      // this.context.fillText(`${idx}/${nGrid}`, 0, y);
      // this.context.textAlign = "right";
      // this.context.fillText(`${idx}/${nGrid}`, width, y);
    }

    // Draw waveform.
    const mapPolyToY = (v, h) => (v + 0.5) * h;

    let poly = new Array(width + 1);
    for (let i = 0; i < poly.length; ++i) {
      poly[i] = computePolynomial(i / width, this.#coefficients);
    }

    this.context.lineWidth = 2;
    this.context.strokeStyle = "#202020";
    this.context.beginPath();
    this.context.moveTo(0, mapPolyToY(poly[0], height));
    for (let idx = 1; idx <= width; ++idx) {
      this.context.lineTo(idx, mapPolyToY(poly[idx], height));
    }
    this.context.stroke();

    // Draw normalized waveform.
    const nvWidth = this.normalizedView.width;
    const nvHeight = this.normalizedView.height;
    this.nvCtx.fillStyle = "#ffffff";
    this.nvCtx.fillRect(0, 0, nvWidth, nvHeight);

    this.nvCtx.lineWidth = 0.5;
    this.nvCtx.strokeStyle = "#e0e0e0";
    this.nvCtx.beginPath();
    this.nvCtx.moveTo(0, nvHeight / 2);
    this.nvCtx.lineTo(nvWidth, nvHeight / 2);
    this.nvCtx.stroke();

    this.nvCtx.lineWidth = 2;
    this.nvCtx.strokeStyle = "#000000";
    this.nvCtx.beginPath();

    let polyMax = 2.1 * poly.reduce((p, c) => Math.max(p, Math.abs(c)), 0);
    if (polyMax == 0) polyMax = 1;

    this.nvCtx.moveTo(0, mapPolyToY(poly[0] / polyMax, nvHeight));
    for (let idx = 1; idx <= width; ++idx) {
      this.nvCtx.lineTo(idx, mapPolyToY(poly[idx] / polyMax, nvHeight));
    }
    this.nvCtx.stroke();

    this.nvCtx.fillStyle = "#00000080";
    this.nvCtx.font = `${palette.fontSize}px ${palette.fontFamily}`;
    this.nvCtx.textBaseline = "top";
    this.nvCtx.textAlign = "center";
    this.nvCtx.fillText("Normalized", nvWidth / 2, palette.fontSize);

    // Draw control points.
    this.context.lineWidth = 2;
    for (let idx = 0; idx < this.#controlPoints.length; ++idx) {
      this.context.strokeStyle
        = this.#focusedPoint == idx ? "#00000044" : palette.overlay;
      this.context.beginPath();
      this.context.ellipse(
        this.#controlPoints[idx].x, this.#controlPoints[idx].y, this.#controlRadius,
        this.#controlRadius, 0, 0, 2 * Math.PI);
      this.context.stroke();

      this.context.beginPath();
      this.context.ellipse(
        this.#controlPoints[idx].x, this.#controlPoints[idx].y,
        this.#controlRadius * 0.42, this.#controlRadius * 0.42, 0, 0, 2 * Math.PI);
      this.context.stroke();
    }
  }
}
