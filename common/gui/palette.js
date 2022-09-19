import {clamp} from "../util.js";

function rgbaInt(r, g, b, a) {
  const u8 = (value) => Math.floor(clamp(value, 0, 255));
  return `rgba(${u8(r)}, ${u8(g)}, ${u8(b)}, ${u8(a) / 255})`;
}

// `colorCode` is "#rrggbbaa".
function rgbaStr(colorCode) {
  const hex = (a, b) => parseInt(colorCode.slice(a, b), 16);
  return `rgba(${hex(1, 3)}, ${hex(3, 5)}, ${hex(5, 7)}, ${hex(7, 9) / 255})`;
}

export const palette = {
  fontFamily: "sans-serif",

  foreground: rgbaStr("#000000ff"),
  background: rgbaStr("#ffffffff"),
  boxBackground: rgbaStr("#ffffffff"),
  unfocused: rgbaStr("#ddddddff"),
  highlightMain: rgbaStr("#0ba4f1ff"),
  highlightAccent: rgbaStr("#13c136ff"),
  highlightButton: rgbaStr("#fcc04fff"),
  highlightWarning: rgbaStr("#fc8080ff"),
  overlay: rgbaStr("#00000088"),
  overlayHighlight: rgbaStr("#00ff0033"),
  overlayFaint: rgbaStr("#0000000b"),
  waveform: rgbaStr("#303030ff"),
};
