// Copyright 2022 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {palette} from "../common/gui/palette.js";
import {clamp} from "../common/util.js";

export class FormatXYPad {
  #isMouseDown = false;
  #targetPos;

  constructor(parent, width, height, label, onChangeFunc) {
    this.divCanvasMargin = document.createElement("div");
    this.divCanvasMargin.classList.add("canvasMargin");
    parent.appendChild(this.divCanvasMargin);

    this.canvas = document.createElement("canvas");
    this.canvas.classList.add("envelopeView");
    this.canvas.ariaLabel = `${label}, canvas`;
    this.canvas.ariaDescription = "";
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.tabIndex = 0;
    this.canvas.addEventListener("mousedown", (event) => this.onMouseDown(event), false);
    this.canvas.addEventListener("mousemove", (event) => this.onMouseMove(event), false);
    this.canvas.addEventListener("mouseup", (event) => this.onMouseUp(event), false);
    this.canvas.addEventListener("mouseleave", (e) => this.onMouseLeave(e), false);
    this.divCanvasMargin.appendChild(this.canvas);
    this.context = this.canvas.getContext("2d");

    this.onChangeFunc = onChangeFunc;

    this.#targetPos = {x: 0, y: this.canvas.height};
    this.refresh();
  }

  #getMousePosition(event) {
    const rect = event.target.getBoundingClientRect();
    return {x: event.clientX - rect.left, y: event.clientY - rect.top};
  }

  refresh() {
    this.#targetPos.x = clamp(this.paramX.ui * this.canvas.width, 0, this.canvas.width);
    this.#targetPos.y = clamp(this.paramY.ui * this.canvas.height, 0, this.canvas.height);
    this.draw();
  }

  onMouseDown(event) {
    this.canvas.requestPointerLock();
    this.#isMouseDown = true;
    this.#targetPos = this.#getMousePosition(event);
    this.draw();
  }

  onMouseMove(event) {
    if (!this.#isMouseDown) return;

    const movementX = clamp(event.movementX, -24, 24);
    const movementY = clamp(event.movementY, -24, 24);

    this.#targetPos.x = clamp(this.#targetPos.x + movementX, 0, this.canvas.width);
    this.#targetPos.y = clamp(this.#targetPos.y + movementY, 0, this.canvas.height);

    this.draw();
  }

  onMouseUp(event) {
    document.exitPointerLock();
    this.#isMouseDown = false;
    this.onChangeFunc();
  }

  onMouseLeave(event) {
    this.#triangleIndex = null;
    this.draw();
  }

  draw() {
    const width = this.canvas.width;
    const height = this.canvas.height;

    // Background.
    this.context.fillStyle = palette.background;
    this.context.fillRect(0, 0, width, height);
  }
}
