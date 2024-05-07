// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {palette} from "../common/gui/palette.js";
import {clamp} from "../common/util.js";

import {hitTestTriangle, vowelMesh} from "./formant.js";

export class FormantXYPad {
  #isMouseDown = false;
  #targetPos;
  #triangles;
  #triangleIndex = null;

  constructor(parent, width, height, label, parameterX, parameterY, onChangeFunc) {
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
    this.canvas.addEventListener(
      "pointerdown", (event) => this.onPointerDown(event), false);
    this.canvas.addEventListener(
      "pointermove", (event) => this.onPointerMove(event), false);
    this.canvas.addEventListener("pointerup", (event) => this.onPointerUp(event), false);
    this.canvas.addEventListener("pointerleave", (e) => this.onPointerLeave(e), false);
    this.divCanvasMargin.appendChild(this.canvas);
    this.context = this.canvas.getContext("2d");

    this.paramX = parameterX;
    this.paramY = parameterY;
    this.onChangeFunc = onChangeFunc;

    this.#setTriangle();
    this.#targetPos = {x: 0, y: this.canvas.height};
    this.refresh();
  }

  #setTriangle() { this.#triangles = vowelMesh(this.canvas.width, this.canvas.height); }

  #getMousePosition(event) {
    const rect = event.target.getBoundingClientRect();
    return {x: event.clientX - rect.left, y: event.clientY - rect.top};
  }

  #updateTarget() {
    this.#triangleIndex = null;
    for (let idx = 0; idx < this.#triangles.length; ++idx) {
      const tri = this.#triangles[idx];
      if (hitTestTriangle(this.#targetPos, tri[0], tri[1], tri[2])) {
        this.#triangleIndex = idx;
        break;
      }
    }
    if (this.#triangleIndex === null) return;

    this.paramX.ui = this.#targetPos.x / this.canvas.width;
    this.paramY.ui = this.#targetPos.y / this.canvas.height;
  }

  refresh() {
    this.#targetPos.x = clamp(this.paramX.ui * this.canvas.width, 0, this.canvas.width);
    this.#targetPos.y = clamp(this.paramY.ui * this.canvas.height, 0, this.canvas.height);
    this.draw();
  }

  onPointerDown(event) {
    this.canvas.setPointerCapture(event.pointerId);
    this.#isMouseDown = true;
    this.#targetPos = this.#getMousePosition(event);
    this.#updateTarget();
    this.draw();
  }

  onPointerMove(event) {
    if (!this.#isMouseDown) return;

    const movementX = clamp(event.movementX, -24, 24);
    const movementY = clamp(event.movementY, -24, 24);

    this.#targetPos.x = clamp(this.#targetPos.x + movementX, 0, this.canvas.width);
    this.#targetPos.y = clamp(this.#targetPos.y + movementY, 0, this.canvas.height);
    this.#updateTarget();

    this.draw();
  }

  onPointerUp(event) {
    this.canvas.releasePointerCapture(event.pointerId);
    this.#isMouseDown = false;
    this.onChangeFunc();
  }

  onPointerLeave(event) {
    this.#triangleIndex = null;
    this.draw();
  }

  draw() {
    const width = this.canvas.width;
    const height = this.canvas.height;

    // Background.
    this.context.fillStyle = palette.background;
    this.context.fillRect(0, 0, width, height);

    // Vowel.
    this.context.fillStyle = palette.foreground;
    this.context.font = `${palette.fontWeightBase} ${
      Math.ceil(palette.fontSize * 1.5)}px ${palette.fontMonospace}`;
    const margin = palette.fontSize / 4;

    this.context.textAlign = "left";
    this.context.textBaseline = "top";
    this.context.fillText("i", margin, margin);
    this.context.textBaseline = "middle";
    this.context.fillText("e", margin, height / 2);
    this.context.textBaseline = "bottom";
    this.context.fillText("a", margin, height - margin);

    this.context.textAlign = "right";
    this.context.textBaseline = "top";
    this.context.fillText("u", width - margin, margin);
    this.context.textBaseline = "bottom";
    this.context.fillText("o", width - margin, height - margin);

    if (this.#triangleIndex !== null && this.#isMouseDown) {
      // Triangle.
      this.context.fillStyle = "#c0c0c020";
      const tri = this.#triangles[this.#triangleIndex];
      this.context.beginPath();
      this.context.moveTo(tri[0].x, tri[0].y);
      this.context.lineTo(tri[1].x, tri[1].y);
      this.context.lineTo(tri[2].x, tri[2].y);
      this.context.closePath();
      this.context.fill();
    }

    // Target point.
    const radius = palette.fontSize / 2;
    this.context.fillStyle = "#00000088";
    this.context.beginPath();
    this.context.ellipse(
      this.#targetPos.x, this.#targetPos.y, radius, radius, 0, 0, 2 * Math.PI);
    this.context.fill();
  }
}
