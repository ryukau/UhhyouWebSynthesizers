// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {option, select} from "./combobox.js";
import {ToggleButton} from "./togglebutton.js";

export {BarBox} from "./barbox.js";
export {BezierEnvelopeView} from "./bezierenvelopeview.js";
export {CheckBoxLine} from "./checkbox.js";
export {ComboBoxLine, option, select} from "./combobox.js";
export {MultiCheckBoxVertical} from "./multicheckbox.js"
export {NumberInput} from "./numberinput.js";
export {TabView} from "./tabview.js"
export {ToggleButton, ToggleButtonLine} from "./togglebutton.js";
export {WaveformXYPad} from "./waveformxypad.js"
export {WaveView} from "./waveview.js";

export function refresh(ui) {
  for (const key in ui) {
    if (Array.isArray(ui[key])) {
      ui[key].array.forEach(element => { element?.refresh(); });
    } else {
      ui[key].refresh?.();
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

  return details;
}

export function pageTitle(parent) {
  const title = document.createElement("h1");
  parent.appendChild(title);

  const link = document.createElement("a");
  link.href = "../index.html";
  title.appendChild(link);

  const img = document.createElement("img");
  img.src = "../style/favicon/favicon.svg";
  img.alt = "Logo image.";
  img.title = "Go back to index page."
  img.style.height = "2rem";
  img.style.verticalAlign = "middle";
  img.style.marginRight = "0.25em";
  link.appendChild(img);

  const linkText = document.createElement("span");
  linkText.textContent = "Index";
  linkText.style.marginRight = "0.25em";
  link.appendChild(linkText);

  const separator = document.createElement("span");
  separator.textContent = "/";
  separator.style.marginRight = "0.25em";
  title.appendChild(separator);

  const pageName = document.createElement("span");
  pageName.textContent = document.title;
  title.appendChild(pageName);
}

export function playControl(
  parent,
  playFunc,
  stopFunc,
  saveFunc,
  quickSaveFunc,
  randomizeFunc,
  randomizeRecipes,
  pushRecipeFunc,
  exportRecipeFunc,
  importRecipeFunc,
) {
  const pc = {};

  pc.divPlayControl = div(parent, null, "playControl");

  const defaultName = " - Default";
  const defaultRandom
    = randomizeRecipes.includes(defaultName) ? defaultName : randomizeRecipes[0];
  pc.selectRandom = select(
    pc.divPlayControl, "Randomize Recipe", "randomRecipe", undefined, randomizeRecipes,
    defaultRandom, randomizeFunc);
  pc.buttonRandom = Button(pc.divPlayControl, "Random", randomizeFunc);
  pc.buttonRandom.id = "randomRecipe";

  pc.spanPlayControlFiller = span(pc.divPlayControl, "playControlFiller", undefined);

  pc.buttonPlay = Button(pc.divPlayControl, "Play", playFunc);
  pc.buttonStop = Button(pc.divPlayControl, "Stop", stopFunc);
  pc.buttonSave = Button(pc.divPlayControl, "Save", saveFunc);
  pc.togglebuttonQuickSave = new ToggleButton(
    pc.divPlayControl, "QuickSave", undefined, undefined, 0, quickSaveFunc);

  pc.divRecipeControl = div(parent, null, "playControl");
  pc.buttonPush = Button(pc.divRecipeControl, "Push", pushRecipeFunc);
  pc.buttonExport = Button(pc.divRecipeControl, "Export", exportRecipeFunc);
  pc.buttonImport = Button(pc.divRecipeControl, "Import", importRecipeFunc);

  return pc;
}

export class RecipeExportDialog {
  constructor(parent, confirmFunc) {
    this.dialog = document.createElement("dialog");
    this.dialog.classList.add("recipeExport");
    this.dialog.addEventListener("click", (ev) => {
      const rect = ev.target.getBoundingClientRect();
      const clickedInDialog = rect.top <= ev.clientY && ev.clientY <= rect.bottom
        && rect.left <= ev.clientX && ev.clientX <= rect.right;
      if (!clickedInDialog) ev.target.close();
    });
    parent.appendChild(this.dialog);

    this.heading = heading(this.dialog, 2, "Export Recipe", null, null);

    this.divAuthor = div(this.dialog, null, "dialogTextInputLine");
    this.labelAuthor = createGenericElement("label", this.divAuthor, null, null);
    this.labelAuthor.textContent = "Author";
    this.textInputAuthor = createGenericElement("input", this.divAuthor, null, null);
    this.textInputAuthor.type = "text";
    this.textInputAuthor.spellcheck = false;

    this.divRecipe = div(this.dialog, null, "dialogTextInputLine");
    this.labelRecipe = createGenericElement("label", this.divRecipe, null, null);
    this.labelRecipe.textContent = "Recipe";
    this.textInputRecipe = createGenericElement("input", this.divRecipe, null, null);
    this.textInputRecipe.type = "text";
    this.textInputRecipe.spellcheck = false;

    this.divConfirm = div(this.dialog, null, "dialogConfirmButtonLine");
    this.buttonExport = Button(this.divConfirm, "Save", (ev) => {
      confirmFunc(ev);
      this.dialog.close();
    });
    this.divConfirmCenterPad = div(this.divConfirm, null, "dialogConfirmCenterPad");
    this.buttonCancel = Button(this.divConfirm, "Cancel", () => { this.dialog.close(); });

    this.divDescription = div(this.dialog, null, "dialogDescription");
    this.pDescriptionFormat = paragraph(this.divDescription, null, null);
    this.pDescriptionFormat.textContent
      = "The recipe will be displayed as \"Author - Recipe\".";
    this.pDescriptionAuthor = paragraph(this.divDescription, null, "pDialogBottomMost");
    this.pDescriptionAuthor.textContent = "Set unique \"Author\" to avoid name conflict.";
  }

  open() { this.dialog.showModal(); }

  get author() { return this.textInputAuthor.value; }
  get recipeName() { return this.textInputRecipe.value; }
}

export class RecipeImportDialog {
  constructor(parent, onLoadFunc) {
    this.onLoadFunc = onLoadFunc;

    this.dialog = document.createElement("dialog");
    this.dialog.classList.add("recipeImport");
    this.dialog.addEventListener("click", (ev) => {
      const rect = ev.target.getBoundingClientRect();
      const clickedInDialog = rect.top <= ev.clientY && ev.clientY <= rect.bottom
        && rect.left <= ev.clientX && ev.clientX <= rect.right;
      if (!clickedInDialog) ev.target.close();
    });
    parent.appendChild(this.dialog);

    this.heading = heading(this.dialog, 2, "Import Recipe", null, null);

    this.divDragAndDropArea = div(this.dialog, "RecipeImportDragAndDropArea", null);
    this.divDragAndDropArea.addEventListener("drop", (e) => this.#onDropFile(e));
    this.divDragAndDropArea.addEventListener("dragover", (e) => e.preventDefault());

    this.spanDragAndDropArea = span(this.divDragAndDropArea, null, null);
    this.spanDragAndDropArea.textContent = "Drag & Drop .json Here";

    this.divInputContainer = div(this.dialog, null, "RecipeImportInputContainer");

    this.inputFile = createGenericElement("input", this.divInputContainer, null, null);
    this.inputFile.type = "file";
    this.inputFile.accept = ".json,application/json";
    this.inputFile.multiple = true;
    this.inputFile.addEventListener("change", (e) => this.#onInputFileChange(e));
  }

  open() { this.dialog.showModal(); }

  #readRecipeJsonFile(file) {
    const reader = new FileReader();
    reader.addEventListener(
      "load", (ev) => { this.onLoadFunc(ev, JSON.parse(reader.result)); });
    reader.addEventListener(
      "error",
      (ev) => { console.error(`Failed to load ${file.name}`, new Error(reader.error)); });
    reader.addEventListener("abort", (ev) => {
      console.warn(`Aborted to load ${file.name}.`, new Error(reader.error));
    });
    reader.readAsText(file, "utf-8");
  }

  #onInputFileChange(event) {
    for (const file of this.inputFile.files) this.#readRecipeJsonFile(file);
    this.dialog.close();
  }

  #onDropFile(event) {
    event.preventDefault();
    for (const file of event.dataTransfer.files) this.#readRecipeJsonFile(file);
    this.dialog.close();
  }
}
