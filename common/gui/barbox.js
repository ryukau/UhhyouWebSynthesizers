// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {clamp} from "../util.js";

import {palette} from "./palette.js";

export class BarBox {
  #isMouseEntered;
  #mouseButton;

  #anchor;
  #mousePosition;

  #sliderWidth;
  #sliderZero;
  #indexL;
  #indexR;
  #indexRange;
  #barWidth;

  /**
  `parameters` is a list of `widget.Parameter`.
  */
  constructor(parent, label, width, height, parameters, onInputFunc) {
    console.assert(parameters.length > 0, "BarBox parameter is empty.", new Error());

    this.label = label;
    this.param = parameters;
    this.onInputFunc = onInputFunc;
    this.snapValue = [];

    this.divContainer = document.createElement("div");
    this.divContainer.classList.add("barboxContainer");
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
    this.label.classList.add("barbox");
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

    this.divInputLine = document.createElement("div");
    this.divInputLine.className = "inputLine";
    this.divContainer.appendChild(this.divInputLine);

    this.divIndexLabel = document.createElement("span");
    this.divIndexLabel.classList.add("barbox");
    this.divIndexLabel.textContent = "Index";
    this.divInputLine.appendChild(this.divIndexLabel);

    this.inputIndex = document.createElement("input");
    this.inputIndex.classList.add("barbox");
    this.inputIndex.ariaLabel = label + ", index selector";
    this.inputIndex.ariaDescription
      = "Select index of bar box control. Each index corresponds to a value in an array. The value can be set at the next element.";
    this.inputIndex.type = "number";
    this.inputIndex.min = 0;
    this.inputIndex.max = parameters.length - 1;
    this.inputIndex.step = 1;
    this.inputIndex.value = 0;
    this.divInputLine.appendChild(this.inputIndex);

    this.divValueLabel = document.createElement("span");
    this.divValueLabel.classList.add("barbox");
    this.divValueLabel.textContent = "Value";
    this.divInputLine.appendChild(this.divValueLabel);

    this.inputValue = document.createElement("input");
    this.inputValue.classList.add("barbox");
    this.inputValue.ariaLabel = label + ", value input";
    this.inputValue.ariaDescription
      = "Set value of bar box control. This value is a part of an array. The index of array can be set at the previous element.";
    this.inputValue.type = "number";
    this.inputValue.min = parameters[0].scale.minDsp;
    this.inputValue.max = parameters[0].scale.maxDsp;
    this.inputValue.step = parameters[0].step;
    this.inputValue.value = parameters[0].dsp;
    this.divInputLine.appendChild(this.inputValue);

    this.inputIndex.addEventListener("input", (e) => this.#onIndexInput(e), false);
    this.inputIndex.addEventListener("change", (e) => this.#onIndexInput(e), false);
    this.inputValue.addEventListener("input", (e) => this.#onValueInput(e), false);
    this.inputValue.addEventListener("change", (e) => this.#onValueInput(e), false);

    this.divCanvasMargin = document.createElement("div");
    this.divCanvasMargin.classList.add("canvasMargin");
    this.divContainer.appendChild(this.divCanvasMargin);

    this.canvas = document.createElement("canvas");
    this.canvas.setAttribute("role", "group");
    this.canvas.ariaLabel = `${label}, bar editor`;
    this.canvas.ariaDescription
      = "Use Left and Right arrows to select index, Up and Down to modify value. 'r' to randomize, 't' to slightly randomize.";
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.tabIndex = 0;
    this.canvas.style.cursor = "crosshair";
    this.canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e), false);
    this.canvas.addEventListener("pointerup", (e) => this.onPointerUp(e), false);
    this.canvas.addEventListener("pointermove", (e) => this.onPointerMove(e), false);
    this.canvas.addEventListener("pointerenter", (e) => this.onPointerEnter(e), false);
    this.canvas.addEventListener("pointerleave", (e) => this.onPointerLeave(e), false);
    this.canvas.addEventListener("wheel", (e) => this.onWheel(e), false);
    this.canvas.addEventListener("keydown", (e) => this.onKeyDown(e), false);
    this.canvas.addEventListener("focus", () => this.draw(), false);
    this.canvas.addEventListener("blur", () => this.draw(), false);
    this.canvas.addEventListener("contextmenu", (e) => { e.preventDefault(); }, false);
    this.divCanvasMargin.appendChild(this.canvas);
    this.context = this.canvas.getContext("2d");

    this.#sliderZero = 0;
    this.indexOffset = 0;
    this.scrollSensitivity = 0.01;
    this.altScrollSensitivity = 0.001;

    this.#isMouseEntered = false;
    this.#mouseButton = -1;
    this.#mousePosition = {x: -1, y: -1};
    this.#anchor = null;
    this.#sliderWidth = width / parameters.length;

    window.matchMedia?.("(prefers-color-scheme: dark)")
      .addEventListener?.("change", () => this.draw());

    this.#setViewRange(0, 1);
    this.draw();
  }

  #announce(text) {
    if (!this.liveRegion) return;
    this.liveRegion.textContent = this.liveRegion.textContent === text ? `${text}\u00A0` : text;
  }

  #formatValue(index) {
    if (index < 0 || index >= this.param.length) return "0.00000";
    const val = this.param[index]?.display ?? this.param[index]?.dsp ?? 0;
    return typeof val === "number" ? val.toFixed(5) : String(val);
  }

  #announceBarSelected(index) {
    this.#announce(`Index ${index + this.indexOffset} selected: ${this.#formatValue(index)}`);
  }

  #announceBarMoved(index, type) {
    if (type === "reset") {
      this.#announce(`Index ${index + this.indexOffset} reset: ${this.#formatValue(index)}`);
    } else {
      this.#announce(`Index ${index + this.indexOffset}: ${this.#formatValue(index)}`);
    }
  }

  refresh() {
    const isLocked = this.param[0]?.lockRandomization ?? false;
    this.label.setAttribute("aria-pressed", isLocked ? "true" : "false");
    this.label.style.color = isLocked ? palette.inactive : "unset";

    let index = parseInt(this.inputIndex.value);
    if (isNaN(index)) index = 0;
    index = clamp(index, 0, this.param.length - 1);
    this.inputIndex.value = index;
    this.inputValue.value = this.param[index].dsp;
    this.draw();
  }

  set sliderZero(value) {
    this.#sliderZero = value;
    this.draw();
  }

  #onIndexInput(event) {
    let index = parseInt(this.inputIndex.value);
    if (isNaN(index)) return;
    index = clamp(index, 0, this.param.length - 1);
    this.inputIndex.value = index;
    this.inputValue.value = this.param[index].dsp;
    this.draw();
  }

  #onValueInput(event) {
    let index = parseInt(this.inputIndex.value);
    if (isNaN(index)) index = 0;
    index = clamp(index, 0, this.param.length - 1);
    const val = parseFloat(this.inputValue.value);
    if (isNaN(val)) return;
    this.param[index].dsp = val;
    this.draw();
    this.onInputFunc();
  }

  #setInputElement(index) {
    this.inputIndex.value = index;
    this.inputValue.value = this.param[index].dsp;
  }

  setViewRange(indexL, indexR) {
    this.#setViewRange(indexL / this.param.length, indexR / this.param.length);
    this.draw();
  }

  #setViewRange(left, right) {
    console.assert(isFinite(left), new Error());
    console.assert(isFinite(right), new Error());

    this.#indexL = Math.floor(clamp(left, 0, 1) * this.param.length);
    this.#indexR = Math.floor(clamp(right, 0, 1) * this.param.length);
    this.#indexRange = this.#indexR >= this.#indexL ? this.#indexR - this.#indexL : 0;
    this.#refreshSliderWidth(this.canvas.width);
  }

  #refreshSliderWidth(width) {
    this.#sliderWidth = this.#indexRange >= 1 ? width / this.#indexRange : width;
    this.#barWidth = this.#sliderWidth <= 12 ? 1 : 2;
  }

  draw() {
    const width = this.canvas.width;
    const height = this.canvas.height;

    // Background.
    this.context.fillStyle = palette.background;
    this.context.fillRect(0, 0, width, height);

    // Value bar.
    const zeroLineHeight = height * (1 - this.#sliderZero);
    this.context.fillStyle = palette.highlightMain;
    for (let i = this.#indexL; i < this.#indexR; ++i) {
      let top = height * (1 - this.param[i].normalized);
      let bottom = zeroLineHeight;
      if (top > bottom) [top, bottom] = [bottom, top];

      this.context.fillRect(
        (i - this.#indexL) * this.#sliderWidth,
        top,
        this.#sliderWidth - this.#barWidth,
        bottom - top,
      );
    }

    // Index text.
    this.context.font = `8px ${palette.fontFamily}`;
    this.context.fillStyle = palette.foreground;
    this.context.textAlign = "center";
    this.context.strokeStyle = palette.highlightMain;
    if (this.#sliderWidth >= 12) {
      for (let i = this.#indexL; i < this.#indexR; ++i) {
        const left = (i - this.#indexL + 0.5) * this.#sliderWidth - 2;
        this.context.fillText(`${i + this.indexOffset}`, left, height - 8);
      }
    }

    // Additional index text for zoom in.
    if (this.param.length != this.#indexRange) {
      this.context.font = `12px ${palette.fontFamily}`;
      this.context.fillStyle = palette.foreground;
      this.context.textAlign = "start";
      this.context.fillText(`<- #${this.#indexL + this.indexOffset}`, 4, 12);
    }

    // Highlight.
    if (this.#isMouseEntered) {
      const index = Math.floor(this.#indexL + this.#indexRange * this.#mousePosition.x / width);
      if (index < this.param.length && index >= 0) {
        this.context.fillStyle = palette.overlayHighlight;
        this.context.fillRect(
          (index - this.#indexL) * this.#sliderWidth, 0, this.#sliderWidth, height);

        // Value text.
        this.context.font = `24px ${palette.fontFamily}`;
        this.context.fillStyle = palette.overlay;
        this.context.textAlign = "center";
        this.context.fillText(
          `#${index + this.indexOffset}: ${this.param[index].display.toFixed(5)}`, width / 2,
          height / 2);
      }
    } else if (document.activeElement === this.canvas) {
      let index = parseInt(this.inputIndex.value);
      if (!isNaN(index) && index >= this.#indexL && index < this.#indexR) {
        this.context.fillStyle = palette.overlayHighlight;
        this.context.fillRect(
          (index - this.#indexL) * this.#sliderWidth, 0, this.#sliderWidth, height);

        this.context.font = `24px ${palette.fontFamily}`;
        this.context.fillStyle = palette.overlay;
        this.context.textAlign = "center";
        this.context.fillText(
          `#${index + this.indexOffset}: ${this.param[index].display.toFixed(5)}`, width / 2,
          height / 2);
      }
    }

    // Zero line.
    this.context.strokeStyle = palette.borderMid;
    this.context.lineWidth = 0.2;
    this.context.beginPath();
    this.context.moveTo(0, zeroLineHeight);
    this.context.lineTo(width, zeroLineHeight);
    this.context.stroke();

    // Anchor.
    if (this.#anchor !== null) {
      this.context.fillStyle = palette.overlay;
      this.context.strokeStyle = palette.overlay;
      this.context.lineWidth = 1;

      const radius = 4;
      this.context.beginPath();
      this.context.ellipse(this.#anchor.x, this.#anchor.y, radius, radius, 0, 0, 2 * Math.PI);
      this.context.fill();

      this.context.beginPath();
      this.context.ellipse(
        this.#mousePosition.x, this.#mousePosition.y, radius, radius, 0, 0, 2 * Math.PI);
      this.context.fill();

      this.context.beginPath();
      this.context.moveTo(this.#anchor.x, this.#anchor.y);
      this.context.lineTo(this.#mousePosition.x, this.#mousePosition.y);
      this.context.stroke();
    }
  }

  onPointerDown(event) {
    event.preventDefault();
    this.canvas.focus();

    this.#mouseButton = event.button;

    this.#mousePosition = this.#getMousePosition(event);
    this.#anchor = structuredClone(this.#mousePosition);

    this.#setValueFromPosition(event, this.#mousePosition);

    this.draw();

    this.canvas.setPointerCapture(event.pointerId);

    const index = parseInt(this.inputIndex.value);
    if (!isNaN(index) && index >= 0 && index < this.param.length) {
      if (event.ctrlKey) {
        this.#announceBarMoved(index, "reset");
      } else {
        this.#announceBarSelected(index);
      }
    }
  }

  onPointerUp(event) {
    const wasDragging = this.#mouseButton >= 0;
    this.#mouseButton = -1;
    this.#anchor = null;
    this.canvas.releasePointerCapture(event.pointerId);
    this.onInputFunc();
    this.draw();
    if (wasDragging) {
      const index = parseInt(this.inputIndex.value);
      if (!isNaN(index) && index >= 0 && index < this.param.length) {
        this.#announceBarMoved(index);
      }
    }
  }

  onPointerMove(event) {
    this.#mousePosition = this.#getMousePosition(event);

    if (this.#mouseButton < 0) {
      this.draw();
      return;
    }

    this.#setValueFromLine(this.#anchor, this.#mousePosition, event);
    if (this.#mouseButton === 0) { this.#anchor = this.#mousePosition; }
    this.draw();
  }

  onPointerEnter(event) {
    this.#isMouseEntered = true;
    this.#mousePosition = this.#getMousePosition(event);
    this.draw();
  }

  onPointerLeave(event) {
    this.#isMouseEntered = false;
    this.#mouseButton = -1;
    this.#anchor = null;
    this.draw();
  }

  onWheel(event) {
    event.preventDefault();

    if (event.deltaY == 0) return;

    const index = this.#calcIndex(this.#mousePosition);
    if (index >= this.param.length) return;

    const amount = event.deltaY > 0 ? -1 : 1;
    const sensi = event.shiftKey ? this.altScrollSensitivity : this.scrollSensitivity;
    this.#setValueAt(index, this.param[index].normalized + sensi * amount);
    this.#setInputElement(index);

    this.onInputFunc();
    this.draw();
    this.#announceBarMoved(index);
  }

  onKeyDown(event) {
    let index = parseInt(this.inputIndex.value);
    if (isNaN(index)) index = 0;

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      index = clamp(index - 1, 0, this.param.length - 1);
      this.#setInputElement(index);
      this.draw();
      this.#announceBarSelected(index);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      index = clamp(index + 1, 0, this.param.length - 1);
      this.#setInputElement(index);
      this.draw();
      this.#announceBarSelected(index);
    } else if (event.key === "Home") {
      event.preventDefault();
      this.#setInputElement(0);
      this.draw();
      this.#announceBarSelected(0);
    } else if (event.key === "End") {
      event.preventDefault();
      this.#setInputElement(this.param.length - 1);
      this.draw();
      this.#announceBarSelected(this.param.length - 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.shiftKey ? 0.001 : 0.01;
      this.#setValueAt(index, clamp(this.param[index].normalized + delta, 0, 1));
      this.#setInputElement(index);
      this.onInputFunc();
      this.draw();
      this.#announceBarMoved(index);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      const delta = event.shiftKey ? 0.001 : 0.01;
      this.#setValueAt(index, clamp(this.param[index].normalized - delta, 0, 1));
      this.#setInputElement(index);
      this.onInputFunc();
      this.draw();
      this.#announceBarMoved(index);
    } else if (event.key === "r") {
      for (let i = 0; i < this.param.length; ++i) this.#setValueAt(i, Math.random());
      this.#setInputElement(index);
      this.onInputFunc();
      this.draw();
      this.#announce(
        `Randomized all values. Index ${index + this.indexOffset}: ${this.#formatValue(index)}`);
    } else if (event.key === "t") {
      for (let i = 0; i < this.param.length; ++i) {
        const rand = 0.02 * (Math.random() - 0.5);
        this.#setValueAt(i, rand + this.param[i].normalized);
      }
      this.#setInputElement(index);
      this.onInputFunc();
      this.draw();
      this.#announce(`Slightly randomized all values. Index ${index + this.indexOffset}: ${
        this.#formatValue(index)}`);
    }
  }

  #getMousePosition(event) {
    if (document.pointerLockElement === this.canvas) {
      const movementX = clamp(event.movementX, -24, 24);
      const movementY = clamp(event.movementY, -24, 24);
      return {
        x: clamp(this.#mousePosition.x + movementX, 0, this.canvas.width - 1),
        y: clamp(this.#mousePosition.y + movementY, 0, this.canvas.height)
      };
    }

    const point = event.type.includes("touch") ? event.touches[0] : event;
    const rect = event.target.getBoundingClientRect();
    const x = Math.floor(point.clientX - rect.left);
    const y = Math.floor(point.clientY - rect.top);
    return {x, y};
  }

  #calcIndex(position) {
    const index = this.#indexL + position.x / this.#sliderWidth;
    return Math.max(0, Math.floor(index));
  }

  #setValueAt(index, normalized) {
    if (index < 0 || index >= this.param.length) return;
    this.param[index].normalized = normalized;
  }

  #resetValueAt(index) {
    if (index < 0 || index >= this.param.length) return;
    this.param[index].resetToDefault();
  }

  #snap(value) {
    if (this.snapValue.length <= 0) return value;

    let idx = 0;
    for (; idx < this.snapValue.length; ++idx) {
      if (this.snapValue[idx] < value) continue;
      break;
    }
    return idx < this.snapValue.length ? this.snapValue[idx] : 1;
  }

  #setValueFromPosition(event, position) {
    const index = this.#calcIndex(position);
    if (index >= this.param.length) return;

    if (event.ctrlKey && !event.shiftKey) {
      this.#resetValueAt(index);
    } else if (!event.ctrlKey && event.shiftKey) {
      this.#setValueAt(index, this.#snap(1.0 - position.y / this.canvas.height));
    } else {
      this.#setValueAt(index, 1.0 - position.y / this.canvas.height);
    }

    this.#setInputElement(index);
  }

  #setValueFromLine(p0, p1, event) {
    if (p0.x > p1.x) [p0, p1] = [p1, p0];

    const left = this.#calcIndex(p0);
    const right = this.#calcIndex(p1);
    const cursorIndex = right;
    if (left >= this.param.length || right >= this.param.length) return;

    if (left === right) {
      this.#setValueFromPosition(event, this.#anchor);
      return;
    }

    if (event.ctrlKey) {
      for (let i = left; i >= 0 && i <= right; ++i) this.#resetValueAt(i);
      this.#setInputElement(cursorIndex);
      return;
    }

    const isSnapping = event.shiftKey;
    const height = this.canvas.height;

    const valL = 1 - p0.y / height;
    this.#setValueAt(left, isSnapping ? this.#snap(valL) : valL);

    const valR = 1 - p1.y / height;
    this.#setValueAt(right, isSnapping ? this.#snap(valR) : valR);

    const xL = this.#sliderWidth * (left + 1);
    const xR = this.#sliderWidth * right;

    let p0x = p0.x;
    let p1x = p1.x;

    if (Math.abs(p0x - p1x) <= Number.EPSILON) {
      p0x = xL;
      p1x = xR;
    }

    const slope = (p1.y - p0.y) / (p1x - p0x);
    const yInc = slope * this.#sliderWidth;
    let y = slope * (this.#sliderWidth * (left + 1) - p0x) + p0.y;
    for (let idx = left + 1; idx < right; ++idx) {
      const val = 1 - (y + 0.5 * yInc) / height;
      this.#setValueAt(idx, isSnapping ? this.#snap(val) : val);
      y += yInc;
    }

    this.#setInputElement(cursorIndex);
  }
}
