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
    this.buttonRegion.setAttribute("role", "tablist");
    this.buttonRegion.setAttribute("aria-label", radioButtonName);
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

    const tabIndex = tab.tabInfo.index;
    const tabId = `${this.radioButtonName}-tab-${tabIndex}`;
    const panelId = `${this.radioButtonName}-panel-${tabIndex}`;

    tab.contentDiv.setAttribute("role", "tabpanel");
    tab.contentDiv.setAttribute("id", panelId);
    tab.contentDiv.setAttribute("aria-labelledby", tabId);
    tab.contentDiv.tabIndex = 0;

    tab.label = document.createElement("label");
    tab.label.classList.add("tabRadioLabel");
    tab.label.classList.add("tabRadioLabelInactive");
    tab.label.setAttribute("role", "tab");
    tab.label.setAttribute("id", tabId);
    tab.label.setAttribute("aria-controls", panelId);
    tab.label.setAttribute("aria-selected", "false");
    tab.label.tabIndex = tabIndex === 0 ? 0 : -1;

    tab.label.addEventListener("mousedown", (event) => this.#onChange(tab.tabInfo.index), false);
    tab.label.addEventListener("keydown", (event) => {
      let targetIndex = -1;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        targetIndex = (tab.tabInfo.index + 1) % this.tabs.length;
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        targetIndex = (tab.tabInfo.index - 1 + this.tabs.length) % this.tabs.length;
      } else if (event.key === "Home") {
        targetIndex = 0;
      } else if (event.key === "End") {
        targetIndex = this.tabs.length - 1;
      }
      if (targetIndex >= 0) {
        event.preventDefault();
        this.selectTab(targetIndex);
        this.tabs[targetIndex].label.focus();
      }
    }, false);
    this.buttonRegion.appendChild(tab.label);

    tab.radio = document.createElement("input");
    tab.radio.type = "radio";
    tab.radio.name = this.radioButtonName;
    tab.radio.value = tab.tabInfo.index;
    tab.radio.className = "tabRadioButton";
    tab.radio.tabIndex = -1;
    tab.radio.addEventListener("change", (event) => this.#onChange(tab.tabInfo.index), false);
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
        tab.label.setAttribute("aria-selected", "true");
        tab.label.tabIndex = 0;
        tab.radio.checked = true;
        tab.contentDiv.style.display = "";
        for (let [key, widget] of Object.entries(tab.tabInfo.widgets)) {
          const div = widget?.div;
          if (div === undefined) continue;
          div.style.display = "";
        }
      } else {
        tab.label.classList.replace("tabRadioLabelActive", "tabRadioLabelInactive");
        tab.label.setAttribute("aria-selected", "false");
        tab.label.tabIndex = -1;
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
      for (let [key, widget] of Object.entries(widgets)) { widget?.refresh?.(); }
    }
  }
}
