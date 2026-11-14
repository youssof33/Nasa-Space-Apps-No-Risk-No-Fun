const fs = require("fs");
const path = require("path");
const base = "C:/Users/youss/OneDrive/Desktop/NASA SPACE APPS M";
const srcDir = path.join(base, "NASA-SPACE-APPS-M-hussein/src/game");
const outDir = path.join(base, "final/src/integration/hussein");
for (const name of ["data", "engine"]) {
  let s = fs.readFileSync(path.join(srcDir, name + ".js"), "utf8").replace(/\r\n/g, "\n");
  if (name === "engine") s = s.replace("from './data.js'", "from './data'");
  const header =
    "/* Ported verbatim from Hussein's src/game/" +
    name +
    ".js. Types are not modelled:\n   the module is used as-is so its behaviour stays identical. */\n// @ts-nocheck\n";
  fs.writeFileSync(path.join(outDir, name + ".ts"), header + s, "utf8");
}
console.log("ok");
