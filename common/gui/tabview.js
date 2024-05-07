// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

export class TabView {
  /**
  ```
  contentFunc = (parent) => {
    // Add contents to parent.
    return {
      index, // int, index >= 0.
      label, // string.
    };
  };
  ```
  */
  constructor(parent, radioButtonName, contentFuncs) {
    this.radioButtonName = radioButtonName;

    this.div = document.createElement("div");
    this.div.className = "tabViewContainer";
    parent.appendChild(this.div);

    this.buttonRegion = document.createElement("div");
    this.buttonRegion.className = "tabViewButtonRegion";
    this.div.appendChild(this.buttonRegion);

    this.contentRegion = document.createElement("div");
    this.contentRegion.className = "tabViewContentRegion";
    this.div.appendChild(this.contentRegion);

    this.tabs = [];
    for (let cf of contentFuncs) this.addTab(cf);
    this.selectTab(0);
  }

  addTab(contentFunc) {
    let tab = {};

    tab.contentDiv = document.createElement("div");
    tab.contentDiv.className = "tabViewContent";
    tab.contentDiv.style.display = "none";
    this.contentRegion.appendChild(tab.contentDiv);

    tab.tabInfo = contentFunc(tab.contentDiv);

    tab.label = document.createElement("label");
    tab.label.classList.add("tabRadioLabel");
    tab.label.classList.add("tabRadioLabelInactive");
    tab.label.addEventListener(
      "mousedown", (event) => this.#onChange(tab.tabInfo.index), false);
    this.buttonRegion.appendChild(tab.label);

    tab.radio = document.createElement("input");
    tab.radio.type = "radio";
    tab.radio.name = this.radioButtonName;
    tab.radio.value = tab.tabInfo.index;
    tab.radio.className = "tabRadioButton";
    tab.radio.addEventListener(
      "change", (event) => this.#onChange(tab.tabInfo.index), false);
    tab.label.appendChild(tab.radio);

    tab.labelText = document.createElement("span");
    tab.labelText.append(tab.tabInfo.label);
    tab.label.appendChild(tab.labelText);

    this.tabs.push(tab);
  }

  #onChange(index) { this.selectTab(index); }

  selectTab(index) {
    if (index < 0 || index >= this.tabs.length) return;

    for (let k = 0; k < this.tabs.length; ++k) {
      const tab = this.tabs[k];
      if (k === index) {
        tab.label.classList.replace("tabRadioLabelInactive", "tabRadioLabelActive");
        tab.radio.checked = true;
        tab.contentDiv.style.display = "";
        for (let [key, widget] of Object.entries(tab.tabInfo.widgets)) {
          const div = widget?.div;
          if (div === undefined) continue;
          div.style.display = "";
        }
      } else {
        tab.label.classList.replace("tabRadioLabelActive", "tabRadioLabelInactive");
        tab.radio.checked = false;
        tab.contentDiv.style.display = "none";
        for (let [key, widget] of Object.entries(tab.tabInfo.widgets)) {
          const div = widget?.div;
          if (div === undefined) continue;
          div.style.display = "none";
        }
      }
    }
  }

  refresh() {
    for (let tab of this.tabs) {
      const widgets = tab.tabInfo.widgets;
      for (let [key, widget] of Object.entries(widgets)) {
        widget?.refresh();
      }
    }
  }
}
