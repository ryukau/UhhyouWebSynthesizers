import {ComboBoxLine, select} from "./combobox.js";

export {BarBox} from "./barbox.js";
export {ComboBoxLine, select} from "./combobox.js";
export {NumberInput} from "./numberinput.js";
export {ToggleButton} from "./togglebutton.js";
export {WaveView} from "./waveview.js";

export function refresh(ui) {
  let dest = {};
  for (const key in ui) {
    if (Array.isArray(ui[key])) {
      dest[key] = ui[key].array.forEach(element => { element.refresh(); });
    } else if (ui[key] instanceof ComboBoxLine) {
      // Do nothing.
    } else {
      dest[key] = ui[key].refresh();
    }
  }
}

export function Button(parent, label, onClickFunc) {
  let element = document.createElement("input");
  element.type = "button";
  element.value = label;
  element.ariaLabel = label;
  element.addEventListener("click", (event) => onClickFunc(event), false);
  parent.appendChild(element);
  return element;
}

function createGenericElement(tagName, parent, id, className) {
  let element = document.createElement(tagName);
  if (typeof id === "string") element.id = id;
  if (typeof className === "string") element.className = className;
  parent.appendChild(element);
  return element;
}

export function div(parent, id, className) {
  return createGenericElement("div", parent, id, className);
}

export function span(parent, id, className) {
  return createGenericElement("span", parent, id, className);
}

export function paragraph(parent, id, className) {
  return createGenericElement("p", parent, id, className);
}

export function heading(parent, level, text, id, className) {
  console.assert(level >= 1 && level <= 6, "Heading level out of range.", new Error());
  let element = createGenericElement(`h${level}`, parent, id, className);
  element.textContent = text;
  return element;
}

export function details(parent, summaryText, id, className, isOpen = true) {
  let details = createGenericElement("details", parent, id, className);
  if (isOpen) details.setAttribute("open", "");

  let summary = createGenericElement("summary", details, id, className);
  summary.textContent = summaryText;

  div(details, undefined, "summaryBottomPad");

  return details;
}
