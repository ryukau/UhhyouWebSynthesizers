// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {clamp} from "../util.js";

import {palette} from "./palette.js";

export class BezierEnvelopeView {
  #highlighted = null;
  #grabbed = null;
  #selectedPointIndex = 0;
  #focused = false;

  constructor(parent, width, height, bezierParameters, label, onChangeFunc) {
    this.param = bezierParameters;
    this.onChangeFunc = onChangeFunc;

    this.divContainer = document.createElement("div");
    this.divContainer.classList.add("bezierEnvelopeContainer");
    parent.appendChild(this.divContainer);

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
    this.divContainer.appendChild(this.liveRegion);

    this.label = document.createElement("label");
    this.label.textContent = label;
    this.label.tabIndex = 0;
    this.label.setAttribute("role", "button");
    const isLocked = this.param[0]?.lockRandomization ?? false;
    this.label.setAttribute("aria-pressed", isLocked ? "true" : "false");
    this.label.setAttribute("aria-label", `Lock randomization for ${label}`);

    const toggleLock = () => {
      if (this.param.length <= 0) return;
      const newState = !this.param[0].lockRandomization;
      for (let prm of this.param) prm.lockRandomization = newState;
      this.label.setAttribute("aria-pressed", newState ? "true" : "false");
      this.label.style.color = newState ? palette.inactive : "unset";
    };

    this.label.addEventListener("click", () => toggleLock(), false);
    this.label.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleLock();
      }
    }, false);
    this.divContainer.appendChild(this.label);

    this.divCanvasMargin = document.createElement("div");
    this.divCanvasMargin.classList.add("canvasMargin");
    this.divContainer.appendChild(this.divCanvasMargin);

    this.canvas = document.createElement("canvas");
    this.canvas.classList.add("envelopeView");
    this.canvas.ariaLabel = `${label}, canvas`;
    this.canvas.ariaDescription
      = "Use arrow keys to move control points. Press [ and ] or 1 to 9 to switch points.";
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.tabIndex = 0;
    this.canvas.addEventListener("pointerdown", (event) => this.onPointerDown(event), false);
    this.canvas.addEventListener("pointermove", (event) => this.onPointerMove(event), false);
    this.canvas.addEventListener("pointerup", (event) => this.onPointerUp(event), false);
    this.canvas.addEventListener("pointerleave", (e) => this.onPointerLeave(e), false);
    this.canvas.addEventListener("keydown", (event) => this.onKeyDown(event), false);
    this.canvas.addEventListener("focus", () => this.onFocus(), false);
    this.canvas.addEventListener("blur", () => this.onBlur(), false);
    this.divCanvasMargin.appendChild(this.canvas);
    this.context = this.canvas.getContext("2d");

    this.pointRadius = palette.fontSize / 2;
    this.setControlPoints(
      this.param[0].dsp, this.param[1].dsp, this.param[2].dsp, this.param[3].dsp);

    this.#highlighted = null;
    this.#grabbed = null;
    this.#selectedPointIndex = 0;
    this.#focused = false;

    window.matchMedia?.("(prefers-color-scheme: dark)")
      .addEventListener?.("change", () => this.draw());

    this.draw();
  }

  #announce(text) {
    if (!this.liveRegion) return;
    // Alternate invisible character to ensure screen readers re-announce identical strings.
    this.liveRegion.textContent = this.liveRegion.textContent === text ? `${text}\u00A0` : text;
  }

  #getPointCoordinates(index) {
    if (!this.points || !this.points[index]) return {x: "0.000", y: "0.000"};
    const px = this.param?.[index * 2];
    const py = this.param?.[index * 2 + 1];
    const xVal
      = px?.display ?? (this.canvas.width > 0 ? this.points[index].x / this.canvas.width : 0);
    const yVal
      = py?.display ?? (this.canvas.height > 0 ? this.points[index].y / this.canvas.height : 0);
    const xStr = typeof xVal === "number" ? xVal.toFixed(3) : String(xVal);
    const yStr = typeof yVal === "number" ? yVal.toFixed(3) : String(yVal);
    return {x: xStr, y: yStr};
  }

  #announcePointSelected(index) {
    const {x, y} = this.#getPointCoordinates(index);
    this.#announce(`Control point ${index + 1} selected: X ${x}, Y ${y}`);
  }

  #announcePointMoved(index) {
    const {x, y} = this.#getPointCoordinates(index);
    this.#announce(`Control point ${index + 1}: X ${x}, Y ${y}`);
  }

  setControlPoints(x1, y1, x2, y2) {
    this.points = [
      {x: x1 * this.canvas.width, y: y1 * this.canvas.height},
      {x: x2 * this.canvas.width, y: y2 * this.canvas.height},
    ];
  }

  #getMousePosition(event) {
    const rect = event.target.getBoundingClientRect();
    return {x: event.clientX - rect.left, y: event.clientY - rect.top};
  }

  grabPoint(mousePosition) {
    for (let point of this.points) {
      const dx = point.x - mousePosition.x;
      const dy = point.y - mousePosition.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      if (length <= this.pointRadius) { return point; }
    }
    return null;
  }

  onPointerDown(event) {
    this.#grabbed = this.grabPoint(this.#getMousePosition(event));
    if (this.#grabbed !== null) {
      this.#selectedPointIndex = this.points.indexOf(this.#grabbed);
      this.canvas.setPointerCapture(event.pointerId);
      this.canvas.style.cursor = "grabbing";
      this.draw();
      this.#announcePointSelected(this.#selectedPointIndex);
    }
  }

  onPointerMove(event) {
    if (this.#grabbed === null) {
      const prev = this.#highlighted;
      this.#highlighted = this.grabPoint(this.#getMousePosition(event));
      this.canvas.style.cursor = this.#highlighted !== null ? "grab" : "default";
      if (prev !== this.#highlighted) { this.draw(); }
      return;
    }

    this.#grabbed.x = clamp(this.#grabbed.x + event.movementX, 0, this.canvas.width);
    this.#grabbed.y = clamp(this.#grabbed.y + event.movementY, 0, this.canvas.height);
    this.#updateParameter();
    this.draw();
  }

  onPointerUp(event) {
    const wasDragging = this.#grabbed !== null;
    const movedIndex = this.#selectedPointIndex;
    this.canvas.releasePointerCapture(event.pointerId);
    this.#grabbed = null;
    this.#highlighted = this.grabPoint(this.#getMousePosition(event));
    this.canvas.style.cursor = this.#highlighted !== null ? "grab" : "default";
    this.onChangeFunc();
    this.draw();
    if (wasDragging) { this.#announcePointMoved(movedIndex); }
  }

  onPointerLeave(event) {
    this.#grabbed = null;
    this.#highlighted = null;
    this.canvas.style.cursor = "default";
    this.draw();
  }

  onFocus() {
    this.#focused = true;
    this.draw();
  }

  onBlur() {
    this.#focused = false;
    this.draw();
  }

  onKeyDown(event) {
    if (!this.points || this.points.length === 0) return;

    let handled = false;
    let selectedChanged = false;
    let moved = false;
    const step = event.shiftKey ? 10 : 1;
    const activePoint = this.points[this.#selectedPointIndex];

    switch (event.key) {
      case "[":
        this.#selectedPointIndex
          = (this.#selectedPointIndex - 1 + this.points.length) % this.points.length;
        handled = true;
        selectedChanged = true;
        break;
      case "]":
        this.#selectedPointIndex = (this.#selectedPointIndex + 1) % this.points.length;
        handled = true;
        selectedChanged = true;
        break;
      case "1":
      case "2":
      case "3":
      case "4":
      case "5":
      case "6":
      case "7":
      case "8":
      case "9": {
        const index = Number(event.key) - 1;
        if (index < this.points.length) {
          this.#selectedPointIndex = index;
          handled = true;
          selectedChanged = true;
        }
        break;
      }
      case "Home":
      case "PageUp":
        this.#selectedPointIndex = 0;
        handled = true;
        selectedChanged = true;
        break;
      case "End":
      case "PageDown":
        this.#selectedPointIndex = this.points.length - 1;
        handled = true;
        selectedChanged = true;
        break;
      case "ArrowLeft":
        activePoint.x = clamp(activePoint.x - step, 0, this.canvas.width);
        handled = true;
        moved = true;
        break;
      case "ArrowRight":
        activePoint.x = clamp(activePoint.x + step, 0, this.canvas.width);
        handled = true;
        moved = true;
        break;
      case "ArrowUp":
        activePoint.y = clamp(activePoint.y - step, 0, this.canvas.height);
        handled = true;
        moved = true;
        break;
      case "ArrowDown":
        activePoint.y = clamp(activePoint.y + step, 0, this.canvas.height);
        handled = true;
        moved = true;
        break;
    }

    if (handled) {
      event.preventDefault();
      this.#updateParameter();
      this.onChangeFunc();
      this.draw();
      if (moved) {
        this.#announcePointMoved(this.#selectedPointIndex);
      } else if (selectedChanged) {
        this.#announcePointSelected(this.#selectedPointIndex);
      }
    }
  }

  refresh() {
    const isLocked = this.param[0]?.lockRandomization ?? false;
    this.label.setAttribute("aria-pressed", isLocked ? "true" : "false");
    this.label.style.color = isLocked ? palette.inactive : "unset";
    this.setControlPoints(
      this.param[0].dsp, this.param[1].dsp, this.param[2].dsp, this.param[3].dsp);
    this.draw();
  }

  #updateParameter() {
    this.param[0].ui = this.points[0].x / this.canvas.width;
    this.param[1].ui = this.points[0].y / this.canvas.height;
    this.param[2].ui = this.points[1].x / this.canvas.width;
    this.param[3].ui = this.points[1].y / this.canvas.height;
  }

  random() {
    if (this.param[0]?.lockRandomization) { return; }
    for (let point of this.points) {
      point.x = this.canvas.width * Math.random();
      point.y = this.canvas.height * Math.random();
    }
    this.#updateParameter();
    this.draw();
  }

  draw() {
    const width = this.canvas.width;
    const height = this.canvas.height;

    // Background.
    this.context.fillStyle = palette.background;
    this.context.fillRect(0, 0, width, height);

    // Active control point for hover/touch/keyboard.
    let activePoint = this.#grabbed ?? this.#highlighted;
    if (activePoint === null && this.#focused) {
      activePoint = this.points[this.#selectedPointIndex];
    }

    // Display coordinate only when pointer or focus is on a control point.
    if (activePoint !== null) {
      const isStart = activePoint === this.points[0];
      const p = isStart
        ? `${this.param[0].display.toFixed(3)}, ${this.param[1].display.toFixed(3)}`
        : `${this.param[2].display.toFixed(3)}, ${this.param[3].display.toFixed(3)}`;
      const text = `${isStart ? "↖" : "↘"} ${p}`;

      this.context.fillStyle = palette.overlay;
      this.context.font = `${palette.fontWeightBase} ${palette.fontSize}px ${palette.fontFamily}`;
      this.context.fillText(text, palette.fontSize, height - palette.fontSize);
    }

    // Envelope curve.
    this.context.strokeStyle = palette.foreground;
    this.context.beginPath();
    this.context.moveTo(0, 0);
    this.context.bezierCurveTo(
      this.points[0].x, this.points[0].y, this.points[1].x, this.points[1].y, width, height);
    this.context.stroke();

    // Dashed lines to control points.
    this.context.strokeStyle = palette.overlay;
    this.context.setLineDash([2, 4]);
    this.context.beginPath();
    this.context.moveTo(0, 0);
    this.context.lineTo(this.points[0].x, this.points[0].y);
    this.context.stroke();
    this.context.beginPath();
    this.context.moveTo(width, height);
    this.context.lineTo(this.points[1].x, this.points[1].y);
    this.context.stroke();
    this.context.setLineDash([0]);

    // Draw control points.
    for (const point of this.points) {
      this.context.fillStyle = point === activePoint ? palette.overlay : palette.borderLight;
      this.context.beginPath();
      this.context.ellipse(point.x, point.y, this.pointRadius, this.pointRadius, 0, 0, 2 * Math.PI);
      this.context.fill();
    }
  }
}
