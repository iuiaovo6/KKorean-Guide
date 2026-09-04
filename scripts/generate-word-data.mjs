import { readFile, writeFile } from "node:fs/promises";

const wordsPath = new URL("../public/words.json", import.meta.url);
const formsPath = new URL("../public/forms.json", import.meta.url);
const speechPath = new URL("../public/speech.json", import.meta.url);
const checkOnly = process.argv.includes("--check");

const HONORIFIC_WORDS = ["저", "당신", "드시다", "계시다", "주무시다", "성함", "연세", "진지", "말씀"];
const PARTICLES = ["에게서", "으로", "에서", "에게", "은", "는", "이", "가", "을", "를", "와", "과", "도", "만", "에", "로", "의"];

// 국립국어원 Revised Romanization tables. This is a rule-based transliterator,
// not an AI or a pinyin-style approximation.
const INITIAL = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"];
const VOWEL = ["a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i"];
const FINAL = ["", "k", "k", "k", "n", "n", "n", "t", "l", "lk", "lm", "lp", "l", "l", "l", "l", "m", "p", "p", "t", "t", "ng", "t", "t", "k", "t", "p", "h"];
const MOVED_ONSET = [0, 0, 1, 9, 2, 12, 18, 3, 5, 0, 6, 7, 9, 16, 17, 18, 6, 7, 9, 9, 9, 11, 12, 14, 15, 16, 17, 18];
const REMAINING_FINAL = [0, 0, 0, 1, 0, 4, 4, 0, 0, 8, 8, 8, 8, 8, 8, 8, 0, 0, 17, 0, 0, 0, 0, 0, 0, 0, 0, 0];

function splitSyllables(text) {
  return [...text].map((char) => {
    const code = char.codePointAt(0);
    if (code === undefined || code < 0xac00 || code > 0xd7a3) return { char, hangul: false };
    const value = code - 0xac00;
    return {
      char,
      hangul: true,
      initial: Math.floor(value / 588),
      medial: Math.floor((value % 588) / 28),
      final: value % 28,
    };
  });
}

function romanizeRun(text) {
  const syllables = splitSyllables(text);
  const initials = syllables.map((part) => part.initial ?? 0);
  const finals = syllables.map((part) => part.final ?? 0);

  for (let index = 0; index < syllables.length - 1; index += 1) {
    const current = syllables[index];
    const next = syllables[index + 1];
    if (!current.hangul || !next.hangul || finals[index] === 0) continue;

    // 받침 is carried into a following vowel. Compound 받침 leaves its first
    // sound behind (읽어 → ilgeo), following the RR pronunciation rules.
    if (initials[index + 1] === 11) {
      if (finals[index] === 27) {
        finals[index] = 0; // 좋다/좋아: ㅎ disappears before a vowel.
      } else {
        initials[index + 1] = MOVED_ONSET[finals[index]];
        finals[index] = REMAINING_FINAL[finals[index]];
      }
      continue;
    }

    // Nasal assimilation and ㄹ/ㄴ liaison in the official RR rules.
    if ([2, 6].includes(initials[index + 1])) {
      if ([1, 2, 3, 9, 24].includes(finals[index])) finals[index] = 21; // ng
      else if ([17, 18, 26].includes(finals[index])) finals[index] = 16; // m
      else if ([7, 19, 20, 22, 23, 25].includes(finals[index])) finals[index] = 4; // n
    }
    if (initials[index + 1] === 5 && [4, 5, 6].includes(finals[index])) {
      finals[index] = 8;
      initials[index + 1] = 5;
    } else if (initials[index + 1] === 5 && finals[index] === 8) {
      initials[index + 1] = 5;
    }
    if (initials[index + 1] === 2 && finals[index] === 8) initials[index + 1] = 5;
    if (finals[index] === 27) finals[index] = 0; // ㅎ is silent before a consonant in these forms.
  }

  return syllables.map((part, index) => {
    if (!part.hangul) return part.char;
    const onset = initials[index] === 5 && finals[index - 1] === 8 ? "l" : INITIAL[initials[index]];
    return `${onset}${VOWEL[part.medial]}${FINAL[finals[index]]}`;
  }).join("");
}

function romanize(text) {
  return text.split(/(\s+)/u).map((part) => /\s/u.test(part) ? part : romanizeRun(part)).join("").trim();
}

function decompose(char) {
  const code = char.codePointAt(0);
  if (code === undefined || code < 0xac00 || code > 0xd7a3) return null;
  const value = code - 0xac00;
  return { initial: Math.floor(value / 588), medial: Math.floor((value % 588) / 28), final: value % 28 };
}

function compose({ initial, medial, final = 0 }) {
  return String.fromCodePoint(0xac00 + (initial * 588) + (medial * 28) + final);
}

function replaceLast(text, replacement) {
  return `${text.slice(0, -1)}${replacement}`;
}

function makePresent(stem) {
  const last = decompose(stem.at(-1) ?? "");
  if (!last) return stem;
  if (last.final === 0 && [0, 4, 5, 6, 7, 1, 8, 12].includes(last.medial)) return stem;
  if (last.final === 0 && last.medial === 8) return replaceLast(stem, compose({ ...last, medial: 9 })); // 오 → 와
  if (last.final === 0 && last.medial === 13) return replaceLast(stem, compose({ ...last, medial: 14 })); // 우 → 워
  if (last.final === 0 && last.medial === 20) return replaceLast(stem, compose({ ...last, medial: 6 })); // 이 → 여
  return `${stem}${[0, 8].includes(last.medial) ? "아" : "어"}`;
}

function makePast(stem) {
  const last = decompose(stem.at(-1) ?? "");
  if (!last) return stem;
  if (last.final === 0 && [0, 1, 4, 5, 6, 7, 8, 12].includes(last.medial)) return replaceLast(stem, compose({ ...last, final: 20 }));
  return `${stem}${[0, 8].includes(last.medial) ? "았" : "었"}`;
}

function formsForDictionary(word) {
  if (!word.endsWith("다")) return [];
  const stem = word.slice(0, -1);
  if (word.endsWith("하다")) {
    const prefix = word.slice(0, -2);
    return [`${prefix}해요`, `${prefix}해`, `${prefix}했어요`, `${prefix}했어`, `${prefix}하고`, `${prefix}하면`, `${prefix}해서`];
  }
  if (word.endsWith("되다")) {
    const prefix = word.slice(0, -2);
    return [`${prefix}돼요`, `${prefix}돼`, `${prefix}됐어요`, `${prefix}됐어`, `${prefix}되고`, `${prefix}되면`, `${prefix}돼서`];
  }
  if (word === "있다") return ["있어요", "있어", "있었어요", "있었어", "있고", "있으면", "있어서"];
  if (word === "없다") return ["없어요", "없어", "없었어요", "없었어", "없고", "없으면", "없어서"];
  const present = makePresent(stem);
  const past = makePast(stem);
  return [`${present}요`, present, `${past}어요`, `${past}어`, `${stem}고`, `${stem}면`, `${present}서`];
}

function surfaceTokens(text) {
  return text.match(/\p{sc=Hangul}+/gu) ?? [];
}

function buildForms(words) {
  const forms = new Map();
  const exact = new Map(words.map((word) => [word.korean, word.id]));
  const generated = new Map();
  for (const word of words) {
    if (!["动词", "形容词"].includes(word.part_of_speech) || !word.korean.endsWith("다")) continue;
    for (const form of formsForDictionary(word.korean)) generated.set(form, word.id);
  }

  // Keep the practical index corpus-driven: every sentence surface is checked
  // against the generated forms and against conservative noun-particle stripping.
  for (const word of words) {
    for (const token of surfaceTokens(word.example_ko ?? "")) {
      const generatedId = generated.get(token);
      if (generatedId !== undefined) forms.set(token, generatedId);
      for (const particle of PARTICLES) {
        if (!token.endsWith(particle) || token.length <= particle.length) continue;
        const baseId = exact.get(token.slice(0, -particle.length));
        if (baseId !== undefined) forms.set(token, baseId);
      }
    }
  }

  // Include common forms even when this particular corpus has not used one yet.
  for (const [form, id] of generated) forms.set(form, id);
  return Object.fromEntries([...forms.entries()].sort(([left], [right]) => left.localeCompare(right, "ko")));
}

function honorificLexiconBase(surface) {
  return HONORIFIC_WORDS.find((word) => surface === word || PARTICLES.some((particle) => surface === `${word}${particle}`)) ?? null;
}

function classifySpeech(surface, base) {
  const lexicalHonorific = honorificLexiconBase(surface);
  if (lexicalHonorific) {
    return { base, level: "honor", reason: "该词是敬语专用词（词汇敬语）" };
  }
  if (surface === base || /(고|면|서)$/u.test(surface)) return { base, level: null };
  if (surface.includes("세요") || surface.includes("으시") || /시(?:어요|었|겠|면|고|죠|지|다|십시오|습니다|습니까|$)/u.test(surface)) {
    return { base, level: "honor", reason: "动词含敬语助词 -시-" };
  }
  if (/(습니다|습니까)$/u.test(surface)) {
    return { base, level: "honor", reason: "结尾是 -습니다/-습니까（합쇼체 正式敬语体）" };
  }
  if (/요$/u.test(surface)) {
    return { base, level: "honor", reason: "结尾是 -요（해요체 敬语体）" };
  }
  if (/[어아]$/u.test(surface)) {
    return { base, level: "plain", reason: "结尾是 -어/-아 且无 -요（해체 平语/반말 形式）" };
  }
  return { base, level: "plain", reason: "无敬语标记，为平语（반말）形式" };
}

function buildSpeech(words, forms) {
  const wordsById = new Map(words.map((word) => [word.id, word]));
  const exact = new Map(words.map((word) => [word.korean, word]));
  const speech = new Map();

  for (const word of words) speech.set(word.korean, classifySpeech(word.korean, word.korean));
  for (const [surface, id] of Object.entries(forms)) {
    const baseWord = wordsById.get(id);
    if (baseWord) speech.set(surface, classifySpeech(surface, baseWord.korean));
  }

  for (const honorific of HONORIFIC_WORDS) {
    const baseWord = exact.get(honorific);
    if (!baseWord) continue;
    speech.set(honorific, classifySpeech(honorific, honorific));
    for (const particle of PARTICLES) {
      const surface = `${honorific}${particle}`;
      speech.set(surface, classifySpeech(surface, honorific));
    }
  }

  return Object.fromEntries([...speech.entries()].sort(([left], [right]) => left.localeCompare(right, "ko")));
}

async function writeStable(path, value) {
  const next = `${JSON.stringify(value, null, 2)}\n`;
  let current = "";
  try { current = await readFile(path, "utf8"); } catch { /* first generation */ }
  if (current === next) return false;
  if (checkOnly) throw new Error(`${new URL(path).pathname} is stale; run npm run generate:word-data`);
  await writeFile(path, next, "utf8");
  return true;
}

const source = JSON.parse(await readFile(wordsPath, "utf8"));
const words = source.map(({ polite_form, plain_form, usage, romanization: _previous, ...word }) => ({
  ...word,
  romanization: romanize(word.korean),
}));
const forms = buildForms(words);
const speech = buildSpeech(words, forms);

if (words.length !== 802 || words.some((word) => !word.romanization)) {
  throw new Error("Romanization validation failed: every one of the 802 entries must be non-empty.");
}
if (forms["기대해"] !== 2) throw new Error("Corpus form validation failed: 기대해 must resolve to 기대하다 (id 2).");
if (words.some((word) => !speech[word.korean] || speech[word.korean].base.length === 0)) {
  throw new Error("Speech validation failed: every vocabulary entry must have generated speech metadata.");
}
if (speech["설레요"]?.base !== "설레다" || speech["설레요"]?.level !== "honor") {
  throw new Error("Speech validation failed: 설레요 must resolve to the honorific form of 설레다.");
}
if (speech["설레"]?.base !== "설레다" || speech["설레"]?.level !== "plain") {
  throw new Error("Speech validation failed: 설레 must resolve to the plain form of 설레다.");
}
if (speech["저"]?.level !== "honor" || speech["저도"]?.base !== "저") {
  throw new Error("Speech validation failed: lexical honorifics and their particle variants must be classified.");
}
if (speech["설레다"]?.level !== null || speech["설레고"]?.level !== null) {
  throw new Error("Speech validation failed: dictionary and connective forms must not show a speech-level label.");
}

const [wordsChanged, formsChanged, speechChanged] = await Promise.all([
  writeStable(wordsPath, words),
  writeStable(formsPath, forms),
  writeStable(speechPath, speech),
]);
console.log(`Validated ${words.length} words, ${Object.keys(forms).length} forms, and ${Object.keys(speech).length} speech records (${wordsChanged || formsChanged || speechChanged ? "updated" : "unchanged"}).`);
