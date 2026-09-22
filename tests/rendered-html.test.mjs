import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { buildStudyOptions } from "../lib/study-options.ts";
import { isLegacyExample, refreshLegacyExamples } from "../lib/example-updates.ts";

const root = new URL("../", import.meta.url);

test("listening choices finish before optional translation starts", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const handlers = source.slice(source.indexOf("  async function nextStudyStep()"), source.indexOf("\n  return (\n    <main"));
  const state = { step: "recall", wordIndex: 0, studyQueue: [{ word: { id: 1 }, repeat: false }, { word: { id: 2 }, repeat: false }], current: { id: 1, meaning: "期待" }, recallReadyToRate: false, typedAnswer: "", saved: 0, open: true };
  const context = vm.createContext({ ...state, window: { speechSynthesis: { cancel() {} }, setTimeout() {} }, shuffleQueue: (items) => items, isAcceptedMeaning: (answer, meaning) => answer === meaning });
  for (const [setter, key] of Object.entries({ setStep: "step", setWordIndex: "wordIndex", setStudyQueue: "studyQueue", setRecallReadyToRate: "recallReadyToRate", setTypedAnswer: "typedAnswer", setSelected: "selected", setRecallFeedback: "feedback", setRecallFeedbackTone: "tone", setStudyOpen: "open", setToast: "toast", setDataVersion: "version" })) context[setter] = (value) => { context[key] = typeof value === "function" ? value(context[key] ?? 0) : value; };
  context.saveProgress = async () => { context.saved++; };
  vm.runInContext(ts.transpile(handlers, { target: ts.ScriptTarget.ES2022 }), context);
  await context.rateWord("good");
  assert.equal(context.step, "recall");
  assert.equal(context.wordIndex, 1);
  await context.rateWord("good");
  assert.equal(context.step, "translation-choice");
  context.startTranslation();
  assert.equal(context.step, "translate");
  assert.equal(context.wordIndex, 0);
  context.typedAnswer = "错误";
  await context.nextStudyStep();
  assert.equal(context.tone, "wrong");
  assert.equal(context.wordIndex, 0);
  context.typedAnswer = "期待";
  await context.nextStudyStep();
  assert.equal(context.tone, "correct");
  assert.equal(context.wordIndex, 0);
  await context.nextStudyStep();
  assert.equal(context.wordIndex, 1);
  assert.equal(context.saved, 2, "optional translation does not duplicate review writes");
  context.finishStudy();
  assert.equal(context.open, false);
  const recallCard = source.slice(source.indexOf('  if (step === "recall") return ('), source.indexOf('  if (step === "translate") return ('));
  assert.ok(!recallCard.includes("<input"), "listening choices must not contain the Chinese input");
});

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

test("Talk listening loads every person-and-scene lesson with aligned audio", async () => {
  const manifest = JSON.parse(await readFile(new URL("../public/talk/index.json", import.meta.url), "utf8"));
  assert.equal(manifest.length, 9);
  assert.equal(new Set(manifest.map((item) => `${item.who} ${item.where}`)).size, 9);

  const normalize = (text) => text.replace(/[^\p{sc=Hangul}\p{N}]/gu, "");
  for (const item of manifest) {
    const source = JSON.parse(await readFile(new URL(`../public/talk/${item.json}`, import.meta.url), "utf8"));
    const audio = await stat(new URL(`../public/talk/${item.audio}`, import.meta.url));
    assert.equal(source.context.who, item.who);
    assert.equal(source.context.where, item.where);
    assert.ok(source.title_ko && source.title_zh);
    assert.ok(source.lines.length > 0);
    assert.ok(source.lines.every((line) => line.t < line.end && line.ko && line.zh));
    for (const line of source.lines) {
      for (const token of line.ko.match(/\p{sc=Hangul}+/gu) ?? []) {
        assert.ok(line.glosses?.[token]?.trim(), `${item.id}: no definition for ${token}`);
      }
    }
    assert.ok(source.phrases.length >= 3 && source.phrases.length <= 5);
    assert.ok(Object.keys(source.usage).length > 0);
    assert.ok(audio.size > 500_000);
    assert.ok(source.lines.at(-1).end <= item.duration + 5);
    for (const phrase of source.phrases) {
      assert.ok(phrase.rom?.trim(), `${item.id}: missing romanization`);
      const phraseText = normalize(phrase.ko);
      const matchingLine = source.lines.find((line) => {
        const lineText = normalize(line.ko);
        return lineText.includes(phraseText) || phraseText.includes(lineText);
      });
      assert.ok(matchingLine || source.lines[phrase.line] || source.lines[phrase.line - 1], `${item.id}: ${phrase.ko}`);
    }
  }

  const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(pageSource, /const talkSpeeds = \[0\.3, 0\.4,[^\]]*1\.5\]/);
  assert.match(pageSource, /"盲听全貌", "捕捉韩文", "对照听懂", "带走一句"/);
  assert.match(pageSource, /talk\/index\.json/);
  assert.match(pageSource, /resolveTalkPhrase\(source\.lines, phrase\)/);
  assert.match(pageSource, /talk-wave-bars/);
  assert.doesNotMatch(pageSource, /\/talk\/takki\.m4a/);
  assert.doesNotMatch(pageSource, /先跟住真实语流，再在需要的时候打开字幕/);
  assert.doesNotMatch(pageSource, /留下这篇最值得反复听的 5 个说法/);
});

test("daily examples replace all legacy templates and preserve custom or homonym examples", async () => {
  const words = JSON.parse(await readFile(new URL("../public/words.json", import.meta.url), "utf8"));
  assert.equal(words.filter((word) => isLegacyExample(word.example_ko)).length, 0);
  const eyes = { korean: "눈", meaning_zh: "眼睛", example_ko: "오늘 눈에 대해 이야기해요.", example_zh: "今天聊眼睛。" };
  const snow = { ...eyes, meaning_zh: "雪" };
  const custom = { ...eyes, example_ko: "눈이 정말 예쁘네요." };
  const refreshed = refreshLegacyExamples([eyes, snow, custom], words);
  assert.match(refreshed[0].example_ko, /마주쳐/);
  assert.match(refreshed[1].example_ko, /밤새/);
  assert.equal(refreshed[2].example_ko, custom.example_ko);
  assert.deepEqual(refreshLegacyExamples([eyes], []), [eyes]);
});
