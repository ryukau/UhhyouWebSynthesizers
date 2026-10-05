// Copyright Takamitsu Endo (ryukau@gmail.com)
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
    this.label.tabIndex = 0;
    this.label.setAttribute("role", "button");
    this.label.setAttribute("aria-pressed", parameter.lockRandomization ? "true" : "false");
    this.label.setAttribute("aria-label", `Lock randomization for ${label}`);

    const toggleLock = () => {
      this.param.lockRandomization = !this.param.lockRandomization;
      this.label.setAttribute("aria-pressed", this.param.lockRandomization ? "true" : "false");
      this.label.style.color = this.param.lockRandomization ? palette.inactive : "unset";
    };

    this.label.addEventListener("click", () => toggleLock(), false);
    this.label.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleLock();
      }
    }, false);
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
  }

  refresh() {
    this.label.setAttribute("aria-pressed", this.param.lockRandomization ? "true" : "false");
    this.label.style.color = this.param.lockRandomization ? palette.inactive : "unset";
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
