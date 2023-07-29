// Copyright 2022 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {getSosGain, selectSosFilter, sosFilterType} from "../common/dsp/sos.js";
import {palette} from "../common/gui/palette.js";
import {clamp, dbToAmp} from "../common/util.js";

export class EqualizerXYPad {
  #isMouseDown = false;
  #section;
  #sampleRate;
  #controlRadius = 16;
  #detailIndex = 0;
  #focusedPoint = -1;
  #grabbedPoint = -1;
  #nyquistX;

  constructor(
    parent,
    sampleRate,
    width,
    height,
    label,
    scaleCutoffHz,
    scaleQ,
    scaleGain,
    parameters,
    onChangeFunc,
  ) {
    this.scaleCutoffHz = scaleCutoffHz;
    this.scaleQ = scaleQ;
    this.scaleGain = scaleGain;
    this.param = parameters;

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

    this.spanIndex = this.#addSpan("Index");
    this.divContainer.appendChild(this.spanIndex);
    this.inputIndex = this.#addInput("Index", "Index of equalizer control point.");
    this.inputIndex.min = 0;
    this.inputIndex.max = 0;
    this.inputIndex.step = 1;
    this.inputIndex.value = 0;
    this.divContainer.appendChild(this.inputIndex);

    this.spanCutoffHz = this.#addSpan("Cutoff [Hz]");
    this.divContainer.appendChild(this.spanCutoffHz);
    this.inputCutoffHz
      = this.#addInput("Cutoff Hz", "Cutoff in Hz for an equalizer control point.");
    this.inputCutoffHz.min = this.scaleCutoffHz.minDsp;
    this.inputCutoffHz.max = this.scaleCutoffHz.maxDsp;
    this.inputCutoffHz.step = "any";
    this.inputCutoffHz.value = 100;
    this.divContainer.appendChild(this.inputCutoffHz);

    this.spanQ = this.#addSpan("Q");
    this.divContainer.appendChild(this.spanQ);
    this.inputQ = this.#addInput("Q", "Q for an equalizer control point.");
    this.inputQ.min = this.scaleQ.minDsp;
    this.inputQ.max = this.scaleQ.maxDsp;
    this.inputQ.step = "any";
    this.inputQ.value = Math.SQRT1_2;
    this.divContainer.appendChild(this.inputQ);

    this.spanGainDB = this.#addSpan("Gain [dB]");
    this.divContainer.appendChild(this.spanGainDB);
    this.inputGainDB
      = this.#addInput("Gain dB", "Gain in decibel for an equalizer control point.");
    this.inputGainDB.min = this.scaleGain.minUi;
    this.inputGainDB.max = this.scaleGain.maxUi;
    this.inputGainDB.step = "any";
    this.inputGainDB.value = 0.0;
    this.divContainer.appendChild(this.inputGainDB);

    this.inputIndex.addEventListener("input", (e) => this.#inputCallback(e), false);
    this.inputCutoffHz.addEventListener("input", (e) => this.#inputCallback(e), false);
    this.inputQ.addEventListener("input", (e) => this.#inputCallback(e), false);
    this.inputGainDB.addEventListener("input", (e) => this.#inputCallback(e), false);

    this.onChangeFunc = onChangeFunc;

    this.leftHz = this.scaleCutoffHz.minDsp;
    this.rightHz = this.scaleCutoffHz.maxDsp;
    this.topDB = this.scaleGain.maxUi;
    this.bottomDB = this.scaleGain.minUi;
    const logLeft = Math.log2(this.leftHz);
    const logRight = Math.log2(this.rightHz);
    const logRange = logRight - logLeft;
    this.mapHzToX = hz => (Math.log2(hz) - logLeft) * width / logRange;
    this.mapDbToY = dB => ((this.topDB - dB) / (this.topDB - this.bottomDB)) * height;
    this.mapYToDb = y => this.topDB - y * (this.topDB - this.bottomDB) / height;
    this.mapXToHz = x => Math.pow(2, (x * logRange / width + logLeft));
    this.getGainY = hz => {
      const gainDB = getSosGain(this.sos(), hz / this.#sampleRate, true);
      return this.mapDbToY(gainDB);
    };
    this.#nyquistX = this.mapHzToX(0.5 * sampleRate);

    this.#sampleRate = sampleRate;
    this.#section = [];
    this.addSection(
      sosFilterType.hp2mt, this.param[0][0].dsp, this.param[0][1].dsp,
      this.param[0][2].ui);
    this.addSection(
      sosFilterType.lp2bq, this.param[1][0].dsp, this.param[1][1].dsp,
      this.param[1][2].ui);
    for (let idx = 2; idx < this.param.length; ++idx) {
      this.addSection(
        sosFilterType.pk2mt, this.param[idx][0].dsp, this.param[idx][1].dsp,
        this.param[idx][2].ui);
    }

    this.refresh();
  }

  #addSpan(label) {
    let span = document.createElement("span");
    span.classList.add("equalizer");
    span.textContent = label;
    span.style.textAlign = "left";
    return span;
  }

  #addInput(label, description) {
    let input = document.createElement("input");
    input.classList.add("equalizer");
    input.ariaLabel = label + ", value input";
    input.ariaDescription = description;
    input.type = "number";
    return input;
  }

  #inputCallback(event) {
    this.#detailIndex = Math.floor(this.inputIndex.value);

    const sc = this.#section[this.#detailIndex];
    sc.cutoff = Math.min(this.inputCutoffHz.value / this.#sampleRate, 0.5);
    sc.Q = this.inputQ.value;
    sc.gainDB = this.inputGainDB.value;
    sc.x = this.mapHzToX(this.inputCutoffHz.value);
    sc.y = this.mapDbToY(this.inputGainDB.value);

    this.#updateParameters(this.#detailIndex);
    this.onChangeFunc();
    this.draw();
  }

  #refreshInternal(index) {
    this.inputIndex.value = index;

    const sc = this.#section[index];
    this.inputCutoffHz.value = sc.cutoff * this.#sampleRate;
    this.inputQ.value = sc.Q;
    this.inputGainDB.value = sc.gainDB;

    this.#updateParameters(index);
  }

  #updateParameters(index) {
    if (index >= this.#section.length || index >= this.param.length) return;
    const sc = this.#section[index];
    const param = this.param[index];
    param[0].dsp = sc.cutoff * this.#sampleRate;
    param[1].dsp = sc.Q;
    param[2].ui = sc.gainDB;
  }

  refresh() {
    for (let index = 0; index < this.param.length; ++index) {
      const sc = this.#section[index];
      const param = this.param[index];
      sc.cutoff = param[0].dsp / this.#sampleRate;
      sc.Q = param[1].dsp;
      sc.gainDB = param[2].ui;
      sc.x = this.mapHzToX(sc.cutoff * this.#sampleRate);
      sc.y = this.mapDbToY(sc.gainDB);
      this.#refreshInternal(index);
    }
    this.draw();
  }

  #getMousePosition(event) {
    const rect = event.target.getBoundingClientRect();
    return {x: event.clientX - rect.left, y: event.clientY - rect.top};
  }

  addSection(filterType, cutoffHz, Q, gainDB) {
    const cut = cutoffHz / this.#sampleRate;
    this.#section.push({
      type: filterType,
      cutoff: cut,
      Q: Q,
      gainDB: gainDB,
      x: this.mapHzToX(cutoffHz),
      y: this.mapDbToY(gainDB),
    });
  }

  sos() {
    let sos = [];
    for (let sc of this.#section) {
      sos.push(selectSosFilter(sc.type)(sc.cutoff, sc.Q, dbToAmp(sc.gainDB)));
    }
    return sos;
  }

  #hitTest(mouse) {
    for (let index = 0; index < this.#section.length; ++index) {
      const dx = this.#section[index].x - mouse.x;
      const dy = this.#section[index].y - mouse.y;
      if (dx * dx + dy * dy > this.#controlRadius * this.#controlRadius) continue;
      return index;
    }
    return -1;
  }

  onMouseDown(event) {
    this.canvas.requestPointerLock();
    this.#isMouseDown = true;

    const mouse = this.#getMousePosition(event);
    this.#grabbedPoint = this.#hitTest(mouse);

    if (this.#grabbedPoint >= 0 && event.altKey) {
      this.#section[this.#grabbedPoint].gainDB = 0;
      this.#refreshInternal(this.#grabbedPoint);
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

      const sc = this.#section[this.#grabbedPoint];
      sc.x = clamp(sc.x + movementX, 0, this.#nyquistX);
      sc.y = clamp(sc.y + movementY, 0, this.canvas.height);
      sc.cutoff = this.mapXToHz(sc.x) / this.#sampleRate;
      sc.gainDB = this.mapYToDb(sc.y);
    }
    this.#refreshInternal(this.#detailIndex);
    this.draw();
  }

  onMouseUp(event) {
    document.exitPointerLock();
    this.#isMouseDown = false;
    this.onChangeFunc();
  }

  onMouseLeave(event) { this.draw(); }

  onWheel(event) {
    event.preventDefault(); // Prevent page scrolling.

    if (event.deltaY == 0) return;

    this.#focusedPoint = this.#hitTest(this.#getMousePosition(event));
    if (this.#focusedPoint < 0) return;

    this.#detailIndex = this.#focusedPoint;

    const amount = event.deltaY > 0 ? 1 : -1;
    const sensi = event.shiftKey ? 0.01 : event.ctrlKey ? 1 : 0.2;
    // let Q = this.#section[this.#focusedPoint].Q + sensi * amount;
    let Q = this.#section[this.#focusedPoint].Q * Math.exp(amount * sensi);
    this.#section[this.#focusedPoint].Q
      = clamp(Q, this.scaleQ.minDsp, this.scaleQ.maxDsp);

    this.#refreshInternal(this.#detailIndex);
    this.draw();
  }

  draw() {
    const width = this.canvas.width;
    const height = this.canvas.height;

    // Background.
    this.context.fillStyle = palette.background;
    this.context.fillRect(0, 0, width, height);

    // Darken over Nyquist region.
    this.context.fillStyle = "#f8f8f8";
    this.context.fillRect(this.#nyquistX, 0, width, height);

    // Draw frequency grid.
    this.context.lineWidth = 0.5;
    this.context.strokeStyle = "#f0f0f0";
    this.context.fillStyle = "#808080";
    this.context.font = `bold ${palette.fontSize * 3 / 4}px ${palette.fontFamily}`;
    let gridHz = this.leftHz;
    gridOuterLoop: while (gridHz <= this.rightHz) {
      const labelX = this.mapHzToX(gridHz);
      this.context.textAlign = "left";
      // this.context.textBaseline = "top";
      // this.context.fillText(`↖${gridHz} Hz`, labelX, 4);
      this.context.textBaseline = "bottom";
      this.context.fillText(`↙${gridHz} Hz`, labelX, height);

      for (let index = 1; index < 10; ++index) {
        const x = this.mapHzToX(index * gridHz);
        this.context.beginPath();
        this.context.moveTo(x, 0);
        this.context.lineTo(x, height);
        this.context.stroke();
        if (gridHz >= this.rightHz) break gridOuterLoop;
      }
      gridHz *= 10;
    }

    // Draw gain grid.
    const intervalDB = 6;
    let gridDB = this.bottomDB + intervalDB;
    while (gridDB < this.topDB) {
      const y = this.mapDbToY(gridDB);

      this.context.textBaseline = "middle";
      this.context.textAlign = "left";
      this.context.fillText(`${gridDB} dB`, 0, y);
      this.context.textAlign = "right";
      this.context.fillText(`${gridDB} dB`, width, y);

      this.context.beginPath();
      this.context.moveTo(0, y);
      this.context.lineTo(width, y);
      this.context.stroke();

      gridDB += intervalDB;
    }

    // Emphasize 0 dB line.
    this.context.strokeStyle = "#303030";
    this.context.beginPath();
    this.context.moveTo(0, this.mapDbToY(0));
    this.context.lineTo(width, this.mapDbToY(0));
    this.context.stroke();

    // Draw gain response.
    this.context.lineWidth = 2;
    this.context.strokeStyle = "#1060ff";
    this.context.beginPath();
    this.context.moveTo(-10, this.getGainY(this.mapXToHz(0)));
    const upSample = 8;
    const nyquist = 0.5 * this.#sampleRate;
    for (let i = 1; i <= upSample * width; ++i) {
      const x = i / upSample;
      const hz = this.mapXToHz(x);
      if (hz >= nyquist) break;
      this.context.lineTo(x, this.getGainY(hz));
    }
    this.context.stroke();

    // Draw control points.
    for (let idx = 0; idx < this.#section.length; ++idx) {
      this.context.fillStyle = this.#focusedPoint == idx ? "#00000044" : palette.overlay;
      this.context.beginPath();
      this.context.ellipse(
        this.#section[idx].x, this.#section[idx].y, this.#controlRadius,
        this.#controlRadius, 0, 0, 2 * Math.PI);
      this.context.fill();

      this.context.fillStyle = "#ffffff";
      this.context.font = `bold ${palette.fontSize}px ${palette.fontFamily}`;
      this.context.textBaseline = "middle";
      this.context.textAlign = "center";
      let label = `${idx}`;
      if (idx == 0) label += ".H";
      if (idx == 1) label += ".L";
      this.context.fillText(label, this.#section[idx].x, this.#section[idx].y);
    }
  }
}
