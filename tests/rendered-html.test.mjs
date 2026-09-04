import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
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

test("speech-level metadata is generated from the tapped surface form", async () => {
  const speech = JSON.parse(await readFile(new URL("../public/speech.json", import.meta.url), "utf8"));
  assert.deepEqual(speech["설레요"], {
    base: "설레다",
    level: "honor",
    reason: "结尾是 -요（해요체 敬语体）",
  });
  assert.deepEqual(speech["설레"], {
    base: "설레다",
    level: "plain",
    reason: "无敬语标记，为平语（반말）形式",
  });
  assert.equal(speech["저"].level, "honor");
  assert.match(speech["저"].reason, /敬语专用词/);
  assert.equal(speech["저도"].base, "저");
  assert.equal(speech["설레다"].level, null);
  assert.equal(speech["설레고"].level, null);

  const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(pageSource, /speechLevelForSurface|합쇼체|해요체|반말\)形式/);
});

test("every study round keeps four unique options even when the old distractors duplicate the answer", () => {
  const options = buildStudyOptions("期待", ["期待", "期待", "回忆", "应援", "喜欢"], "meaning-duplicate");
  assert.equal(options.length, 4);
  assert.equal(new Set(options).size, 4);
  assert.equal(options.filter((option) => option === "期待").length, 1);
  assert.deepEqual(options, buildStudyOptions("期待", ["期待", "期待", "回忆", "应援", "喜欢"], "meaning-duplicate"));
});

test("account actions require confirmation and obsolete help UI is removed", async () => {
  const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(pageSource, /确定要退出登录吗/);
  assert.match(pageSource, /注销后，账号与全部学习记录都会消失/);
  assert.match(pageSource, /completedAction === "signout" \? "已退出" : "已注销"/);
  assert.doesNotMatch(pageSource, /使用帮助/);
  assert.doesNotMatch(pageSource, /deleteUser|auth\.admin/);
});

test("Talk listening uses the provided audio and aligned bilingual transcript", async () => {
  const source = JSON.parse(await readFile(new URL("../public/talk/takki.json", import.meta.url), "utf8"));
  const transcript = JSON.parse(await readFile(new URL("../public/talk/takki-transcript.json", import.meta.url), "utf8"));
  const vocabulary = JSON.parse(await readFile(new URL("../public/talk/takki-words.json", import.meta.url), "utf8"));
  const audio = await stat(new URL("../public/talk/takki.m4a", import.meta.url));
  assert.equal(source.id, "takki-01");
  assert.equal(source.lines.length, 16);
  assert.ok(source.lines.every((line) => line.t < line.end && line.ko && line.zh));
  assert.equal(transcript.segments.length, 18);
  assert.ok(vocabulary.words.length >= 40);
  assert.ok(audio.size > 2_000_000);

  const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(pageSource, /const talkSpeeds = \[0\.3, 0\.4,[^\]]*1\.5\]/);
  assert.match(pageSource, /"盲听全貌", "捕捉韩文", "对照听懂", "带走一句"/);
  assert.match(pageSource, /talkGrammarSelection = \[[^\]]+\]/);
  assert.match(pageSource, /\/talk\/takki\.m4a/);
  assert.match(pageSource, /talk-wave-bars/);
  assert.doesNotMatch(pageSource, /先跟住真实语流，再在需要的时候打开字幕/);
  assert.doesNotMatch(pageSource, /留下这篇最值得反复听的 5 个说法/);
});
