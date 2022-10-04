import {clamp} from "../util.js";

import {palette} from "./palette.js";

export class BezierEnvelopeView {
  #highlighted = null;
  #grabbed = null;

  constructor(parent, width, height, bezierParameters, label, onChangeFunc) {
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

    this.param = bezierParameters; // Array of [x1, y1, x2, y2].
    this.label = label;
    this.onChangeFunc = onChangeFunc;

    this.pointRadius = palette.fontSize / 2;
    this.setControlPoints(
      this.param[0].dsp, this.param[1].dsp, this.param[2].dsp, this.param[3].dsp);

    this.#highlighted = null;
    this.#grabbed = null;

    this.draw();
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
      if (length <= this.pointRadius) return point;
    }
    return null;
  }

  onMouseDown(event) {
    this.#grabbed = this.grabPoint(this.#getMousePosition(event));
    if (this.#grabbed !== null) this.canvas.requestPointerLock();
  }

  onMouseMove(event) {
    if (this.#grabbed === null) {
      const prev = this.#highlighted;
      this.#highlighted = this.grabPoint(this.#getMousePosition(event));

      // Draw only if internal state is changed.
      if (prev !== this.#highlighted) this.draw();

      return;
    }

    this.#grabbed.x = clamp(this.#grabbed.x + event.movementX, 0, this.canvas.width);
    this.#grabbed.y = clamp(this.#grabbed.y + event.movementY, 0, this.canvas.height);
    this.#updateParameter();
    this.draw();
  }

  onMouseUp(event) {
    document.exitPointerLock();
    this.#grabbed = null;
    this.onChangeFunc();
    this.draw();
  }

  onMouseLeave(event) {
    this.#grabbed = null;
    this.#highlighted = null;
    this.draw();
  }

  refresh() {
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

    // Label.
    this.context.fillStyle = palette.overlay;
    this.context.font = `${palette.fontSize}px ${palette.fontFamily}`;
    this.context.fillText(this.label, palette.fontSize, height - palette.fontSize);

    // Envelope curve.
    this.context.strokeStyle = palette.foreground;
    this.context.beginPath();
    this.context.moveTo(0, 0);
    this.context.bezierCurveTo(
      this.points[0].x, this.points[0].y, this.points[1].x, this.points[1].y, width,
      height);
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

    // draw control points.
    for (const point of this.points) {
      this.context.fillStyle = point === this.#highlighted || point === this.#grabbed
        ? palette.overlay
        : "#c0c0c088";
      this.context.beginPath();
      this.context.ellipse(
        point.x, point.y, this.pointRadius, this.pointRadius, 0, 0, 2 * Math.PI);
      this.context.fill();
    }
  }
}
