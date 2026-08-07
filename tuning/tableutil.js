export function getSortValue(val) {
  if (val === null || val === undefined) return "";
  if (typeof val === "number") return val;

  const clean = String(val).replace(/<[^>]*>/g, "").trim();

  const fracMatch = clean.match(/^([-+]?\d+(?:\.\d+)?)\s*\/\s*([-+]?\d+(?:\.\d+)?)$/);
  if (fracMatch) {
    const den = parseFloat(fracMatch[2]);
    if (den !== 0) return parseFloat(fracMatch[1]) / den;
  }

  if (
    clean !== "" && clean !== "-" && clean !== "+" && clean.toLowerCase() !== "nan"
    && !isNaN(clean))
  {
    return parseFloat(clean);
  }

  return clean.toLowerCase();
}

export function compareValues(a, b) {
  const valA = getSortValue(a);
  const valB = getSortValue(b);

  const typeA = typeof valA;
  const typeB = typeof valB;

  if (typeA === "number" && typeB === "number") { return valA - valB; }
  if (typeA === "number") return -1;
  if (typeB === "number") return 1;

  return String(valA).localeCompare(String(valB));
}

export function createTable(data, containerId = "tuningTableContainer") {
  const container = document.getElementById(containerId);
  if (!container) return;

  const keys = Object.keys(data);
  if (keys.length === 0) {
    container.innerHTML = "";
    return;
  }

  const rowCount = data[keys[0]] ? data[keys[0]].length : 0;
  let rowIndices = Array.from({length: rowCount}, (_, i) => i);

  let currentSortKey = null;
  let currentSortAscending = true;

  const table = document.createElement("table");

  function render() {
    table.innerHTML = "";

    // Header row
    const thead = document.createElement("thead");
    table.appendChild(thead);

    const rowHeading = document.createElement("tr");
    thead.appendChild(rowHeading);

    for (const key of keys) {
      const th = document.createElement("th");
      let titleText = key;
      if (key === currentSortKey) { titleText += currentSortAscending ? " ▲" : " ▼"; }
      th.innerText = titleText;
      th.style.cursor = "pointer";
      th.style.userSelect = "none";

      th.addEventListener("click", () => {
        if (currentSortKey === key) {
          currentSortAscending = !currentSortAscending;
        } else {
          currentSortKey = key;
          currentSortAscending = true;
        }

        rowIndices.sort((a, b) => {
          const valA = data[key][a];
          const valB = data[key][b];
          const cmp = compareValues(valA, valB);
          if (cmp !== 0) { return currentSortAscending ? cmp : -cmp; }
          return a - b;
        });

        render();
      });

      rowHeading.appendChild(th);
    }

    // Data rows
    const tbody = document.createElement("tbody");
    table.appendChild(tbody);

    for (const idx of rowIndices) {
      const tr = document.createElement("tr");
      for (const key of keys) {
        const td = document.createElement("td");
        const val = data[key][idx];
        if (val !== undefined && val !== null) { td.innerHTML = val; }
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
  }

  container.innerHTML = "";
  container.appendChild(table);
  render();
}

export function freqToMidi(freqHz, centerHz = 440) {
  return 12 * Math.log2(freqHz / centerHz) + 69;
}

export function addSignStr(number) { return (number < 0 ? "" : "+") + number; }

export function setRefresh(id, refreshFn) {
  const input = document.getElementById(id);
  if (input) { input.addEventListener("input", refreshFn); }
}

export function setupResizer() {
  const resizer = document.getElementById("resizer");
  if (!resizer) return;

  let isDragging = false;

  resizer.addEventListener("pointerdown", (e) => {
    isDragging = true;
    resizer.classList.add("dragging");
    resizer.setPointerCapture(e.pointerId);
    document.body.style.userSelect = "none";
  });

  resizer.addEventListener("pointermove", (e) => {
    if (!isDragging) return;

    const totalWidth = window.innerWidth;
    if (totalWidth <= 0) return;

    let percent = (e.clientX / totalWidth) * 100;
    percent = Math.max(10, Math.min(90, percent));

    document.documentElement.style.setProperty("--split-percent", `${percent}%`);
  });

  const stopDrag = (e) => {
    if (isDragging) {
      isDragging = false;
      resizer.classList.remove("dragging");
      try {
        resizer.releasePointerCapture(e.pointerId);
      } catch (err) {}
      document.body.style.userSelect = "";
    }
  };

  resizer.addEventListener("pointerup", stopDrag);
  resizer.addEventListener("pointercancel", stopDrag);
}
