import { readFile, writeFile } from "node:fs/promises";

// Editorial source: one individually written Korean/Chinese example per ID.
// This script only applies those authored pairs; it does not generate sentences.
const wordsPath = new URL("../public/words.json", import.meta.url);
const words = JSON.parse(await readFile(wordsPath, "utf8"));
const edits = (await readFile(new URL("./daily-examples.txt", import.meta.url), "utf8")).trim().split("\n");
const seen = new Set();
for (const row of edits) {
  const [rawId, ko, zh, extra] = row.split("|");
  const id = Number(rawId);
  const word = words.find((item) => item.id === id);
  if (!word || !ko || !zh || extra || seen.has(id)) throw new Error(`Invalid example row: ${rawId}`);
  seen.add(id);
  word.example_ko = ko;
  word.example_zh = zh;
}
await writeFile(wordsPath, `${JSON.stringify(words, null, 2)}\n`);
console.log(`Applied ${seen.size} individually authored bilingual examples; retained ${words.length} words and their IDs.`);
