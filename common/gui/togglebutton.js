// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {Parameter} from "../parameter.js";
import {generateWidgetId} from "../util.js";

export class ToggleButton {
  constructor(parent, label, id, className, defaultState, onClickFunc) {
    this.className = className === undefined ? "" : className;
    this.onClickFunc = onClickFunc;
    this.nState = 2;
    this.id = id !== undefined ? id : generateWidgetId("toggleButton", label);

    this.button = document.createElement("input");
    this.button.type = "button";
    this.button.value = label;
    this.button.ariaLabel = label;
    this.button.id = this.id;
    this.button.addEventListener("click", (event) => this.onClick(event), false);
    parent.appendChild(this.button);

    this.setState(defaultState);
  }

  setState(state) {
    console.assert(
      Number.isInteger(state) && state >= 0, "ToggleButton.state must be 0 or positive integer.",
      new Error());
    this.state = state;
    this.button.className = this.className;
    this.button.classList.add(`toggleState${this.state}`);
    this.button.setAttribute("aria-pressed", state > 0 ? "true" : "false");
  }

  onClick(event) {
    this.setState((this.state + 1) % this.nState);
    this.onClickFunc(this.state);
  }
}

export class ToggleButtonLine {
  constructor(parent, items, parameter, onClickFunc) {
    this.items = items;
    this.param = parameter;
    this.onClickFunc = onClickFunc;
    this.id = generateWidgetId("toggleButtonLine", this.items?.[0] ?? "toggle");
    this.button = new ToggleButton(
      parent,
      this.items[this.param.defaultUi],
      `${this.id}-button`,
      "toggleButtonLine",
      this.param.defaultUi,
      (state) => this.onClick(state),
    );
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
    Parameter.history?.push(`Toggle: ${this.items[this.param.ui]}`);
    this.onClickFunc(state);
  }
}
