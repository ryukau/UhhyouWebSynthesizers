// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {HistoryManager} from "../parameter.js";
import {generateWidgetId} from "../util.js";

import {option, select} from "./combobox.js";
import {ToggleButton} from "./togglebutton.js";

export {AudioLoader} from "./audioloader.js";
export {BarBox} from "./barbox.js";
export {BezierEnvelopeView} from "./bezierenvelopeview.js";
export {CheckBoxLine} from "./checkbox.js";
export {ComboBoxLine, option, select} from "./combobox.js";
export {EqualizerXYPad} from "./equalizerxypad.js";
export {MultiCheckBoxVertical} from "./multicheckbox.js";
export {NumberInput} from "./numberinput.js";
export {TabView} from "./tabview.js";
export {ToggleButton, ToggleButtonLine} from "./togglebutton.js";
export {WaveformXYPad} from "./waveformxypad.js";
export {WaveView} from "./waveview.js";

export function refresh(ui) {
  for (const key in ui) {
    if (Array.isArray(ui[key])) {
      ui[key].array.forEach((element) => { element?.refresh(); });
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
  element.id = generateWidgetId("btn", label);
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
  img.title = "Go back to index page.";
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
  param = null,
  onRestore = null,
) {
  const pc = {};

  if (param) {
    pc.historyManager = new HistoryManager(param, {
      onRestore: (state) => {
        if (onRestore) onRestore(state);
      },
    });
  }

  const handleRandomize = (event) => {
    if (pc.historyManager) {
      const recipeName = pc.selectRandom.value;
      pc.historyManager.transaction(`Randomize: ${recipeName}`, () => { randomizeFunc(event); });
    } else {
      randomizeFunc(event);
    }
  };

  pc.divPlayControl = div(parent, null, "playControl");

  const defaultName = " - Default";
  const defaultRandom = randomizeRecipes.includes(defaultName) ? defaultName : randomizeRecipes[0];
  pc.selectRandom = select(
    pc.divPlayControl, "Randomize Recipe", "randomRecipe", undefined, randomizeRecipes,
    defaultRandom, handleRandomize);
  pc.buttonRandom = Button(pc.divPlayControl, "Random", handleRandomize);
  pc.buttonRandom.id = "btnRandom";

  pc.spanPlayControlFiller = span(pc.divPlayControl, "playControlFiller", undefined);

  pc.buttonPlay = Button(pc.divPlayControl, "Play", playFunc);
  pc.buttonPlay.id = "btnPlay";
  pc.buttonStop = Button(pc.divPlayControl, "Stop", stopFunc);
  pc.buttonStop.id = "btnStop";
  pc.buttonSave = Button(pc.divPlayControl, "Save", saveFunc);
  pc.buttonSave.id = "btnSave";
  pc.togglebuttonQuickSave
    = new ToggleButton(pc.divPlayControl, "QuickSave", "btnQuickSave", undefined, 0, quickSaveFunc);

  pc.divRecipeControl = div(parent, null, "playControl");
  pc.buttonPush = Button(pc.divRecipeControl, "Push", pushRecipeFunc);
  pc.buttonPush.id = "btnPush";
  pc.buttonExport = Button(pc.divRecipeControl, "Export", exportRecipeFunc);
  pc.buttonExport.id = "btnExport";
  pc.buttonImport = Button(pc.divRecipeControl, "Import", importRecipeFunc);
  pc.buttonImport.id = "btnImport";

  // Placed after pc.buttonImport
  if (pc.historyManager) {
    pc.buttonUndo = Button(pc.divRecipeControl, "Undo", () => pc.historyManager.undo());
    pc.buttonUndo.id = "btnUndo";

    pc.buttonRedo = Button(pc.divRecipeControl, "Redo", () => pc.historyManager.redo());
    pc.buttonRedo.id = "btnRedo";

    pc.selectHistory = document.createElement("select");
    pc.selectHistory.id = "historyMenu";
    pc.selectHistory.ariaLabel = "Action History";
    pc.selectHistory.addEventListener(
      "change", (e) => { pc.historyManager.jumpTo(parseInt(e.target.value, 10)); });
    pc.divRecipeControl.appendChild(pc.selectHistory);

    const updateHistoryUI = () => {
      pc.buttonUndo.disabled = !pc.historyManager.canUndo;
      pc.buttonRedo.disabled = !pc.historyManager.canRedo;

      pc.selectHistory.innerHTML = "";
      pc.historyManager.entries.forEach((entry, idx) => {
        const opt = document.createElement("option");
        opt.value = idx;
        const prefix = idx === pc.historyManager.currentIndex ? "● " : "   ";
        opt.textContent = `${prefix}${idx}: ${entry.label}`;
        if (idx === pc.historyManager.currentIndex) opt.selected = true;
        pc.selectHistory.appendChild(opt);
      });
    };

    pc.historyManager.setOnUpdate(updateHistoryUI);
    updateHistoryUI();
  }

  // Global playback and undo/redo shortcut.
  window.addEventListener("keydown", (event) => {
    const targetTag = event.target.tagName?.toLowerCase();
    if (targetTag === "input" && (event.target.type === "text" || event.target.type === "number")) {
      return;
    }

    if (pc.historyManager) {
      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const modKey = isMac ? event.metaKey : event.ctrlKey;

      if (modKey && !event.shiftKey && event.code === "KeyZ") {
        event.preventDefault();
        pc.historyManager.undo();
      } else if (
        (modKey && event.shiftKey && event.code === "KeyZ")
        || (modKey && !isMac && event.code === "KeyY"))
      {
        event.preventDefault();
        pc.historyManager.redo();
      }
    }

    if (event.code === "F8" || event.code === "Numpad0") {
      event.preventDefault();
      playFunc(event);
    }
  });

  return pc;
}

export class RecipeExportDialog {
  constructor(parent, confirmFunc) {
    this.dialog = document.createElement("dialog");
    this.dialog.classList.add("recipeExport");
    this.dialog.setAttribute("aria-modal", "true");
    this.dialog.setAttribute("aria-labelledby", "recipeExportHeading");
    this.dialog.setAttribute("aria-describedby", "recipeExportDescription");
    this.dialog.addEventListener("click", (ev) => {
      const rect = ev.target.getBoundingClientRect();
      const clickedInDialog = rect.top <= ev.clientY && ev.clientY <= rect.bottom
        && rect.left <= ev.clientX && ev.clientX <= rect.right;
      if (!clickedInDialog) ev.target.close();
    });
    parent.appendChild(this.dialog);

    heading(this.dialog, 2, "Export Recipe", "recipeExportHeading");

    const createInput = (label, id) => {
      const line = div(this.dialog, null, "dialogTextInputLine");
      const lbl = createGenericElement("label", line);
      lbl.textContent = label;
      lbl.htmlFor = id;
      const input = createGenericElement("input", line, id);
      input.type = "text";
      input.spellcheck = false;
      input.ariaLabel = label;
      return input;
    };

    this.textInputAuthor = createInput("Author", "recipeExportAuthor");
    // Connects description to initial focus so screen readers announce it on open
    this.textInputAuthor.setAttribute("aria-describedby", "recipeExportDescription");
    this.textInputRecipe = createInput("Recipe", "recipeExportRecipe");

    const divConfirm = div(this.dialog, null, "dialogConfirmButtonLine");
    Button(divConfirm, "Save", (ev) => {
      confirmFunc(ev);
      this.dialog.close();
    });
    div(divConfirm, null, "dialogConfirmCenterPad");
    Button(divConfirm, "Cancel", () => { this.dialog.close(); });

    const divDescription = div(this.dialog, "recipeExportDescription", "dialogDescription");
    paragraph(divDescription).textContent = 'The recipe will be displayed as "Author - Recipe".';
    paragraph(divDescription, null, "pDialogBottomMost").textContent
      = 'Set unique "Author" to avoid name conflict.';
  }

  open() {
    this.dialog.showModal();
    this.textInputAuthor.focus();
  }

  get author() { return this.textInputAuthor.value; }
  get recipeName() { return this.textInputRecipe.value; }
}

export class RecipeImportDialog {
  constructor(parent, onLoadFunc) {
    this.onLoadFunc = onLoadFunc;

    this.dialog = document.createElement("dialog");
    this.dialog.classList.add("recipeImport");
    this.dialog.setAttribute("aria-modal", "true");
    this.dialog.setAttribute("aria-labelledby", "recipeImportHeading");
    this.dialog.setAttribute("aria-describedby", "RecipeImportDragAndDropArea");
    this.dialog.addEventListener("click", (ev) => {
      const rect = ev.target.getBoundingClientRect();
      const clickedInDialog = rect.top <= ev.clientY && ev.clientY <= rect.bottom
        && rect.left <= ev.clientX && ev.clientX <= rect.right;
      if (!clickedInDialog) ev.target.close();
    });
    parent.appendChild(this.dialog);

    this.heading = heading(this.dialog, 2, "Import Recipe", "recipeImportHeading", null);

    this.divDragAndDropArea = div(this.dialog, "RecipeImportDragAndDropArea", null);
    this.divDragAndDropArea.addEventListener("drop", (e) => this.#onDropFile(e));
    this.divDragAndDropArea.addEventListener("dragover", (e) => e.preventDefault());

    this.spanDragAndDropArea = span(this.divDragAndDropArea, null, null);
    this.spanDragAndDropArea.textContent = "Drag & Drop .json Here";

    this.divInputContainer = div(this.dialog, null, "RecipeImportInputContainer");

    this.inputFile
      = createGenericElement("input", this.divInputContainer, "recipeImportFileInput", null);
    this.inputFile.type = "file";
    this.inputFile.accept = ".json,application/json";
    this.inputFile.multiple = true;
    this.inputFile.ariaLabel = "Choose JSON files";
    this.inputFile.addEventListener("change", (e) => this.#onInputFileChange(e));
  }

  open() { this.dialog.showModal(); }

  #readRecipeJsonFile(file) {
    const reader = new FileReader();
    reader.addEventListener("load", (ev) => { this.onLoadFunc(ev, JSON.parse(reader.result)); });
    reader.addEventListener(
      "error", (ev) => { console.error(`Failed to load ${file.name}`, new Error(reader.error)); });
    reader.addEventListener(
      "abort", (ev) => { console.warn(`Aborted to load ${file.name}.`, new Error(reader.error)); });
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
