// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

import {BarBox} from "../common/gui/barbox.js";
import {ComboBoxLine} from "../common/gui/combobox.js";
import {NumberInput} from "../common/gui/numberinput.js";
import {palette, uiSize} from "../common/gui/palette.js";
import {TabView} from "../common/gui/tabview.js";
import {clamp, midiPitchToFreq} from "../common/util.js";

import {
  calculateStringPitch,
  chordTable,
  getStringNoteName,
  resolveChord,
} from "./chordresolver.js";

export const RANDOMIZATION_TAGS = [
  {id: "major", label: "Maj", defaultActive: true},
  {id: "minor", label: "Min", defaultActive: true},
  {id: "suspended", label: "Sus", defaultActive: false},
  {id: "dom7", label: "7th", defaultActive: false},
  {id: "maj7", label: "Maj7", defaultActive: false},
  {id: "min7", label: "Min7", defaultActive: false},
  {id: "dim", label: "Dim", defaultActive: false},
  {id: "aug", label: "Aug", defaultActive: false},
  {id: "altered", label: "Alt", defaultActive: false},
];

export const QUALITY_TO_TAGS = {
  "major": ["major"],
  "5": ["major"],
  "6": ["major"],
  "69": ["major"],
  "add9": ["major"],
  "add11": ["major"],

  "minor": ["minor"],
  "m6": ["minor"],
  "m69": ["minor"],
  "madd9": ["minor"],

  "sus": ["suspended"],
  "sus2": ["suspended"],
  "sus4": ["suspended"],
  "sus2sus4": ["suspended"],
  "7sus4": ["suspended", "dom7"],

  "7": ["dom7"],
  "9": ["dom7"],
  "11": ["dom7"],
  "13": ["dom7"],

  "maj7": ["maj7"],
  "maj9": ["maj7"],
  "maj11": ["maj7"],
  "maj13": ["maj7"],
  "maj7sus2": ["maj7", "suspended"],

  "m7": ["min7"],
  "m9": ["min7"],
  "m11": ["min7"],
  "mmaj7": ["min7", "maj7"],
  "mmaj9": ["min7", "maj7"],
  "mmaj11": ["min7", "maj7"],

  "dim": ["dim"],
  "dim7": ["dim"],
  "m7♭5": ["dim", "min7"],
  "mmaj7♭5": ["dim", "min7", "maj7"],

  "aug": ["aug"],
  "aug7": ["aug"],
  "aug9": ["aug"],
  "maj7#5": ["aug", "maj7"],

  "alt": ["altered"],
  "7♭9": ["altered", "dom7"],
  "7#9": ["altered", "dom7"],
  "7♭5": ["altered", "dom7"],
  "9♭5": ["altered", "dom7"],
  "9#11": ["altered", "dom7"],
  "maj7♭5": ["altered", "maj7"],
};

function decodeFrets(key) {
  const frets = [];
  for (let i = 0; i < 6; i++) {
    const val = (key >>> (5 * i)) & 0x1f;
    frets.push(val === 0 ? -1 : val - 1);
  }
  return frets;
}

function getLowestStringNote(frets, bassPitchMidi = 40) {
  const lowestIdx = frets.findIndex((f) => f >= 0);
  return lowestIdx === -1 ? null : getStringNoteName(lowestIdx, frets[lowestIdx], bassPitchMidi);
}

export function getChordRoot(chord, bassPitchMidi = 40) {
  const lowestIdx = chord.mutes.findIndex((m) => m === 0);
  if (lowestIdx === -1) return null;
  return getStringNoteName(lowestIdx, chord.frets[lowestIdx], bassPitchMidi);
}

export function buildGuitarChordLibrary(table = chordTable) {
  const library = [];
  const seen = new Set();

  for (const [keyStr, quality] of Object.entries(table)) {
    const rawFrets = decodeFrets(parseInt(keyStr, 10));
    const tags = QUALITY_TO_TAGS[quality] || ["major"];
    const hasOpenStrings = rawFrets.some((f) => f === 0);

    const addChord = (fretList) => {
      const id = fretList.join(",");
      if (seen.has(id)) return;
      seen.add(id);
      const root = getLowestStringNote(fretList);
      library.push({
        name: root ? `${root} ${quality}` : quality,
        root,
        frets: fretList.map((f) => (f < 0 ? 0 : f)),
        mutes: fretList.map((f) => (f < 0 ? 1 : 0)),
        tags,
        quality,
      });
    };

    if (hasOpenStrings) {
      if (Math.max(...rawFrets) <= 5) { addChord(rawFrets); }
    } else {
      const played = rawFrets.filter((f) => f > 0);
      if (played.length === 0) continue;
      const minF = Math.min(...played);
      const span = Math.max(...played) - minF;

      for (let base = 1; base <= 5 - span; base++) {
        addChord(rawFrets.map((f) => (f < 0 ? -1 : f - minF + base)));
      }
    }
  }

  return library;
}

export const guitarChordLibrary = buildGuitarChordLibrary(chordTable);
export const openChordLibrary = guitarChordLibrary;

export class GuitarChordSelector {
  static #cssInjected = false;

  static #injectCSS() {
    if (GuitarChordSelector.#cssInjected) return;
    if (typeof document === "undefined") return;
    GuitarChordSelector.#cssInjected = true;

    const style = document.createElement("style");
    style.id = "guitarChordSelectorStyle";
    style.textContent = `
      .chordRandomTags {
        margin: 4px var(--margin, 6px);
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .chordRandomTagsHeader {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 11px;
      }

      .chordRandomTagsActions {
        display: flex;
        gap: 4px;
      }

      .chordRandomTagsChips {
        display: flex;
        flex-wrap: wrap;
        gap: 3px;
      }

      .chordRandomTags input[type="button"] {
        height: auto;
        font-size: 10px;
        padding: 2px 6px;
        cursor: pointer;
        user-select: none;
      }

      .chordRandomTags input[type="button"]:active {
        box-shadow: inset 1px 1px 2px var(--color-shadow-main);
      }

      .chordRandomTags input[type="button"].toggleState1 {
        font-weight: var(--font-weight-strong, bold);
      }
    `;
    document.head.appendChild(style);
  }

  constructor(
    parent,
    label,
    params,
    onChange = () => {},
    width = uiSize.barboxWidth,
    height = uiSize.barboxWidth * 0.6,
  ) {
    GuitarChordSelector.#injectCSS();

    this.label = label;
    this.params = params;
    this.onChange = onChange;

    this.numStrings = 6;
    this.numFrets = 5;
    this.width = width;
    this.height = height;

    this.bassParam = this.params.bass;
    this.tuningParam = this.params.tuning;
    this.chordInfo = null;
    this.chordLibrary = guitarChordLibrary;
    this.fixRoot = false;

    this.selectedTags = new Set(
      RANDOMIZATION_TAGS.filter((t) => t.defaultActive).map((t) => t.id),
    );

    // Layout metrics
    this.paddingLeft = 56;
    this.paddingRight = 24;
    this.muteAreaHeight = 22;
    this.openAreaHeight = 22;
    this.nutY = this.muteAreaHeight + this.openAreaHeight;

    this.bottomPaddingY = 24;
    this.fretboardHeight = this.height - this.nutY - this.bottomPaddingY;
    this.fretHeight = this.fretboardHeight / this.numFrets;
    this.stringSpacing
      = (this.width - this.paddingLeft - this.paddingRight) / (this.numStrings - 1);

    this.markerRadius = 5.5;
    this.isDragging = false;
    this.prevPointerPos = null;
    this.hoverCoord = null;

    this.#buildDOM(parent);
    this.#bindEvents();
    this.refresh();

    window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
      this.#updateTagUI();
      this.draw();
    });
  }

  get dsp() { return this.getDspData(); }

  getTuningMode() { return this.tuningParam ? Math.floor(this.tuningParam.dsp) : 0; }

  getStringPitch(s, fret) {
    return calculateStringPitch(this.getTuningMode(), s, fret, this.getBassPitchMidi());
  }

  getSoundingPitches() {
    const pitches = [];
    for (let s = 0; s < this.numStrings; ++s) {
      if (this.params.mutes[s].dsp === 1) {
        pitches.push(null);
        continue;
      }
      const fret = Math.floor(this.params.frets[s].dsp);
      pitches.push(this.getStringPitch(s, fret));
    }
    return pitches;
  }

  getCurrentFrets() {
    const frets = [];
    for (let s = 0; s < this.numStrings; ++s) {
      const isMuted = this.params.mutes[s].dsp === 1;
      frets.push(isMuted ? -1 : Math.floor(this.params.frets[s].dsp));
    }
    return frets;
  }

  updateChordDisplay() {
    const frets = this.getCurrentFrets();
    const pitches = this.getSoundingPitches();
    const info = resolveChord(frets, pitches, this.getBassPitchMidi());
    this.chordInfo = info;

    if (this.chordNameElement) { this.chordNameElement.textContent = info.chordNameWithSemitones; }
    if (this.chordNotesElement) {
      this.chordNotesElement.textContent
        = info.noteNames?.length > 0 ? `[${info.noteNames.join(", ")}]` : "";
    }

    return info;
  }

  getDspData() {
    const notes = [];

    for (let s = 0; s < this.numStrings; ++s) {
      if (this.params.mutes[s].dsp === 1) continue;

      const gain = this.params.gains[s].dsp;
      if (gain <= 0) continue;

      const delaySeconds = this.params.delays[s].dsp;
      const fret = Math.floor(this.params.frets[s].dsp);
      const pitch = this.getStringPitch(s, fret);
      const frequencyHz = midiPitchToFreq(pitch);

      notes.push({
        frequencyHz,
        amplitude: gain,
        delaySeconds,
        feedback: this.params.feedbacks[s].dsp,
        lpCutoffRelative: this.params.lpCutoffs[s].dsp,
        pickPosition: this.params.pickPositions[s].dsp,
      });
    }

    if (notes.length > 0) {
      const smallestDelay = Math.min(...notes.map((n) => n.delaySeconds));
      for (const note of notes) {
        note.delaySeconds = Math.max(0, note.delaySeconds - smallestDelay);
      }
    }

    return notes;
  }

  getBassPitchMidi() { return this.bassParam.ui; }

  #getLockableParams() {
    const list = [...this.params.frets, ...this.params.mutes, this.bassParam];
    if (this.tuningParam) list.push(this.tuningParam);
    return list;
  }

  #updateDspAndNotify() {
    const dspNotes = this.getDspData();
    this.onChange(dspNotes);
  }

  #buildDOM(parent) {
    this.container = document.createElement("div");
    this.container.className = "chordSelectorContainer";
    parent.appendChild(this.container);

    if (this.label) {
      this.labelElement = document.createElement("label");
      this.labelElement.className = "chordSelectorLabel";
      this.labelElement.textContent = this.label;
      this.labelElement.style.display = "block";
      this.labelElement.style.textAlign = "center";
      this.labelElement.style.color = "var(--color-text-main)";
      this.labelElement.style.cursor = "pointer";
      this.labelElement.style.userSelect = "none";
      this.labelElement.style.marginBottom = "4px";

      this.labelElement.addEventListener("pointerdown", () => {
        const lockables = this.#getLockableParams();
        const newState = !lockables[0].lockRandomization;
        for (const prm of lockables) prm.lockRandomization = newState;
        this.labelElement.style.color = newState ? palette.inactive : "unset";
      }, false);

      this.container.appendChild(this.labelElement);
    }

    if (this.tuningParam) {
      this.tuningControl = new ComboBoxLine(
        this.container,
        "Tuning",
        this.tuningParam,
        () => {
          this.#updateDspAndNotify();
          this.updateChordDisplay();
          this.draw();
        },
      );
    }

    this.bassControl = new NumberInput(
      this.container,
      "Bass Note",
      this.bassParam,
      () => {
        this.#updateDspAndNotify();
        this.updateChordDisplay();
        this.draw();
      },
    );

    this.#buildTagToolbar(this.container);

    this.chordDisplay = document.createElement("div");
    this.chordDisplay.className = "chordDisplay";
    this.chordDisplay.style.margin = "4px var(--margin, 6px)";
    this.chordDisplay.style.padding = "4px 8px";
    this.chordDisplay.style.borderRadius = "var(--border-radius-mid)";
    this.chordDisplay.style.color = "var(--color-text-main)";
    this.chordDisplay.style.display = "flex";
    this.chordDisplay.style.justifyContent = "center";
    this.chordDisplay.style.alignItems = "center";
    this.chordDisplay.style.gap = "6px";

    this.chordNameElement = document.createElement("span");
    this.chordNameElement.textContent = "--";
    this.chordDisplay.appendChild(this.chordNameElement);

    this.chordNotesElement = document.createElement("span");
    this.chordNotesElement.className = "chordNotes";
    this.chordNotesElement.style.color = "var(--color-text-dim)";
    this.chordDisplay.appendChild(this.chordNotesElement);

    this.container.appendChild(this.chordDisplay);

    const canvasWrap = document.createElement("div");
    canvasWrap.className = "canvasMargin";
    canvasWrap.style.width = "fit-content";
    this.container.appendChild(canvasWrap);

    this.canvas = document.createElement("canvas");
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.canvas.tabIndex = 0;
    this.canvas.style.display = "block";
    this.canvas.style.cursor = "pointer";
    this.canvas.style.touchAction = "none";
    canvasWrap.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d");

    this.tabView = new TabView(this.container, "guitarChordBarBoxTab", [
      (tabParent) => {
        this.gainBarBox = new BarBox(
          tabParent,
          "String Gain [dB]",
          this.width,
          uiSize.barboxHeight,
          this.params.gains,
          () => this.#updateDspAndNotify(),
        );
        return {
          index: 0,
          label: "Gain",
          widgets: {gain: this.gainBarBox},
        };
      },
      (tabParent) => {
        this.pickPositionBarBox = new BarBox(
          tabParent,
          "String Pick Position [ratio]",
          this.width,
          uiSize.barboxHeight,
          this.params.pickPositions,
          () => this.#updateDspAndNotify(),
        );
        return {
          index: 1,
          label: "Pick Pos.",
          widgets: {pickPosition: this.pickPositionBarBox},
        };
      },
      (tabParent) => {
        this.feedbackBarBox = new BarBox(
          tabParent,
          "String Feedback",
          this.width,
          uiSize.barboxHeight,
          this.params.feedbacks,
          () => this.#updateDspAndNotify(),
        );
        this.feedbackBarBox.sliderZero = 0.5;
        return {
          index: 2,
          label: "Feedback",
          widgets: {feedback: this.feedbackBarBox},
        };
      },
      (tabParent) => {
        this.lpCutoffBarBox = new BarBox(
          tabParent,
          "String LP Cutoff [st.]",
          this.width,
          uiSize.barboxHeight,
          this.params.lpCutoffs,
          () => this.#updateDspAndNotify(),
        );
        return {
          index: 3,
          label: "LP Cutoff",
          widgets: {lpCutoff: this.lpCutoffBarBox},
        };
      },
      (tabParent) => {
        this.delayBarBox = new BarBox(
          tabParent,
          "Strum Delay [s]",
          this.width,
          uiSize.barboxHeight,
          this.params.delays,
          () => this.#updateDspAndNotify(),
        );
        return {
          index: 4,
          label: "Delay",
          widgets: {delay: this.delayBarBox},
        };
      },
    ]);
  }

  #buildTagToolbar(parent) {
    this.tagContainer = document.createElement("div");
    this.tagContainer.className = "chordRandomTags";

    const header = document.createElement("div");
    header.className = "chordRandomTagsHeader";

    this.tagStatusLabel = document.createElement("span");
    header.appendChild(this.tagStatusLabel);

    const actions = document.createElement("div");
    actions.className = "chordRandomTagsActions";

    const btnAll = document.createElement("input");
    btnAll.type = "button";
    btnAll.value = "All";
    btnAll.addEventListener("click", () => {
      for (const t of RANDOMIZATION_TAGS) this.selectedTags.add(t.id);
      this.#updateTagUI();
    });

    const btnNone = document.createElement("input");
    btnNone.type = "button";
    btnNone.value = "None";
    btnNone.addEventListener("click", () => {
      this.selectedTags.clear();
      this.#updateTagUI();
    });

    this.btnFixRoot = document.createElement("input");
    this.btnFixRoot.type = "button";
    this.btnFixRoot.value = "Fix Root";
    this.btnFixRoot.title = "Fix root note on chord randomization";
    this.btnFixRoot.addEventListener("click", () => {
      this.fixRoot = !this.fixRoot;
      this.#updateTagUI();
    });

    actions.appendChild(btnAll);
    actions.appendChild(btnNone);
    actions.appendChild(this.btnFixRoot);
    header.appendChild(actions);
    this.tagContainer.appendChild(header);

    const chipRow = document.createElement("div");
    chipRow.className = "chordRandomTagsChips";

    this.tagButtons = new Map();
    for (const tag of RANDOMIZATION_TAGS) {
      const btn = document.createElement("input");
      btn.type = "button";
      btn.value = tag.label;

      btn.addEventListener("click", () => {
        if (this.selectedTags.has(tag.id)) {
          this.selectedTags.delete(tag.id);
        } else {
          this.selectedTags.add(tag.id);
        }
        this.#updateTagUI();
      });

      this.tagButtons.set(tag.id, btn);
      chipRow.appendChild(btn);
    }

    this.tagContainer.appendChild(chipRow);
    parent.appendChild(this.tagContainer);
    this.#updateTagUI();
  }

  #updateTagUI() {
    for (const [tagId, btn] of this.tagButtons.entries()) {
      const isSelected = this.selectedTags.has(tagId);
      btn.classList.toggle("toggleState1", isSelected);
      btn.classList.toggle("toggleState0", !isSelected);
    }

    if (this.btnFixRoot) {
      this.btnFixRoot.classList.toggle("toggleState1", this.fixRoot);
      this.btnFixRoot.classList.toggle("toggleState0", !this.fixRoot);
    }

    if (this.tagStatusLabel) {
      if (this.selectedTags.size === 0) {
        this.tagStatusLabel.textContent = "Tags: None (Skip Randomization)";
        this.tagStatusLabel.style.color = "var(--color-warning)";
      } else {
        const labels = Array.from(this.selectedTags)
                         .map((id) => RANDOMIZATION_TAGS.find((t) => t.id === id)?.label)
                         .filter(Boolean);
        this.tagStatusLabel.textContent = `Tags: ${labels.join(", ")}`;
        this.tagStatusLabel.style.color = "var(--color-text-dim)";
      }
    }
  }

  getStringX(stringIndex) { return this.paddingLeft + stringIndex * this.stringSpacing; }

  getFretY(fretIndex) { return this.nutY + fretIndex * this.fretHeight; }

  #bindEvents() {
    this.canvas.addEventListener("pointerdown", (e) => this.#onPointerDown(e));
    this.canvas.addEventListener("pointermove", (e) => this.#onPointerMove(e));
    this.canvas.addEventListener("pointerup", (e) => this.#onPointerUp(e));
    this.canvas.addEventListener("pointercancel", (e) => this.#onPointerUp(e));
    this.canvas.addEventListener("pointerleave", () => {
      this.hoverCoord = null;
      this.draw();
    });
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    this.canvas.addEventListener("keydown", (e) => {
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        this.randomizeChord();
      }
    });
  }

  #getCanvasCoords(event) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  #onPointerDown(event) {
    this.isDragging = true;
    this.canvas.focus();
    this.canvas.setPointerCapture(event.pointerId);
    const pos = this.#getCanvasCoords(event);
    this.prevPointerPos = pos;
    this.hoverCoord = pos;
    this.#applyPosition(pos.x, pos.y, event.ctrlKey);
  }

  #onPointerMove(event) {
    const pos = this.#getCanvasCoords(event);
    this.hoverCoord = pos;

    if (this.isDragging) {
      if (this.prevPointerPos) {
        this.#interpolateTrajectory(this.prevPointerPos, pos, event.ctrlKey);
      } else {
        this.#applyPosition(pos.x, pos.y, event.ctrlKey);
      }
      this.prevPointerPos = pos;
    } else {
      this.draw();
    }
  }

  #onPointerUp(event) {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.prevPointerPos = null;
    try {
      this.canvas.releasePointerCapture(event.pointerId);
    } catch (_) {}
    this.draw();
  }

  #interpolateTrajectory(p0, p1, ctrlKey) {
    const minX = Math.min(p0.x, p1.x);
    const maxX = Math.max(p0.x, p1.x);

    for (let s = 0; s < this.numStrings; ++s) {
      const sx = this.getStringX(s);
      if (sx >= minX - 10 && sx <= maxX + 10) {
        let yAtString = p1.y;
        if (Math.abs(p1.x - p0.x) >= 1e-4) {
          const t = clamp((sx - p0.x) / (p1.x - p0.x), 0, 1);
          yAtString = p0.y + t * (p1.y - p0.y);
        }
        this.#applyPosition(sx, yAtString, ctrlKey);
      }
    }
  }

  #applyPosition(x, y, ctrlKey) {
    let nearestString = 0;
    let minDist = Infinity;
    for (let s = 0; s < this.numStrings; ++s) {
      const dist = Math.abs(x - this.getStringX(s));
      if (dist < minDist) {
        minDist = dist;
        nearestString = s;
      }
    }

    if (ctrlKey) {
      this.params.frets[nearestString].dsp = 0;
      this.params.mutes[nearestString].dsp = 0;
      this.updateChordDisplay();
      this.draw();
      this.#updateDspAndNotify();
      return;
    }

    if (y < this.muteAreaHeight) {
      this.params.mutes[nearestString].dsp = 1;
      this.updateChordDisplay();
      this.draw();
      this.#updateDspAndNotify();
      return;
    }

    if (y < this.nutY) {
      this.params.mutes[nearestString].dsp = 0;
      this.params.frets[nearestString].dsp = 0;
      this.updateChordDisplay();
      this.draw();
      this.#updateDspAndNotify();
      return;
    }

    const fretFrac = (y - this.nutY) / this.fretHeight;
    const fret = clamp(Math.floor(fretFrac) + 1, 1, this.numFrets);

    this.params.mutes[nearestString].dsp = 0;
    this.params.frets[nearestString].dsp = fret;

    this.updateChordDisplay();
    this.draw();
    this.#updateDspAndNotify();
  }

  randomizeChord() {
    const lockables = this.#getLockableParams();
    if (lockables[0].lockRandomization) return;
    if (this.selectedTags.size === 0) return;

    let pool = this.chordLibrary.filter(
      (chord) => chord.tags.some((tag) => this.selectedTags.has(tag)),
    );
    if (pool.length === 0) return;

    if (this.fixRoot) {
      const currentRoot = getLowestStringNote(this.getCurrentFrets(), this.getBassPitchMidi());
      if (currentRoot != null) {
        const rootPool = pool.filter(
          (chord) => getChordRoot(chord, this.getBassPitchMidi()) === currentRoot,
        );
        if (rootPool.length > 0) {
          pool = rootPool;
        } else {
          return;
        }
      }
    }

    const chord = pool[Math.floor(Math.random() * pool.length)];
    if (!chord) return;

    for (let s = 0; s < this.numStrings; ++s) {
      this.params.frets[s].dsp = chord.frets[s];
      this.params.mutes[s].dsp = chord.mutes[s];
    }

    this.updateChordDisplay();
    this.draw();
    this.#updateDspAndNotify();
  }

  refresh() {
    const lockables = this.#getLockableParams();
    if (this.labelElement) {
      this.labelElement.style.color = lockables[0].lockRandomization ? palette.inactive : "unset";
    }

    this.tuningControl?.refresh();
    this.bassControl.refresh();
    this.#updateTagUI();
    this.tabView.refresh();
    this.gainBarBox.refresh();
    this.feedbackBarBox.refresh();
    this.pickPositionBarBox.refresh();
    this.lpCutoffBarBox.refresh();
    this.delayBarBox.refresh();
    this.updateChordDisplay();
    this.#updateDspAndNotify();
    this.draw();
  }

  draw() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    this.updateChordDisplay();

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 0, w, h);

    // Mute and Open Zones
    ctx.fillStyle = palette.shaded;
    ctx.fillRect(0, 0, w, this.muteAreaHeight);

    ctx.fillStyle = palette.shaded;
    ctx.fillRect(0, this.muteAreaHeight, w, this.openAreaHeight);

    ctx.strokeStyle = palette.unfocused;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(this.paddingLeft - 4, this.muteAreaHeight);
    ctx.lineTo(w - this.paddingRight + 4, this.muteAreaHeight);
    ctx.stroke();
    ctx.setLineDash([]);

    // Direction labels
    const outerMarginX = 8;
    ctx.font = `8px ${palette.fontFamily}`;
    ctx.fillStyle = palette.foreground;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("Nut", outerMarginX, this.nutY);
    ctx.fillText("Bridge", outerMarginX, this.getFretY(this.numFrets));

    // Zone & Semitone labels
    const labelX = this.paddingLeft - 8;
    ctx.textAlign = "right";
    ctx.fillText("MUTE", labelX, this.muteAreaHeight * 0.5);
    ctx.fillText("OPEN", labelX, this.muteAreaHeight + this.openAreaHeight * 0.32);
    ctx.fillText("0", labelX, this.muteAreaHeight + this.openAreaHeight * 0.75);

    for (let f = 1; f <= this.numFrets; ++f) {
      ctx.fillText(`${f}`, labelX, this.getFretY(f) - this.fretHeight * 0.5);
    }

    // Nut
    ctx.strokeStyle = palette.foreground;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(this.paddingLeft - 4, this.nutY);
    ctx.lineTo(w - this.paddingRight + 4, this.nutY);
    ctx.stroke();

    // Frets
    ctx.lineWidth = 2;
    for (let f = 1; f <= this.numFrets; ++f) {
      const y = this.getFretY(f);
      ctx.beginPath();
      ctx.moveTo(this.paddingLeft, y);
      ctx.lineTo(w - this.paddingRight, y);
      ctx.stroke();
    }

    // Position Marker dots (Frets 3 & 5)
    ctx.fillStyle = palette.unfocused;
    const centerX = (this.getStringX(0) + this.getStringX(this.numStrings - 1)) * 0.5;
    for (const dotFret of [3, 5]) {
      ctx.beginPath();
      ctx.arc(centerX, this.getFretY(dotFret) - this.fretHeight * 0.5, 4, 0, 2 * Math.PI);
      ctx.fill();
    }

    // Strings (6 to 1)
    for (let s = 0; s < this.numStrings; ++s) {
      const x = this.getStringX(s);
      ctx.strokeStyle = palette.waveform;
      ctx.lineWidth = 2.4 - (s / (this.numStrings - 1)) * 1.4;
      ctx.beginPath();
      ctx.moveTo(x, this.nutY);
      ctx.lineTo(x, this.getFretY(this.numFrets));
      ctx.stroke();
    }

    // Hover Highlight
    if (this.hoverCoord) {
      let hoveredString = 0;
      let minDist = Infinity;
      for (let s = 0; s < this.numStrings; ++s) {
        const dist = Math.abs(this.hoverCoord.x - this.getStringX(s));
        if (dist < minDist) {
          minDist = dist;
          hoveredString = s;
        }
      }

      let hoveredZone = 0;
      if (this.hoverCoord.y < this.muteAreaHeight) {
        hoveredZone = -1;
      } else if (this.hoverCoord.y < this.nutY) {
        hoveredZone = 0;
      } else {
        const frac = (this.hoverCoord.y - this.nutY) / this.fretHeight;
        hoveredZone = clamp(Math.floor(frac) + 1, 1, this.numFrets);
      }

      const targetX = this.getStringX(hoveredString);
      let targetY = this.muteAreaHeight * 0.5;
      if (hoveredZone === 0) {
        targetY = this.muteAreaHeight + this.openAreaHeight * 0.5;
      } else if (hoveredZone > 0) {
        targetY = this.getFretY(hoveredZone) - this.fretHeight * 0.5;
      }

      ctx.fillStyle = palette.overlayHighlight;
      ctx.beginPath();
      ctx.arc(targetX, targetY, this.markerRadius + 2.5, 0, 2 * Math.PI);
      ctx.fill();
    }

    // Markers: Mute 'X', Open 'O', Fret Solid Circle + Microtonal Symbols
    for (let s = 0; s < this.numStrings; ++s) {
      const x = this.getStringX(s);
      const isMuted = this.params.mutes[s].dsp === 1;
      const fret = Math.floor(this.params.frets[s].dsp);
      const dev = this.chordInfo?.stringDeviations?.[s];

      if (isMuted) {
        ctx.strokeStyle = palette.highlightWarning;
        ctx.lineWidth = 2.2;
        const cy = this.muteAreaHeight * 0.5;
        const sz = this.markerRadius - 0.5;
        ctx.beginPath();
        ctx.moveTo(x - sz, cy - sz);
        ctx.lineTo(x + sz, cy + sz);
        ctx.moveTo(x + sz, cy - sz);
        ctx.lineTo(x - sz, cy + sz);
        ctx.stroke();
      } else {
        const cy = fret === 0 ? this.muteAreaHeight + this.openAreaHeight * 0.5
                              : this.getFretY(fret) - this.fretHeight * 0.5;

        ctx.beginPath();
        ctx.arc(x, cy, this.markerRadius, 0, 2 * Math.PI);
        if (fret === 0) {
          ctx.strokeStyle = palette.foreground;
          ctx.lineWidth = 2;
          ctx.stroke();
        } else {
          ctx.fillStyle = palette.foreground;
          ctx.fill();
        }

        if (dev && dev.symbol !== "·" && !dev.muted) {
          ctx.font = `${palette.fontWeightBase} 10px ${palette.fontFamily}`;
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillStyle
            = dev.level === "dissonant" ? palette.highlightWarning : palette.highlightButton;
          ctx.fillText(dev.symbol, x + this.markerRadius + 3, cy);
        }
      }
    }

    // String notes
    const noteY = this.height - this.bottomPaddingY * 0.5;
    ctx.font = `${palette.fontWeightBase} 10px ${palette.fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let s = 0; s < this.numStrings; ++s) {
      const x = this.getStringX(s);
      const isMuted = this.params.mutes[s].dsp === 1;
      const dev = this.chordInfo?.stringDeviations?.[s];

      if (isMuted) {
        ctx.fillStyle = palette.unfocused;
        ctx.fillText("x", x, noteY);
      } else {
        const fret = Math.floor(this.params.frets[s].dsp);
        const noteName = dev?.noteName ?? getStringNoteName(s, fret, this.getBassPitchMidi());
        const sym = dev?.symbol ?? "·";
        const text = `${noteName}${sym}`;

        if (dev?.level === "dissonant") {
          ctx.fillStyle = palette.highlightWarning;
        } else if (dev?.level === "mild") {
          ctx.fillStyle = palette.highlightButton;
        } else {
          ctx.fillStyle = palette.foreground;
        }
        ctx.fillText(text, x, noteY);
      }
    }
  }
}
