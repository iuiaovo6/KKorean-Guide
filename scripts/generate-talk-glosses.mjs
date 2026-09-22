import { readFile, writeFile } from "node:fs/promises";
const root = new URL("../public/talk/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("index.json", root), "utf8"));
const rows = (await readFile(new URL("./talk-glosses.txt", import.meta.url), "utf8")).trim().split("\n");
const dictionary = new Map();
for (const row of rows) {
  const [token, meaning, extra] = row.split("|");
  if (!meaning || extra || dictionary.has(token)) throw new Error(`Invalid gloss: ${token}`);
  dictionary.set(token, meaning);
}
// Context-specific senses override the shared editorial glossary.
const overrides = {
  "choi-taeyang-live:4": { 이런: "哎呀、真是的……（惊讶或懊恼的感叹）" },
  "kim-jueun-live:0": { 왜: "你也知道吧（此处用来引出共同经验，并非追问原因）" },
};
const pending = [];
let occurrences = 0;
for (const item of manifest) {
  const path = new URL(item.json, root);
  const source = JSON.parse(await readFile(path, "utf8"));
  source.lines.forEach((line, index) => {
    line.glosses = {};
    for (const token of line.ko.match(/\p{sc=Hangul}+/gu) ?? []) {
      const meaning = overrides[`${item.id}:${index}`]?.[token] ?? dictionary.get(token);
      if (!meaning) throw new Error(`Missing gloss: ${item.id}:${index} ${token}`);
      line.glosses[token] = meaning;
      occurrences++;
    }
  });
  const generated = `${JSON.stringify(source, null, 2)}\n`;
  if (process.argv.includes("--check")) {
    if (await readFile(path, "utf8") !== generated) throw new Error(`Stale glosses: ${item.json}`);
  } else pending.push([path, generated]);
}
for (const [path, text] of pending) await writeFile(path, text);
console.log(`Validated ${occurrences} Hangul token occurrences across ${manifest.length} lessons; every token has a meaning.`);
