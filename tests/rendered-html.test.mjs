import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildStudyOptions } from "../lib/study-options.ts";

const root = new URL("../", import.meta.url);

test("generated vocabulary data is complete and deterministic", async () => {
  const result = spawnSync(process.execPath, ["scripts/generate-word-data.mjs", "--check"], {
    cwd: root.pathname,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const words = JSON.parse(await readFile(new URL("../public/words.json", import.meta.url), "utf8"));
  assert.equal(words.length, 802);
  assert.ok(words.every((word) => typeof word.romanization === "string" && word.romanization.length > 0));
  assert.equal(words.find((word) => word.korean === "설레다")?.romanization, "seolleda");
});

test("practical inflected forms resolve to the base vocabulary entry", async () => {
  const forms = JSON.parse(await readFile(new URL("../public/forms.json", import.meta.url), "utf8"));
  assert.equal(forms["기대해"], 2);
  assert.equal(forms["설렜어요"], 1);
});

test("every study round keeps four unique options even when the old distractors duplicate the answer", () => {
  const options = buildStudyOptions("期待", ["期待", "期待", "回忆", "应援", "喜欢"], "meaning-duplicate");
  assert.equal(options.length, 4);
  assert.equal(new Set(options).size, 4);
  assert.equal(options.filter((option) => option === "期待").length, 1);
  assert.deepEqual(options, buildStudyOptions("期待", ["期待", "期待", "回忆", "应援", "喜欢"], "meaning-duplicate"));
});
