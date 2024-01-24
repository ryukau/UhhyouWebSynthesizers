// Copyright 2024 Takamitsu Endo
// SPDX-License-Identifier: Apache-2.0

import {palette} from "./palette.js";
import {ToggleButton} from "./togglebutton.js";

export class CheckBoxLine {
  constructor(parent, label, items, parameter, onClickFunc) {
    this.div = document.createElement("div");
    this.div.className = "checkBoxLine";
    parent.appendChild(this.div);

    this.label = document.createElement("label");
    this.label.className = "checkBoxLine";
    this.label.textContent = label;
    this.div.appendChild(this.label);

    this.items = items;
    this.param = parameter;
    this.onClickFunc = onClickFunc;
    this.button = new ToggleButton(
      this.div,
      this.items[this.param.defaultUi],
      undefined,
      "checkBoxLine",
      this.param.defaultUi,
      (state) => this.onClick(state),
    );

    this.label.addEventListener("pointerdown", (event) => {
      this.param.lockRandomization = !this.param.lockRandomization;
      this.label.style.color = this.param.lockRandomization ? palette.inactive : "unset";
    }, false);
  }

  refresh() {
    this.button.button.value = this.items[this.param.ui];
    this.button.button.ariaLabel = this.items[this.param.ui];
    this.button.setState(this.param.ui);
  }

  onClick(state) {
    this.param.ui = state;
    this.button.button.value = this.items[this.param.ui];
    this.button.button.ariaLabel = this.items[this.param.ui];
    this.onClickFunc(state);
  }
}
