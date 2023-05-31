// Copyright 2022 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {palette} from "../common/gui/palette.js";
import {clamp} from "../common/util.js";

import {tongueFunc} from "./tongue.js";

export class TongueXYPad {
  #position;
  #radius = palette.fontSize / 2;
  #grabbed;
  #pointingAt;

  constructor(
    parent,
    width,
    height,
    label,
    parameterX0,
    parameterY0,
    parameterW0,
    parameterX1,
    parameterY1,
    parameterW1,
    onChangeFunc) {
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

    this.params = [
      {x: parameterX0, y: parameterY0, width: parameterW0},
      {x: parameterX1, y: parameterY1, width: parameterW1},
    ];
    this.onChangeFunc = onChangeFunc;

    this.#grabbed = this.params.length;
    this.#pointingAt = this.params.length;
    this.refresh();
  }

  #getMousePosition(event) {
    const rect = event.target.getBoundingClientRect();
    return {x: event.clientX - rect.left, y: event.clientY - rect.top};
  }

  #hitTest(mousePos) {
    const r2 = this.#radius * this.#radius;
    for (let idx = 0; idx < this.#position.length; ++idx) {
      const dx = this.#position[idx].x - mousePos.x;
      const dy = this.#position[idx].y - mousePos.y;
      if (r2 >= dx * dx + dy * dy) return idx;
    }
    return this.#position.length;
  }

  refresh() {
    this.#position = this.params.map(pair => {
      return {
        x: clamp(pair.x.ui * this.canvas.width, 0, this.canvas.width),
        y: clamp((1 - pair.y.ui) * this.canvas.height, 0, this.canvas.height),
      };
    });

    this.draw();
  }

  onMouseDown(event) {
    const mouse = this.#getMousePosition(event);
    this.#grabbed = this.#hitTest(mouse);
    if (this.#grabbed >= this.#position.length) return;

    this.canvas.requestPointerLock();
    this.draw();
  }

  onMouseMove(event) {
    const mouse = this.#getMousePosition(event);

    this.#pointingAt = this.#hitTest(mouse);

    if (this.#grabbed < this.#position.length) {
      const movementX = clamp(event.movementX, -24, 24);
      const movementY = clamp(event.movementY, -24, 24);

      const position = this.#position[this.#grabbed];
      position.x = clamp(position.x + movementX, 0, this.canvas.width);
      position.y = clamp(position.y + movementY, 0, this.canvas.height);

      this.params[this.#grabbed].x.ui = position.x / this.canvas.width;
      this.params[this.#grabbed].y.ui = 1 - position.y / this.canvas.height;
    }

    this.draw();
  }

  onMouseUp(event) {
    document.exitPointerLock();
    this.#grabbed = this.#position.length;
    this.#pointingAt = this.#position.length;
    this.onChangeFunc();
  }

  onMouseLeave(event) { this.draw(); }

  #getTongueY(x) {
    let value = 0;
    for (let idx = 0; idx < this.params.length; ++idx) {
      const prm = this.params[idx];
      value = Math.max(value, tongueFunc(x, prm.x.ui, prm.y.ui, prm.width.ui));
    }
    return this.canvas.height * (1 - value);
  }

  draw() {
    const width = this.canvas.width;
    const height = this.canvas.height;

    // Background.
    this.context.fillStyle = palette.background;
    this.context.fillRect(0, 0, width, height);

    // Line.
    this.context.strokeStyle = palette.highlightMain;
    this.context.beginPath();
    this.context.moveTo(0, this.#getTongueY(0));
    for (let x = 1; x < this.canvas.width; ++x) {
      this.context.lineTo(x, this.#getTongueY(x / this.canvas.width, x));
    }
    this.context.stroke();

    // Target point.
    this.context.font = `bold ${palette.fontSize}px ${palette.fontFamily}`;
    for (let idx = 0; idx < this.#position.length; ++idx) {
      this.context.fillStyle = idx == this.#grabbed ? "#3388ff"
        : idx == this.#pointingAt                   ? palette.highlightAccent
                                                    : "#00000088";
      this.context.beginPath();
      this.context.ellipse(
        this.#position[idx].x, this.#position[idx].y, this.#radius, this.#radius, 0, 0,
        2 * Math.PI);
      this.context.fill();

      this.context.textAlign = "center";
      this.context.textBaseline = "middle";
      this.context.fillText(
        `${idx}`, this.#position[idx].x, this.#position[idx].y - palette.fontSize);
    }
  }
}
