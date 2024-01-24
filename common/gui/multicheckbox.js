// Copyright 2022 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {palette} from "./palette.js";

export class MultiCheckBoxVertical {
  #isMouseDown = false;
  #paramIndex = -1;
  #paintValue = 0;

  constructor(parent, label, valueNames, width, parameters, onChangeFunc) {
    this.valueNames = valueNames;
    this.onChangeFunc = onChangeFunc;
    this.labelHeight = 2 * palette.fontSize;
    this.param = parameters;

    this.divContainer = document.createElement("div");
    this.divContainer.classList.add("barboxContainer");
    parent.appendChild(this.divContainer);

    this.label = document.createElement("label");
    this.label.classList.add("barbox");
    this.label.textContent = label;
    this.label.addEventListener("pointerdown", (event) => {
      if (this.param.length <= 0) return;

      // Change the all the states from a single source for consistency.
      const newState = !this.param[0].lockRandomization;
      for (let prm of this.param) prm.lockRandomization = newState;

      this.label.style.color = newState ? palette.inactive : "unset";
    }, false);
    this.divContainer.appendChild(this.label);

    this.divCanvasMargin = document.createElement("div");
    this.divCanvasMargin.classList.add("canvasMargin");
    this.divContainer.appendChild(this.divCanvasMargin);

    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = (valueNames.length + 1) * this.labelHeight;
    this.canvas.tabIndex = 0;
    this.canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e), false);
    this.canvas.addEventListener("pointerup", (e) => this.onPointerUp(e), false);
    this.canvas.addEventListener("pointermove", (e) => this.onPointerMove(e), false);
    this.canvas.addEventListener("pointerleave", (e) => this.onPointerLeave(e), false);
    this.divCanvasMargin.appendChild(this.canvas);
    this.context = this.canvas.getContext("2d");

    this.draw();
  }

  draw() {
    const width = this.canvas.width;
    const height = this.canvas.height;

    // Background.
    this.context.fillStyle = palette.background;
    this.context.fillRect(0, 0, width, height);

    // Text.
    const labelLeft = 2 * this.labelHeight;
    this.context.font
      = `${palette.fontWeightBase} ${palette.fontSize}px ${palette.fontMonospace}`;
    this.context.fillStyle = palette.foreground;
    this.context.textAlign = "start";
    this.context.textBaseline = "middle";
    for (let idx = 0; idx < this.valueNames.length; ++idx) {
      this.context.fillText(
        `${this.valueNames[idx]}`, labelLeft, (idx + 1) * this.labelHeight);
    }

    // Check marks.
    for (let idx = 0; idx < this.param.length; ++idx) {
      this.context.fillText(
        this.param[idx].normalized <= Number.EPSILON ? "🔲" : "☑️", labelLeft / 2,
        (idx + 1) * this.labelHeight);
    }

    // Highlight.
    if (this.#paramIndex >= 0 && this.#paramIndex < this.param.length) {
      this.context.fillStyle = palette.overlayHighlight;
      this.context.fillRect(
        0, (this.#paramIndex + 0.5) * this.labelHeight, width, this.labelHeight);
    }
  }

  #getMousePosition(event) {
    const rect = event.target.getBoundingClientRect();
    return {x: event.clientX - rect.left, y: event.clientY - rect.top};
  }

  #getIndexFromPoint(point) {
    const y = point.y - this.labelHeight / 2;
    const index = Math.floor(y / this.labelHeight);
    return 0 <= index && index < this.param.length ? index : -1;
  }

  refresh() { this.draw(); }

  onPointerDown(event) {
    this.#isMouseDown = true;

    const mouse = this.#getMousePosition(event);
    this.#paramIndex = this.#getIndexFromPoint(mouse);

    this.#paintValue = this.param[this.#paramIndex].normalized <= Number.EPSILON ? 1 : 0;
    this.param[this.#paramIndex].normalized = this.#paintValue;

    this.draw();
  }

  onPointerMove(event) {
    const mouse = this.#getMousePosition(event);
    const newIndex = this.#getIndexFromPoint(mouse);
    if (newIndex == this.#paramIndex) return;
    this.#paramIndex = newIndex;

    if (this.#isMouseDown) this.param[this.#paramIndex].normalized = this.#paintValue;

    this.draw();
  }

  onPointerUp(event) {
    this.#isMouseDown = false;
    this.onChangeFunc();
  }

  onPointerLeave(event) {
    this.#paramIndex = -1;
    if (this.#isMouseDown) {
      this.#isMouseDown = false;
      this.onChangeFunc();
    }
    this.draw();
  }
}
