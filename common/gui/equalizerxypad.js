// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {
  computeSosAutoGain,
  getSosGain,
  selectSosFilter,
} from "../dsp/sos.js";
import {clamp, dbToAmp} from "../util.js";

import {palette} from "./palette.js";

const filterTypeBadges = {
  lp2bq: "L",
  hp2bq: "H",
  bp2bq: "B",
  nt2bq: "N",
  ap2bq: "A",
  pk2bq: "P",
  ls2bq: "LS",
  hs2bq: "HS",
  lp2mt: "L",
  hp2mt: "H",
  pk2mt: "P",
  bp2mt: "B",
  hs1mt: "HS",
  lp1ema: "L",
  hp1ema: "H",
  ap1ema: "A",
  ls1ema: "LS",
  hs1ema: "HS",
  pk2ema: "P",
  lp1blt: "L",
  hp1blt: "H",
  ap1blt: "A",
  ls1blt: "LS",
  hs1blt: "HS",
  pk2blt: "P",
};

const noGainTypes = [
  "lp2bq", "hp2bq", "bp2bq", "ap2bq", "nt2bq", "lp2mt", "hp2mt", "bp2mt", "lp1ema", "hp1ema",
  "ap1ema", "lp1blt", "hp1blt", "ap1blt"
];

const noQTypes = [
  "hs1mt", "lp1ema", "hp1ema", "ls1ema", "hs1ema", "ap1ema", "lp1blt", "hp1blt", "ls1blt", "hs1blt",
  "ap1blt"
];

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
    label,
    width,
    height,
    parameters,
    onChangeFunc,
    options = {},
  ) {
    this.param = parameters;
    this.onChangeFunc = onChangeFunc;

    this.scaleCutoffHz = options.scaleCutoffHz ?? parameters[0]?.[1]?.scale;
    this.scaleQ = options.scaleQ ?? parameters[0]?.[2]?.scale;
    this.scaleGain = options.scaleGain ?? parameters[0]?.[3]?.scale;

    if (!this.scaleCutoffHz || !this.scaleQ || !this.scaleGain) {
      console.warn(
        "EqualizerXYPad: Missing scale definitions for equalizer parameters.", parameters);
    }

    this.#sampleRate = options.sampleRate ?? 48000;
    this.autoGain = options.autoGain ?? "none";
    this.ceilingDB = options.ceilingDB ?? 0.0;
    this.customLabels = options.sectionLabels ?? null;

    this.divContainer = document.createElement("div");
    this.divContainer.classList.add("equalizerContainer");
    parent.appendChild(this.divContainer);

    this.label = document.createElement("label");
    this.label.classList.add("equalizer");
    this.label.textContent = label;
    this.label.addEventListener("pointerdown", (event) => {
      if (this.param.length <= 0) return;
      const firstParam = Array.isArray(this.param[0]) ? this.param[0][0] : this.param[0];
      const newState = !firstParam.lockRandomization;
      for (let prm of this.param) {
        if (Array.isArray(prm)) {
          for (let p of prm) p.lockRandomization = newState;
        } else {
          prm.lockRandomization = newState;
        }
      }

      this.label.style.color = newState ? palette.inactive : "unset";
    }, false);
    this.divContainer.appendChild(this.label);

    this.divCanvasMargin = document.createElement("div");
    this.divCanvasMargin.classList.add("canvasMargin");
    this.divContainer.appendChild(this.divCanvasMargin);

    this.canvas = document.createElement("canvas");
    this.canvas.classList.add("envelopeView");
    this.canvas.ariaLabel = `${label}, canvas`;
    this.canvas.ariaDescription = "Equalizer frequency response and control points editor.";
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.tabIndex = 0;
    this.canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e), false);
    this.canvas.addEventListener("pointermove", (e) => this.onPointerMove(e), false);
    this.canvas.addEventListener("pointerup", (e) => this.onPointerUp(e), false);
    this.canvas.addEventListener("pointerleave", (e) => this.onPointerLeave(e), false);
    this.canvas.addEventListener("wheel", (e) => this.onWheel(e), false);
    this.divCanvasMargin.appendChild(this.canvas);
    this.context = this.canvas.getContext("2d");

    this.indexInputContainer = document.createElement("div");
    this.indexInputContainer.classList.add("equalizerInputLine");
    this.divContainer.appendChild(this.indexInputContainer);
    this.spanIndex = this.#addSpan("Index");
    this.indexInputContainer.appendChild(this.spanIndex);
    this.inputIndex = this.#addInput("Index", "Index of equalizer control point.");
    this.inputIndex.min = 0;
    this.inputIndex.max = Math.max(0, this.param.length - 1);
    this.inputIndex.step = 1;
    this.inputIndex.value = 0;
    this.indexInputContainer.appendChild(this.inputIndex);

    this.cutoffInputContainer = document.createElement("div");
    this.cutoffInputContainer.classList.add("equalizerInputLine");
    this.divContainer.appendChild(this.cutoffInputContainer);
    this.spanCutoffHz = this.#addSpan("Cutoff [Hz]");
    this.cutoffInputContainer.appendChild(this.spanCutoffHz);
    this.inputCutoffHz = this.#addInput("Cutoff Hz", "Cutoff frequency in Hz.");
    this.inputCutoffHz.min = this.scaleCutoffHz ? this.scaleCutoffHz.minDsp : 20;
    this.inputCutoffHz.max = this.scaleCutoffHz ? this.scaleCutoffHz.maxDsp : 20000;
    this.inputCutoffHz.step = "any";
    this.inputCutoffHz.value = 100;
    this.cutoffInputContainer.appendChild(this.inputCutoffHz);

    this.qInputContainer = document.createElement("div");
    this.qInputContainer.classList.add("equalizerInputLine");
    this.divContainer.appendChild(this.qInputContainer);
    this.spanQ = this.#addSpan("Q");
    this.qInputContainer.appendChild(this.spanQ);
    this.inputQ = this.#addInput("Q", "Q factor of equalizer section.");
    this.inputQ.min = this.scaleQ ? this.scaleQ.minDsp : 0.1;
    this.inputQ.max = this.scaleQ ? this.scaleQ.maxDsp : 50;
    this.inputQ.step = "any";
    this.inputQ.value = Math.SQRT1_2;
    this.qInputContainer.appendChild(this.inputQ);

    this.gainInputContainer = document.createElement("div");
    this.gainInputContainer.classList.add("equalizerInputLine");
    this.divContainer.appendChild(this.gainInputContainer);
    this.spanGainDB = this.#addSpan("Gain [dB]");
    this.gainInputContainer.appendChild(this.spanGainDB);
    this.inputGainDB = this.#addInput("Gain dB", "Gain in decibels.");
    this.inputGainDB.min = this.scaleGain ? this.scaleGain.minUi : -60;
    this.inputGainDB.max = this.scaleGain ? this.scaleGain.maxUi : 60;
    this.inputGainDB.step = "any";
    this.inputGainDB.value = 0.0;
    this.gainInputContainer.appendChild(this.inputGainDB);

    this.inputIndex.addEventListener("input", (e) => this.#inputCallback(e), false);
    this.inputCutoffHz.addEventListener("input", (e) => this.#inputCallback(e), false);
    this.inputQ.addEventListener("input", (e) => this.#inputCallback(e), false);
    this.inputGainDB.addEventListener("input", (e) => this.#inputCallback(e), false);

    this.leftHz = this.scaleCutoffHz ? this.scaleCutoffHz.minDsp : 20;
    this.rightHz = this.scaleCutoffHz ? this.scaleCutoffHz.maxDsp : 20000;
    this.topDB = this.scaleGain ? this.scaleGain.maxUi : 60;
    this.bottomDB = this.scaleGain ? this.scaleGain.minUi : -60;
    const logLeft = Math.log2(this.leftHz);
    const logRight = Math.log2(this.rightHz);
    const logRange = logRight - logLeft;
    this.mapHzToX = (hz) => ((Math.log2(hz) - logLeft) * width) / logRange;
    this.mapDbToY = (dB) => ((this.topDB - dB) / (this.topDB - this.bottomDB)) * height;
    this.mapYToDb = (y) => this.topDB - (y * (this.topDB - this.bottomDB)) / height;
    this.mapXToHz = (x) => Math.pow(2, (x * logRange) / width + logLeft);
    this.#nyquistX = this.mapHzToX(0.5 * this.#sampleRate);

    this.#section = [];
    for (let idx = 0; idx < this.param.length; ++idx) {
      const band = this.param[idx];
      const typeParam = band?.[0];
      let type = options.filterTypes?.[idx];
      if (!type && typeParam?.scale?.items) { type = typeParam.scale.items[typeParam.dsp]; }
      if (!type || !selectSosFilter(type)) {
        console.warn(`EqualizerXYPad: Invalid filterType at section index ${idx}.`, band);
      }
      this.addSection(type, band[1].dsp, band[2].dsp, band[3].ui);
    }

    this.refresh();
  }

  toMessage() {
    return {
      params: this.param.map((band) => [band[1].dsp, band[2].dsp, band[3].dsp]),
      filterTypes: this.#section.map((s) => s.type),
      autoGain: this.autoGain,
      ceilingDB: this.ceilingDB,
    };
  }

  setSampleRate(sampleRate) {
    if (!sampleRate || sampleRate <= 0 || sampleRate === this.#sampleRate) return;
    this.#sampleRate = sampleRate;
    this.#nyquistX = this.mapHzToX(0.5 * sampleRate);
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
    this.#detailIndex = clamp(Math.floor(this.inputIndex.value), 0, this.#section.length - 1);

    const maxX = Math.min(this.canvas.width, this.#nyquistX);
    const sc = this.#section[this.#detailIndex];
    sc.cutoff = Math.min(this.inputCutoffHz.value / this.#sampleRate, 0.49999);
    sc.Q = this.inputQ.value;
    sc.gainDB = this.inputGainDB.value;
    sc.x = clamp(this.mapHzToX(this.inputCutoffHz.value), 0, maxX);
    sc.y = clamp(this.mapDbToY(this.inputGainDB.value), 0, this.canvas.height);

    this.#updateParameters(this.#detailIndex);
    this.onChangeFunc();
    this.draw();
  }

  #refreshInternal(index) {
    index = clamp(index, 0, Math.max(0, this.#section.length - 1));
    this.inputIndex.value = index;

    if (this.#section.length === 0) return;
    const sc = this.#section[index];
    this.inputCutoffHz.value = sc.cutoff * this.#sampleRate;
    this.inputQ.value = sc.Q;
    this.inputGainDB.value = sc.gainDB;

    const hasQ = !noQTypes.includes(sc.type);
    this.inputQ.disabled = !hasQ;
    this.spanQ.style.color = hasQ ? palette.foreground : palette.inactive;

    const hasGain = !noGainTypes.includes(sc.type);
    this.inputGainDB.disabled = !hasGain;
    this.spanGainDB.style.color = hasGain ? palette.foreground : palette.inactive;

    this.#updateParameters(index);
  }

  #updateParameters(index) {
    if (index >= this.#section.length || index >= this.param.length) return;
    const sc = this.#section[index];
    const param = this.param[index];
    if (param[0]?.scale?.items) {
      const typeIdx = param[0].scale.items.indexOf(sc.type);
      if (typeIdx >= 0) {
        param[0].dsp = typeIdx;
      } else {
        console.warn(`EqualizerXYPad: Unknown section type "${sc.type}" at index ${index}.`);
      }
    }
    param[1].dsp = sc.cutoff * this.#sampleRate;
    param[2].dsp = sc.Q;
    param[3].ui = sc.gainDB;
  }

  refresh() {
    const maxX = Math.min(this.canvas.width, this.#nyquistX);
    for (let index = 0; index < this.param.length; ++index) {
      if (index >= this.#section.length) break;
      const sc = this.#section[index];
      const param = this.param[index];
      if (param[0]?.scale?.items) {
        const type = param[0].scale.items[param[0].dsp];
        if (!type || !selectSosFilter(type)) {
          console.warn(`EqualizerXYPad.refresh: Invalid filterType at index ${index}.`, param[0]);
        } else {
          sc.type = type;
        }
      }
      sc.cutoff = param[1].dsp / this.#sampleRate;
      sc.Q = param[2].dsp;
      sc.gainDB = param[3].ui;
      sc.x = clamp(this.mapHzToX(sc.cutoff * this.#sampleRate), 0, maxX);
      sc.y = clamp(this.mapDbToY(sc.gainDB), 0, this.canvas.height);
      this.#updateParameters(index);
    }
    this.#refreshInternal(this.#detailIndex);
    this.draw();
  }

  #getMousePosition(event) {
    const rect = event.target.getBoundingClientRect();
    return {x: event.clientX - rect.left, y: event.clientY - rect.top};
  }

  addSection(filterType, cutoffHz, Q, gainDB) {
    const cut = cutoffHz / this.#sampleRate;
    const maxX = Math.min(this.canvas.width, this.#nyquistX);
    this.#section.push({
      type: filterType,
      cutoff: cut,
      Q: Q,
      gainDB: gainDB,
      x: clamp(this.mapHzToX(cutoffHz), 0, maxX),
      y: clamp(this.mapDbToY(gainDB), 0, this.canvas.height),
    });
  }

  sos() {
    let sos = [];
    for (const sc of this.#section) {
      const filterFunc = selectSosFilter(sc.type);
      if (filterFunc) { sos.push(filterFunc(sc.cutoff, sc.Q, dbToAmp(sc.gainDB))); }
    }
    return sos;
  }

  getAutoGain() {
    const sosList = this.sos();
    const candidateFreqs = this.#section.map((s) => s.cutoff);
    return computeSosAutoGain(sosList, candidateFreqs, this.autoGain, this.ceilingDB);
  }

  getGainY(hz, offsetDB = 0.0) {
    const gainDB = getSosGain(this.sos(), hz / this.#sampleRate, true) + offsetDB;
    return this.mapDbToY(gainDB);
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

  onPointerDown(event) {
    this.canvas.setPointerCapture(event.pointerId);
    this.#isMouseDown = true;

    const mouse = this.#getMousePosition(event);
    this.#grabbedPoint = this.#hitTest(mouse);

    if (this.#grabbedPoint >= 0) {
      this.#detailIndex = this.#grabbedPoint;
      if (event.ctrlKey) {
        const sc = this.#section[this.#grabbedPoint];
        const defaultCutoffHz = this.param[this.#grabbedPoint]?.[1]?.defaultDsp ?? 1000;
        const maxX = Math.min(this.canvas.width, this.#nyquistX);

        sc.cutoff = clamp(defaultCutoffHz / this.#sampleRate, 1e-6, 0.49999);
        sc.Q = this.param[this.#grabbedPoint]?.[2]?.defaultDsp ?? Math.SQRT1_2;
        sc.gainDB = 0;

        sc.x = clamp(this.mapHzToX(sc.cutoff * this.#sampleRate), 0, maxX);
        sc.y = clamp(this.mapDbToY(0), 0, this.canvas.height);

        this.onChangeFunc();
      }
      this.#refreshInternal(this.#grabbedPoint);
      if (event.ctrlKey) this.#grabbedPoint = -1;
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

      const maxX = Math.min(this.canvas.width, this.#nyquistX);
      const sc = this.#section[this.#grabbedPoint];
      sc.x = clamp(sc.x + movementX, 0, maxX);
      sc.cutoff = clamp(this.mapXToHz(sc.x) / this.#sampleRate, 1e-6, 0.49999);

      if (!noGainTypes.includes(sc.type)) {
        sc.y = clamp(sc.y + movementY, 0, this.canvas.height);
        sc.gainDB = this.mapYToDb(sc.y);
      }
    }
    this.#refreshInternal(this.#detailIndex);
    this.draw();
  }

  onPointerUp(event) {
    this.canvas.releasePointerCapture(event.pointerId);
    this.#isMouseDown = false;
    this.onChangeFunc();
  }

  onPointerLeave(event) { this.draw(); }

  onWheel(event) {
    event.preventDefault();

    if (event.deltaY === 0) return;

    this.#focusedPoint = this.#hitTest(this.#getMousePosition(event));
    if (this.#focusedPoint < 0) return;

    this.#detailIndex = this.#focusedPoint;

    const amount = event.deltaY > 0 ? 1 : -1;
    const sensi = event.shiftKey ? 0.01 : event.ctrlKey ? 1 : 0.2;
    let Q = this.#section[this.#focusedPoint].Q * Math.exp(amount * sensi);
    this.#section[this.#focusedPoint].Q = clamp(Q, this.scaleQ.minDsp, this.scaleQ.maxDsp);

    this.#refreshInternal(this.#detailIndex);
    this.draw();
    this.onChangeFunc();
  }

  draw() {
    const width = this.canvas.width;
    const height = this.canvas.height;
    const auto = this.getAutoGain();
    const autoGainDB = auto.autoGainDB;

    // Background & Nyquist boundary
    this.context.fillStyle = palette.background;
    this.context.fillRect(0, 0, width, height);

    this.context.fillStyle = "#f8f8f8";
    this.context.fillRect(this.#nyquistX, 0, width - this.#nyquistX, height);

    // Prepare Grid & Tick Data
    this.context.font = `${palette.fontWeightBase} ${palette.fontSize}px ${palette.fontFamily}`;

    // Collect all vertical grid frequencies
    const verticalGrids = [];
    let subGridHz = 10 ** Math.floor(Math.log10(this.leftHz));
    while (subGridHz <= this.rightHz) {
      for (let index = 1; index < 10; ++index) {
        const hz = index * subGridHz;
        if (hz < this.leftHz) continue;
        if (hz > this.rightHz) break;
        verticalGrids.push(hz);
      }
      subGridHz *= 10;
    }

    // Decibel ticks
    const dbRange = this.topDB - this.bottomDB;
    const minPixelSpacing = palette.fontSize * 2.5;
    const maxTicks = Math.max(2, Math.floor(height / minPixelSpacing));
    const rawInterval = dbRange / maxTicks;

    const candidateSteps = [0.1, 0.2, 0.5, 1, 2, 3, 6, 12, 18, 24];
    const intervalDB = candidateSteps.find((s) => s >= rawInterval) ?? 6;
    const precision = Number.isInteger(intervalDB) ? 0 : 1;

    const minN = Math.ceil((this.bottomDB + 1e-5) / intervalDB);
    const maxN = Math.floor((this.topDB - 1e-5) / intervalDB);
    const dbTicks = [];

    for (let n = minN; n <= maxN; ++n) {
      const gridDB = Math.round(n * intervalDB * 100) / 100;
      const y = this.mapDbToY(gridDB);

      // Skip ticks that are too close to top/bottom edges
      if (y < palette.fontSize / 2 || y > height - palette.fontSize / 2) { continue; }

      const sign = gridDB > 0 ? "+" : "";
      const text = `${sign}${gridDB.toFixed(precision)} dB`;

      dbTicks.push({
        dB: gridDB,
        y,
        text,
        width: this.context.measureText(text).width,
      });
    }

    // Tick helper functions & overlap detectors
    const margin = 4;
    const createFreqTick = (hz) => {
      const x = this.mapHzToX(hz);
      const text = `↙${Math.round(hz)} Hz`;
      return {
        hz,
        x,
        text,
        width: this.context.measureText(text).width,
      };
    };

    const getFreqBox = (tick) => ({
      left: tick.x,
      right: tick.x + tick.width,
      top: height - palette.fontSize,
      bottom: height,
    });

    const overlapsDb = (box) => dbTicks.some((dbTick) => {
      const dbBoxLeft = {
        left: 0,
        right: dbTick.width,
        top: dbTick.y - palette.fontSize / 2,
        bottom: dbTick.y + palette.fontSize / 2,
      };
      const dbBoxRight = {
        left: width - dbTick.width,
        right: width,
        top: dbTick.y - palette.fontSize / 2,
        bottom: dbTick.y + palette.fontSize / 2,
      };
      const overlapsLeft = box.left < dbBoxLeft.right + margin
        && box.right + margin > dbBoxLeft.left && box.top < dbBoxLeft.bottom + margin
        && box.bottom + margin > dbBoxLeft.top;
      const overlapsRight = box.left < dbBoxRight.right + margin
        && box.right + margin > dbBoxRight.left && box.top < dbBoxRight.bottom + margin
        && box.bottom + margin > dbBoxRight.top;
      return overlapsLeft || overlapsRight;
    });

    const overlapsExisting = (box, ticks) => ticks.some((tick) => {
      const tickBox = getFreqBox(tick);
      return (
        box.left < tickBox.right + margin && box.right + margin > tickBox.left
        && box.top < tickBox.bottom + margin && box.bottom + margin > tickBox.top);
    });

    // Existing frequency ticks (10^n Hz)
    let freqTicks = [];
    let gridHz = 10 ** Math.floor(Math.log10(this.leftHz));
    while (gridHz <= this.rightHz) {
      if (gridHz >= this.leftHz) { freqTicks.push(createFreqTick(gridHz)); }
      gridHz *= 10;
    }

    // Filter out existing 10^n Hz ticks that overlap decibel ticks or fall outside the canvas
    freqTicks = freqTicks.filter((tick) => {
      const box = getFreqBox(tick);
      return box.left >= 0 && box.right <= width && !overlapsDb(box);
    });

    const existingFreqTicks = [...freqTicks];

    // Leftmost frequency tick (can point to non-10^n Hz vertical grids)
    let leftmostTick = null;
    for (let i = 0; i < verticalGrids.length; ++i) {
      const tick = createFreqTick(verticalGrids[i]);
      const box = getFreqBox(tick);
      if (box.left < 0 || overlapsDb(box)) continue;
      if (!overlapsExisting(box, existingFreqTicks)) { leftmostTick = tick; }
      break;
    }

    // Rightmost frequency tick (can point to non-10^n Hz vertical grids)
    let rightmostTick = null;
    const ticksToAvoid = leftmostTick ? [...existingFreqTicks, leftmostTick] : existingFreqTicks;

    for (let i = verticalGrids.length - 1; i >= 0; --i) {
      const tick = createFreqTick(verticalGrids[i]);
      const box = getFreqBox(tick);
      if (box.right > width || overlapsDb(box)) continue;
      if (!overlapsExisting(box, ticksToAvoid)) { rightmostTick = tick; }
      break;
    }

    if (leftmostTick) freqTicks.push(leftmostTick);
    if (rightmostTick) freqTicks.push(rightmostTick);
    freqTicks.sort((a, b) => a.x - b.x);

    // Grid Lines
    this.context.lineWidth = 0.5;
    this.context.strokeStyle = "#f0f0f0";

    // Frequency grid vertical lines
    for (const hz of verticalGrids) {
      const x = this.mapHzToX(hz);
      this.context.beginPath();
      this.context.moveTo(x, 0);
      this.context.lineTo(x, height);
      this.context.stroke();
    }

    // Decibel grid horizontal lines
    for (const tick of dbTicks) {
      this.context.beginPath();
      this.context.moveTo(0, tick.y);
      this.context.lineTo(width, tick.y);
      this.context.stroke();
    }

    // Emphasize 0 dB line
    this.context.lineWidth = 0.5;
    this.context.strokeStyle = "#303030";
    this.context.beginPath();
    this.context.moveTo(0, this.mapDbToY(0));
    this.context.lineTo(width, this.mapDbToY(0));
    this.context.stroke();

    // Raw gain response (faint line if compensated)
    if (this.autoGain !== "none" && Math.abs(autoGainDB) > 0.05) {
      this.context.lineWidth = 1;
      this.context.strokeStyle = "#1060ff44";
      this.context.beginPath();
      this.context.moveTo(-10, this.getGainY(this.mapXToHz(0), 0.0));
      const upSample = 4;
      const nyquist = 0.5 * this.#sampleRate;
      for (let i = 1; i <= upSample * width; ++i) {
        const x = i / upSample;
        const hz = this.mapXToHz(x);
        if (hz >= nyquist) break;
        this.context.lineTo(x, this.getGainY(hz, 0.0));
      }
      this.context.stroke();
    }

    // Effective gain response curve (with autoGain applied)
    this.context.lineWidth = 2;
    this.context.strokeStyle = "#1060ff";
    this.context.beginPath();
    this.context.moveTo(-10, this.getGainY(this.mapXToHz(0), autoGainDB));
    const upSample = 8;
    const nyquist = 0.5 * this.#sampleRate;
    for (let i = 1; i <= upSample * width; ++i) {
      const x = i / upSample;
      const hz = this.mapXToHz(x);
      if (hz >= nyquist) break;
      this.context.lineTo(x, this.getGainY(hz, autoGainDB));
    }
    this.context.stroke();

    // Tick texts & Auto gain text
    this.context.fillStyle = "#808080";
    this.context.font = `${palette.fontWeightBase} ${palette.fontSize}px ${palette.fontFamily}`;

    // Frequency ticks
    this.context.textAlign = "left";
    this.context.textBaseline = "bottom";
    for (const tick of freqTicks) { this.context.fillText(tick.text, tick.x, height); }

    // Decibel ticks
    this.context.textBaseline = "middle";
    for (const tick of dbTicks) {
      this.context.textAlign = "left";
      this.context.fillText(tick.text, 0, tick.y);
      this.context.textAlign = "right";
      this.context.fillText(tick.text, width, tick.y);
    }

    // Auto-gain indicator text (centered to prevent overlap with decibel ticks)
    if (this.autoGain !== "none" && Math.abs(autoGainDB) > 0.01) {
      this.context.font
        = `${palette.fontWeightBase} ${palette.fontSize}px ${palette.fontMonospace}`;
      const autoText
        = `Auto Gain: ${autoGainDB.toFixed(1)} dB (Peak: ${auto.maxGainDB.toFixed(1)} dB)`;
      const autoWidth = this.context.measureText(autoText).width;
      const autoBox = {
        left: width / 2 - autoWidth / 2,
        right: width / 2 + autoWidth / 2,
        top: 8,
        bottom: 8 + palette.fontSize,
      };

      const overlapsTicks = dbTicks.some((dbTick) => {
        const dbBoxLeft = {
          left: 0,
          right: dbTick.width,
          top: dbTick.y - palette.fontSize / 2,
          bottom: dbTick.y + palette.fontSize / 2,
        };
        const dbBoxRight = {
          left: width - dbTick.width,
          right: width,
          top: dbTick.y - palette.fontSize / 2,
          bottom: dbTick.y + palette.fontSize / 2,
        };
        return (
          (autoBox.left < dbBoxLeft.right &&
            autoBox.right > dbBoxLeft.left &&
            autoBox.top < dbBoxLeft.bottom &&
            autoBox.bottom > dbBoxLeft.top) ||
          (autoBox.left < dbBoxRight.right &&
            autoBox.right > dbBoxRight.left &&
            autoBox.top < dbBoxRight.bottom &&
            autoBox.bottom > dbBoxRight.top)
        );
      });

      if (!overlapsTicks) {
        this.context.fillStyle = palette.foreground;
        this.context.textAlign = "center";
        this.context.textBaseline = "top";
        this.context.fillText(autoText, width / 2, 8);
      }
    }

    // Control Points
    for (let idx = 0; idx < this.#section.length; ++idx) {
      const sc = this.#section[idx];
      this.context.fillStyle = this.#focusedPoint === idx ? "#00000044" : palette.overlay;
      this.context.beginPath();
      this.context.ellipse(sc.x, sc.y, this.#controlRadius, this.#controlRadius, 0, 0, 2 * Math.PI);
      this.context.fill();

      this.context.fillStyle = "#ffffff";
      this.context.font = `${palette.fontWeightStrong} ${palette.fontSize}px ${palette.fontFamily}`;
      this.context.textBaseline = "middle";
      this.context.textAlign = "center";

      const badge = filterTypeBadges[sc.type] ?? "";
      const labelText = this.customLabels?.[idx] ?? (badge ? `${idx + 1}.${badge}` : `${idx + 1}`);
      this.context.fillText(labelText, sc.x, sc.y);
    }
  }
}
