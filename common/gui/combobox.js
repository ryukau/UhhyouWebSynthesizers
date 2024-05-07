// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {palette} from "./palette.js";

export function option(parent, label, id, className) {
  console.assert(typeof label === "string", "label must be string.", new Error());

  if (typeof id === "string") element.id = id;
  if (typeof className === "string") element.className = className;

  let option = document.createElement("option");
  option.textContent = label;
  option.value = label;
  parent.appendChild(option);
  return option;
}

export function select(parent, label, id, className, items, defaultValue, onChangeFunc) {
  let select = document.createElement("select");
  select.ariaLabel = label;
  if (id !== undefined) select.id = id;
  if (className !== undefined) select.className = className;
  select.addEventListener("change", (event) => onChangeFunc(event), false);
  parent.appendChild(select);

  for (const item of items) option(select, item);

  select.value = defaultValue;
  console.assert(
    select.selectedIndex >= 0, "defaultValue doesn't exist in provided items",
    new Error());

  return select;
}

export class ComboBoxLine {
  constructor(parent, label, parameter, onChangeFunc) {
    this.param = parameter;
    this.onChangeFunc = onChangeFunc;

    this.div = document.createElement("div");
    this.div.className = "inputLine";
    parent.appendChild(this.div);
    if (typeof label === 'string' || label instanceof String) {
      this.label = document.createElement("label");
      this.label.className = "inputLine";
      this.label.textContent = label;
      this.div.appendChild(this.label);

      this.label.addEventListener("pointerdown", (event) => {
        this.param.lockRandomization = !this.param.lockRandomization;
        this.label.style.color
          = this.param.lockRandomization ? palette.inactive : "unset";
      }, false);
    }

    this.container = document.createElement("div");
    this.container.className = "inputLineContainer";
    this.div.appendChild(this.container);

    this.select = select(
      this.container,
      label,
      undefined,
      "inputLine",
      this.param.scale.items,
      this.param.scale.items[this.param.defaultUi],
      (e) => this.onChange(e),
    );

    this.options = Array.from(this.select.children);
  }

  get value() { return this.select.value; }

  refresh() { this.select.value = this.options[this.param.ui].value; }

  random() {
    const index = Math.floor(Math.random() * this.options.length);
    this.select.value = this.options[index].value;
  }

  onChange(event) {
    this.param.ui = this.param.scale.items.indexOf(event.target.value);
    this.onChangeFunc();
  }
}
