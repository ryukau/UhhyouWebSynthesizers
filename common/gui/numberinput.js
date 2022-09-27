// Copyright 2022 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {clamp} from "../util.js";

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
    this.div.appendChild(this.label);

    this.range = document.createElement("input");
    this.range.type = "range";
    this.range.ariaLabel = label + " Range Input";
    this.range.ariaDescription
      = "The value of this slider is synchronized to the next spin button. Slider usually provides more human friendly value scaling. For example, decibel for amplitude, MIDI note number for frequency, and so on. Slider is intuitive, but not so precise.";
    this.range.min = this.param.scale.minUi;
    this.range.max = this.param.scale.maxUi;
    this.range.step = this.param.step;
    this.range.value = this.param.defaultUi;
    this.range.className = "numberInputRange";
    this.div.appendChild(this.range);

    this.number = document.createElement("input");
    this.number.type = "number";
    this.range.ariaLabel = label + " Number Input";
    this.range.ariaDescription
      = "The value of this spin button is synchronized to the previous slider. Spin button usually provides control for raw DSP values. Spin button is precise, but might be unintuitive.";
    this.number.min = this.param.minDisplay;
    this.number.max = this.param.maxDisplay;
    this.number.step = this.param.step;
    this.number.value = this.param.display;
    this.number.className = "numberInputNumber";
    this.div.appendChild(this.number);

    this.range.addEventListener("input", (event) => this.onInputRange(event), false);
    this.number.addEventListener("change", (event) => this.onInputNumber(event), false);
  }

  refresh() {
    this.range.value = this.param.ui;
    this.number.value = this.param.display;
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
