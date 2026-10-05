// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {clamp} from "../util.js";

import {palette} from "./palette.js";

export class NumberInput {
  constructor(parent, label, parameter, onInputFunc) {
    this.param = parameter;
    this.onInputFunc = onInputFunc;

    this.div = document.createElement("div");
    this.div.className = "inputLine";
    parent.appendChild(this.div);

    this.label = document.createElement("label");
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
    this.number.type = "number";
    this.number.ariaLabel = `${label} Number Input`;
    this.number.ariaDescription
      = "The value of this spin button is synchronized to the previous slider. Press Escape to reset to default.";
    this.number.min = this.param.minDisplay;
    this.number.max = this.param.maxDisplay;
    this.number.step = this.param.step === "any" ? 0.01 : this.param.step;
    this.number.value = this.param.display;
    this.number.className = "numberInputNumber";
    this.container.appendChild(this.number);

    this.div.addEventListener("pointerdown", (event) => {
      if (event.ctrlKey) {
        event.preventDefault();
        this.reset();
      }
    }, false);

    this.range.addEventListener("input", (event) => this.onInputRange(event), false);
    this.number.addEventListener("change", (event) => this.onInputNumber(event), false);

    this.number.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.reset();
      }
    }, false);

    this.range.addEventListener("keydown", (event) => {
      if (event.key === "Escape" || event.key === "r") {
        event.preventDefault();
        this.reset();
      }
    }, false);
  }

  refresh() {
    this.label.setAttribute("aria-pressed", this.param.lockRandomization ? "true" : "false");
    this.label.style.color = this.param.lockRandomization ? palette.inactive : "unset";
    this.range.value = this.param.ui;
    this.number.value = this.param.display;
  }

  reset() {
    this.param.resetToDefault();
    this.refresh();
    this.onInputFunc(this.param.display);
  }

  onInputRange(event) {
    let value = event.target.valueAsNumber;
    if (isNaN(value)) value = this.param.defaultUi;
    value = clamp(value, this.param.scale.minUi, this.param.scale.maxUi);
    this.param.ui = value;
    this.number.value = this.param.display;
    this.onInputFunc(value);
  }

  onInputNumber(event) {
    let value = event.target.valueAsNumber;
    if (isNaN(value)) value = this.param.defaultDisplay;
    value = clamp(value, this.param.minDisplay, this.param.maxDisplay);
    this.param.display = value;
    this.number.value = value;
    this.range.value = this.param.ui;
    this.onInputFunc(value);
  }
}
