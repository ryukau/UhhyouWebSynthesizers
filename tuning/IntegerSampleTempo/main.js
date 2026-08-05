function createTable(data) {
  const tr = (parent) => {
    const elem = document.createElement("tr");
    parent.appendChild(elem);
    return elem;
  };

  const container = document.getElementById("bpmTableContainer");

  const table = document.createElement("table");
  container.innerHTML = "";
  container.appendChild(table);

  // Header row
  const thead = document.createElement("thead");
  table.appendChild(thead);

  const rowHeading = tr(thead);
  for (let key in data) {
    const elem = document.createElement("th");
    elem.innerText = key;
    rowHeading.appendChild(elem);
  }

  // Data rows
  const tbody = document.createElement("tbody");
  table.appendChild(tbody);

  let rows = [];
  for (let [key, value] of Object.entries(data)) {
    if (rows.length < value.length) {
      const nAppend = value.length - rows.length;
      for (let idx = 0; idx < nAppend; ++idx) rows.push(tr(tbody));
    }

    for (let idx = 0; idx < value.length; ++idx) {
      const elem = document.createElement("td");
      if (value[idx] !== undefined && value[idx] !== null) elem.innerHTML = value[idx];
      rows[idx].appendChild(elem);
    }
  }
}

function getOddPart(n) {
  if (n === 0) return 0;
  while (n % 2 === 0) { n = Math.floor(n / 2); }
  return n;
}

function getAllDivisors(n) {
  const divs = new Set();
  const limit = Math.floor(Math.sqrt(n));
  for (let i = 1; i <= limit; i++) {
    if (n % i === 0) {
      divs.add(i);
      divs.add(Math.floor(n / i));
    }
  }
  return Array.from(divs).sort((a, b) => a - b);
}

function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}

function findIntegerSampleBpms(samplingRate, minBpm = 40, maxBpm = 300) {
  const val = 60 * samplingRate;
  const oddPartTotal = getOddPart(val);
  const oddDivisors = getAllDivisors(oddPartTotal);

  const tableData = [];

  for (const d of oddDivisors) {
    const kMin = Math.ceil(Math.log2(val / (d * maxBpm))) - 1;
    const kMax = Math.floor(Math.log2(val / (d * minBpm))) + 1;

    for (let k = kMin; k <= kMax; k++) {
      if (k < 0) continue;
      const N = d * Math.pow(2, k);

      const bpmFloat = val / N;

      if (bpmFloat < minBpm || bpmFloat > maxBpm) continue;

      const g = gcd(val, N);
      const num = Math.floor(val / g);
      const den = Math.floor(N / g);
      const bpmRational = den === 1 ? `${num}` : `${num}/${den}`;

      tableData.push({bpmFloat: bpmFloat, bpmRational: bpmRational, samplesPerBeat: N});
    }
  }

  // Sort ascending by BPM float value
  tableData.sort((a, b) => a.bpmFloat - b.bpmFloat);
  return tableData;
}

function refresh() {
  const paragraphStatus = document.getElementById("status");

  const sampleRate = parseFloat(document.getElementById("sampleRateHz").value);
  if (!(sampleRate > 0)) {
    paragraphStatus.innerHTML
      = '<span class="error">Error: "Sampling rate" must be greater than 0 Hz.</span>';
    return;
  }

  const minBpm = parseFloat(document.getElementById("minBpm").value);
  if (!(minBpm > 0)) {
    paragraphStatus.innerHTML
      = '<span class="error">Error: "Minimum BPM" must be greater than 0.</span>';
    return;
  }

  const maxBpm = parseFloat(document.getElementById("maxBpm").value);
  if (isNaN(maxBpm) || maxBpm < minBpm) {
    paragraphStatus.innerHTML
      = '<span class="error">Error: Invalid BPM range. "Maximum BPM" must be &ge; "Minimum BPM".</span>';
    return;
  }

  const results = findIntegerSampleBpms(sampleRate, minBpm, maxBpm);

  const bpmFloats = [];
  const bpmRationals = [];
  const samplesPerBeat = [];

  for (const row of results) {
    bpmFloats.push(row.bpmFloat);
    bpmRationals.push(row.bpmRational);
    samplesPerBeat.push(row.samplesPerBeat);
  }

  const data = {
    "BPM (Float)": bpmFloats,
    "BPM (Rational)": bpmRationals,
    "Samples / Beat (N)": samplesPerBeat,
  };

  createTable(data);

  paragraphStatus.innerText = "Everything is awesome.";
}

function setRefresh(id) {
  const input = document.getElementById(id);
  input.addEventListener("input", refresh);
}

setRefresh("sampleRateHz");
setRefresh("minBpm");
setRefresh("maxBpm");

refresh();
