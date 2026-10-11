// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {Parameter} from "../parameter.js";
import {clamp, generateWidgetId} from "../util.js";

import {palette} from "./palette.js";

export class NumberInput {
  #isDragging = false;

  constructor(parent, label, parameter, onInputFunc) {
    this.id = generateWidgetId("numberInput", label);
    this.param = parameter;
    this.onInputFunc = onInputFunc;

    this.div = document.createElement("div");
    this.div.id = `${this.id}-container`;
    this.div.className = "inputLine";
    parent.appendChild(this.div);

    this.label = document.createElement("label");
    this.label.id = `${this.id}-label`;
    this.label.className = "inputLine";
    this.label.textContent = label;
    this.label.tabIndex = 0;
    this.label.setAttribute("role", "button");
    this.label.setAttribute("aria-pressed", parameter.lockRandomization ? "true" : "false");
    this.label.setAttribute("aria-label", `Lock randomization for ${label}`);

    const toggleLock = () => {
      this.param.lockRandomization = !this.param.lockRandomization;
      this.label.setAttribute("aria-pressed", this.param.lockRandomization ? "true" : "false");
      this.label.style.color = this.param.lockRandomization ? palette.inactive : "unset";
    };

    this.label.addEventListener("click", (event) => {
      if (event.ctrlKey) return;
      toggleLock();
    }, false);
    this.label.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleLock();
      }
    }, false);
    this.div.appendChild(this.label);

    this.container = document.createElement("div");
    this.container.className = "inputLineContainer";
    this.div.appendChild(this.container);

    this.range = document.createElement("input");
    this.range.id = `${this.id}-range`;
    this.range.setAttribute("aria-labelledby", `${this.id}-label`);
    this.range.type = "range";
    this.range.ariaLabel = `${label} Range Input`;
    this.range.ariaDescription
      = "The value of this slider is synchronized to the next spin button. Press Escape or 'r' to reset to default.";
    this.range.min = this.param.scale.minUi;
    this.range.max = this.param.scale.maxUi;
    this.range.step = this.param.step;
    this.range.value = this.param.defaultUi;
    this.range.className = "numberInputRange";
    this.container.appendChild(this.range);

    this.number = document.createElement("input");
    this.number.id = `${this.id}-number`;
    this.number.setAttribute("aria-labelledby", `${this.id}-label`);
    this.number.type = "number";
    this.number.ariaLabel = `${label} Number Input`;
    this.number.ariaDescription
      = "The value of this spin button is synchronized to the previous slider. Press Escape to reset to default.";
    this.number.min = this.param.displayDsp ? this.param.scale.minDsp : this.param.scale.minUi;
    this.number.max = this.param.maxDisplay;
    this.number.step = this.param.step === "any" ? 0.01 : this.param.step;
    this.number.className = "numberInputNumber";
    this.container.appendChild(this.number);

    this.#updateDisplay();

    this.div.addEventListener("pointerdown", (event) => {
      if (event.ctrlKey) {
        event.preventDefault();
        this.reset();
      }
    }, false);

    const endSliderGesture = () => {
      if (this.#isDragging) {
        this.#isDragging = false;
        Parameter.history?.endGesture();
      }
    };
    this.range.addEventListener("change", endSliderGesture, false);
    this.range.addEventListener("pointerup", endSliderGesture, false);
    this.range.addEventListener("pointercancel", endSliderGesture, false);
    this.range.addEventListener("input", (event) => this.onInputRange(event), false);
    this.range.addEventListener("pointerdown", (event) => {
      if (event.ctrlKey) { return; }
      this.#isDragging = true;
      Parameter.history?.beginGesture(`Slider: ${this.label.textContent || label}`);
    }, false);
    this.range.addEventListener("keydown", (event) => {
      if (event.key === "Escape" || event.key === "r") {
        event.preventDefault();
        this.reset();
      }
    }, false);

    this.number.addEventListener("change", (event) => this.onInputNumber(event), false);
    this.number.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.reset();
      }
    }, false);
  }

  #updateDisplay() {
    const isNegInf = this.param.display === -Infinity;
    if (isNegInf) {
      this.number.value = "";
      this.number.placeholder = "-Infinity";
      this.number.setAttribute("aria-valuenow", "-Infinity");
      this.number.setAttribute("aria-valuetext", "-Infinity");
    } else {
      this.number.placeholder = "";
      this.number.value = this.param.display;
      this.number.setAttribute("aria-valuenow", this.param.display);
      this.number.removeAttribute("aria-valuetext");
    }
    this.range.value = Math.max(this.param.scale.minUi, this.param.ui);
  }

  refresh() {
    this.label.setAttribute("aria-pressed", this.param.lockRandomization ? "true" : "false");
    this.label.style.color = this.param.lockRandomization ? palette.inactive : "unset";
    this.#updateDisplay();
  }

  reset() {
    this.param.resetToDefault();
    this.refresh();
    Parameter.history?.push(`Reset: ${this.label.textContent}`);
    this.onInputFunc(this.param.display);
  }

  onInputRange(event) {
    let value = event.target.valueAsNumber;
    if (isNaN(value)) value = this.param.defaultUi;
    value = clamp(value, this.param.scale.minUi, this.param.scale.maxUi);
    if (this.param.scale.minToZero && value <= this.param.scale.minUi) {
      this.param.ui = -Infinity;
    } else {
      this.param.ui = value;
    }
    this.#updateDisplay();

    // If dragging with pointer, gesture coalescing handles history at pointerup/change
    if (!this.#isDragging) { Parameter.history?.push(`Input: ${this.label.textContent}`); }

    this.onInputFunc(this.param.display);
  }

  onInputNumber(event) {
    const wasNegInf = this.param.display === -Infinity;
    let value = event.target.valueAsNumber;
    const rawText = event.target.value.trim();

    if (isNaN(value)) {
      if (rawText === "" || rawText === "-Infinity" || rawText === "-inf") {
        value = this.param.scale.minToZero ? (this.param.displayDsp ? 0 : -Infinity)
                                           : this.param.defaultDisplay;
      } else {
        value = this.param.defaultDisplay;
      }
    } else {
      const step = this.param.step === "any" ? 0.01 : this.param.step;
      const minFinite = this.param.displayDsp ? this.param.scale.minDsp : this.param.scale.minUi;

      if (wasNegInf && value <= minFinite) {
        value = minFinite + step;
      } else if (this.param.scale.minToZero) {
        if (this.param.displayDsp && value <= this.param.scale.minDsp) {
          value = 0;
        } else if (!this.param.displayDsp && value <= this.param.scale.minUi) {
          value = -Infinity;
        }
      }
      value = clamp(value, this.param.minDisplay, this.param.maxDisplay);
    }

    this.param.display = value;
    this.#updateDisplay();
    Parameter.history?.push(`Input: ${this.label.textContent}`);
    this.onInputFunc(this.param.display);
  }
}
