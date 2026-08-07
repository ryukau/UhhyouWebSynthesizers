import {createTable, setRefresh, setupResizer} from "../tableutil.js";

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

function findIntegerSampleBpms(samplingRate, minBpm = 40, maxBpm = 300, beat = 1) {
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

      const secondsPerBeat = (N * beat) / samplingRate;

      tableData.push({
        bpmFloat: bpmFloat,
        bpmRational: bpmRational,
        secondsPerBeat: secondsPerBeat,
        samplesPerBeat: N,
      });
    }
  }

  // Sort ascending by BPM float value
  tableData.sort((a, b) => b.bpmFloat - a.bpmFloat);
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

  const beat = parseFloat(document.getElementById("beat").value);
  if (!(beat > 0)) {
    paragraphStatus.innerHTML = '<span class="error">Error: "Beat" must be greater than 0.</span>';
    return;
  }

  const results = findIntegerSampleBpms(sampleRate, minBpm, maxBpm, beat);

  const bpmFloats = [];
  const bpmRationals = [];
  const samplesPerBeat = [];
  const secondsPerBeat = [];

  for (const row of results) {
    bpmFloats.push(row.bpmFloat);
    bpmRationals.push(row.bpmRational);
    samplesPerBeat.push(row.samplesPerBeat);
    secondsPerBeat.push(row.secondsPerBeat);
  }

  const data = {
    "BPM (Float)": bpmFloats,
    "BPM (Rational)": bpmRationals,
    "Samples / Beat (N)": samplesPerBeat,
    "Seconds / Beats": secondsPerBeat,
  };

  createTable(data, "bpmTableContainer");

  paragraphStatus.innerText = "Everything is awesome.";
}

setRefresh("sampleRateHz", refresh);
setRefresh("minBpm", refresh);
setRefresh("maxBpm", refresh);
setRefresh("beat", refresh);

refresh();
setupResizer();
