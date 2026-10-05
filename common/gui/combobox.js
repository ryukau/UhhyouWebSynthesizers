// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {palette} from "./palette.js";

export function option(parent, label, id, className) {
  console.assert(typeof label === "string", "label must be string.", new Error());

  let opt = document.createElement("option");
  if (typeof id === "string") opt.id = id;
  if (typeof className === "string") opt.className = className;
  opt.textContent = label;
  opt.value = label;
  parent.appendChild(opt);
  return opt;
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
    select.selectedIndex >= 0, "defaultValue doesn't exist in provided items", new Error());

  return select;
}

export class ComboBoxLine {
  constructor(parent, label, parameter, onChangeFunc) {
    this.param = parameter;
    this.onChangeFunc = onChangeFunc;

    this.div = document.createElement("div");
    this.div.className = "inputLine";
    parent.appendChild(this.div);
    if (typeof label === "string" || label instanceof String) {
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

      this.label.addEventListener("click", () => toggleLock(), false);
      this.label.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggleLock();
        }
      }, false);
      this.div.appendChild(this.label);
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

  refresh() {
    if (this.label) {
      this.label.setAttribute("aria-pressed", this.param.lockRandomization ? "true" : "false");
      this.label.style.color = this.param.lockRandomization ? palette.inactive : "unset";
    }
    this.select.value = this.options[this.param.ui].value;
  }

  random() {
    const index = Math.floor(Math.random() * this.options.length);
    this.select.value = this.options[index].value;
  }

  onChange(event) {
    this.param.ui = this.param.scale.items.indexOf(event.target.value);
    this.onChangeFunc();
  }
}
