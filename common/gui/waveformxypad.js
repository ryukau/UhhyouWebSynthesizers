// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {clamp, computePolynomial} from "../util.js";

import {palette} from "./palette.js";

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

/**
`WaveformXYPad` does not take parameters, but only returns polynomial coefficients from
`coefficients()` method.

This is because of randomization. It requires one of the following conversions:

1. From `#controlPoints` to polynomial coefficients.
2. From polynomial coefficients to `#controlPoints`.

Conversion 2 is not implemented for now, because it requires to solve some math problem.
*/
export class WaveformXYPad {
  #isMouseDown = false;
  #controlRadius = 8;
  #controlPoints;
  #detailIndex = 0;
  #focusedPoint = -1;
  #grabbedPoint = -1;
  #coefficients;
  #normalizeGain = 1;
  #lockRandomization = false;

  constructor(
    parent,
    label,
    width,
    height,
    polyOrder,
    onChangeFunc,
  ) {
    console.assert(polyOrder > 0, "BarBox parameter is empty.", new Error());

    this.divContainer = document.createElement("div");
    this.divContainer.classList.add("equalizerContainer");
    parent.appendChild(this.divContainer);

    this.label = document.createElement("label");
    this.label.classList.add("barbox");
    this.label.textContent = label;
    this.label.addEventListener("pointerdown", (event) => {
      this.#lockRandomization = !this.#lockRandomization;
      this.label.style.color = this.#lockRandomization ? palette.inactive : "unset";
    }, false);
    this.divContainer.appendChild(this.label);

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
    this.canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e), false);
    this.canvas.addEventListener("pointermove", (e) => this.onPointerMove(e), false);
    this.canvas.addEventListener("pointerup", (e) => this.onPointerUp(e), false);
    this.canvas.addEventListener("pointerleave", (e) => this.onPointerLeave(e), false);
    this.canvas.addEventListener("wheel", (e) => this.onWheel(e), false);
    this.canvas.addEventListener("keydown", (e) => this.onKeyDown(e), false);
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
    this.setControlPoints();

    this.#coefficients = new Array(this.#controlPoints.length + 2).fill(0);

    this.#updateCoefficients();
    this.refresh();
  }

  setControlPoints(waveform) {
    const triangle = (t) => {
      // Output amplitude is in [0, 1]. Starting amp is 0.5, then rise, fall, rise.
      t += 0.75;
      t -= Math.floor(t);
      return Math.abs(2 * t - 1);
    };

    for (let idx = 0; idx < this.#controlPoints.length; ++idx) {
      const ratio = (idx + 1) / (this.#controlPoints.length + 1);

      if (waveform === "sawtooth") {
        this.#controlPoints[idx] = {
          x: ratio * this.canvas.width,
          y: ratio * this.canvas.height,
        };
      } else if (waveform === "pulse") {
        this.#controlPoints[idx] = {
          x: ratio * this.canvas.width,
          y: idx <= 0 ? 0 : this.canvas.height / 2,
        };
      } else if (waveform === "triangle") {
        this.#controlPoints[idx] = {
          x: ratio * this.canvas.width,
          y: triangle(ratio) * this.canvas.height,
        };
      } else if (waveform === "trapezoid") {
        this.#controlPoints[idx] = {
          x: ratio * this.canvas.width,
          y: clamp(1.5 * triangle(ratio) - 0.25, 0, 1) * this.canvas.height,
        };
      } else if (waveform === "fmA") {
        this.#controlPoints[idx] = {
          x: ratio * this.canvas.width,
          y: (Math.sin(2 * Math.PI * ratio + 4 * Math.sin(2 * Math.PI * ratio)) + 1)
            * this.canvas.height / 2,
        };
      } else if (waveform === "fmB") {
        this.#controlPoints[idx] = {
          x: ratio * this.canvas.width,
          y: (Math.sin(2 * Math.PI * ratio + Math.sin(2 * Math.PI * ratio)) + 1)
            * this.canvas.height / 2,
        };
      } else if (waveform === "alternate") {
        this.#controlPoints[idx] = {
          x: ratio * this.canvas.width,
          y: (idx % 2) * this.canvas.height,
        };
      } else if (waveform === "chirp") {
        this.#controlPoints[idx] = {
          x: 10 ** (-2 * ratio) * this.canvas.width,
          y: (idx % 2) * this.canvas.height,
        };
      } else { // "sine"
        this.#controlPoints[idx] = {
          x: ratio * this.canvas.width,
          y: (Math.sin(2 * Math.PI * ratio) + 1) * this.canvas.height / 2,
        };
      }
    }

    this.#updateCoefficients();
    this.refresh();
  }

  refresh() { this.draw(); }

  coefficients(normalize = true) {
    let co = structuredClone(this.#coefficients);
    if (!normalize) return co;

    for (let i = 0; i < co.length; ++i) co[i] *= this.#normalizeGain;
    return co;
  }

  #updateCoefficients() {
    const size = this.#controlPoints.length + 2;

    let ctrlPoints = structuredClone(this.#controlPoints);
    ctrlPoints.sort((p, q) => p.x - q.x);

    let b = new Array(size).fill(0);
    let polyX = new Array(size).fill(0);
    polyX[size - 1] = 1;
    for (let i = 1; i < size - 1; ++i) {
      b[i] = (ctrlPoints[i - 1].y - this.canvas.height * 0.5) / this.canvas.height;
      polyX[i] = ctrlPoints[i - 1].x / this.canvas.width;
    }

    // A[n] = [x[n]^0, x[n]^1, x[n]^2, x[n]^3, ...].
    let A = new Array(size);
    for (let i = 0; i < size; ++i) A[i] = new Array(size);
    A[0].fill(0);
    A[0][0] = 1;
    A.at(-1).fill(1);
    for (let i = 1; i < size - 1; ++i) {
      for (let j = 0; j < size; ++j) A[i][j] = polyX[i] ** j;
    }

    this.#coefficients = solve(A, b, size);

    // From here, it starts finding normalization gain.
    // `d1` is 1st order derivative of target polynomial.
    let d1 = new Array(this.#coefficients.length - 1);
    for (let i = 0; i < d1.length; ++i) d1[i] = (i + 1) * this.#coefficients[i + 1];

    let peaks = [];
    let getPeakPoint
      = (x) => { return {x: x, y: Math.abs(computePolynomial(x, this.#coefficients))}; };
    for (let i = 0; i < polyX.length - 1; ++i) {
      // Binary search. L: left, M: mid, R: right.
      let xL = polyX[i];
      let xR = polyX[i + 1];
      let xM;

      let iter = 0;
      do {
        let yL = computePolynomial(xL, d1);
        let yR = computePolynomial(xR, d1);

        let signL = Math.sign(yL);
        let signR = Math.sign(yR);
        if (signL === signR) {
          const pkL = getPeakPoint(xL);
          const pkR = getPeakPoint(xR);
          peaks.push(pkL.y >= pkR.y ? pkL : pkR);
          break;
        }

        xM = 0.5 * (xR + xL);
        let yM = computePolynomial(xM, d1);

        let signM = Math.sign(yM);
        if (signM === 0) {
          peaks.push(getPeakPoint(xM));
          break;
        } else if (signL === signM) {
          xL = xM;
        } else if (signR === signM) {
          xR = xM;
        }
      } while (++iter < 53); // 53 is number of significand bits in double float.

      if (iter >= 53) peaks.push(getPeakPoint(xM));
    }

    // Find max peak.
    let maxPeak = peaks[0].y;
    for (let i = 1; i < peaks.length; ++i) {
      if (maxPeak < peaks[i].y) maxPeak = peaks[i].y;
    }

    this.#normalizeGain = maxPeak > Number.MIN_VALUE ? 0.5 / maxPeak : 1;
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
    if (this.#lockRandomization) return;

    const length = this.#controlPoints.length;
    for (let idx = 0; idx < length; ++idx) {
      const pt = this.#controlPoints[idx];
      pt.x = 0.5 * (1 - Math.cos(Math.PI * (idx + 1) / (length + 1))) * this.canvas.width;
      pt.y = Math.random() * this.canvas.height;
    }
    this.#updateCoefficients();
  }

  onPointerDown(event) {
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.focus();
    this.#isMouseDown = true;

    const mouse = this.#getMousePosition(event);
    this.#grabbedPoint = this.#hitTest(mouse);

    if (this.#grabbedPoint >= 0 && event.altKey) {
    }

    this.draw();
  }

  onPointerMove(event) {
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
        if (Math.abs(this.#controlPoints[idx].x - point.x) > 1e-5) continue;
        point.x += 0.1;
        break;
      }

      this.#updateCoefficients();
    }
    this.draw();
  }

  onPointerUp(event) {
    this.canvas.releasePointerCapture(event.pointerId);
    this.#isMouseDown = false;
    this.onChangeFunc();
  }

  onPointerLeave(event) { this.draw(); }

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

  onKeyDown(event) {
    if (event.key === "r") {
      this.randomize();
      this.draw();
    } else if (event.key === "1") {
      this.setControlPoints("sine");
    } else if (event.key === "2") {
      this.setControlPoints("fmA");
    } else if (event.key === "3") {
      this.setControlPoints("fmB");
    } else if (event.key === "4") {
      this.setControlPoints("sawtooth");
    } else if (event.key === "5") {
      this.setControlPoints("triangle");
    } else if (event.key === "6") {
      this.setControlPoints("trapezoid");
    } else if (event.key === "7") {
      this.setControlPoints("alternate");
    } else if (event.key === "8") {
      this.setControlPoints("pulse");
    } else if (event.key === "9") {
      this.setControlPoints("chirp");
    } else {
      return;
    }

    this.onChangeFunc();
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
    // this.context.font = `${palette.fontWeightBase} ${palette.fontSize}px
    //   ${palette.fontFamily}`;
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
    this.nvCtx.font
      = `${palette.fontWeightBase} ${palette.fontSize}px ${palette.fontFamily}`;
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
