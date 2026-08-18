import { readFile, writeFile } from "node:fs/promises";

const sourcePath = new URL("../public/words.json", import.meta.url);

// Korean Revised Romanization tables. The extra cross-syllable handling below
// keeps common 받침 + vowel combinations readable (한국어 → hangugeo).
const onset = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"];
const vowel = ["a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i"];
const coda = ["", "g", "kk", "gs", "n", "nj", "nh", "d", "l", "lg", "lm", "lb", "ls", "lt", "lp", "lh", "m", "b", "bs", "s", "ss", "ng", "j", "ch", "k", "t", "p", "h"];

function syllables(text) {
  return [...text].map((char) => {
    const value = char.codePointAt(0);
    if (value === undefined || value < 0xac00 || value > 0xd7a3) return { char };
    const index = value - 0xac00;
    return {
      char,
      initial: Math.floor(index / 588),
      medial: Math.floor((index % 588) / 28),
      final: index % 28,
    };
  });
}

function romanize(text) {
  const parts = syllables(text);
  return parts.map((part, index) => {
    if (part.initial === undefined || part.medial === undefined || part.final === undefined) return part.char;
    const previous = parts[index - 1];
    const next = parts[index + 1];
    let initialSound = onset[part.initial];
    let finalSound = coda[part.final];
    // Core Revised Romanization liaison / assimilation rules used in ordinary
    // vocabulary: 설레다 → seolleda, 감사합니다 → gamsahamnida.
    if (part.initial === 5 && (previous?.final === 8 || previous?.final === 4)) initialSound = "l";
    if ((part.initial === 2 || part.initial === 6) && [1, 2, 3, 24].includes(part.final)) finalSound = "ng";
    if ((part.initial === 2 || part.initial === 6) && [17, 18, 19, 26, 27].includes(part.final)) finalSound = "m";
    if (part.initial === 5 && [4, 5, 6, 25].includes(part.final)) finalSound = "l";
    if ((part.initial === 2 || part.initial === 6) && [7, 22, 23, 25].includes(part.final)) finalSound = "n";
    if (part.final === 27 && next?.initial === 5) finalSound = "l";
    return `${initialSound}${vowel[part.medial]}${finalSound}`;
  }).join("").replace(/\s+/g, " ").trim();
}

function endingForm(word, polite) {
  if (!word.endsWith("다")) return word;
  if (word.endsWith("하다")) return `${word.slice(0, -2)}${polite ? "해요" : "해"}`;
  if (word === "이다") return polite ? "이에요" : "이야";
  if (word === "있다") return polite ? "있어요" : "있어";
  if (word === "없다") return polite ? "없어요" : "없어";
  if (word.endsWith("되다")) return `${word.slice(0, -2)}${polite ? "돼요" : "돼"}`;

  const stem = word.slice(0, -1);
  const last = stem.at(-1);
  if (!last) return word;
  const code = last.codePointAt(0);
  if (code === undefined || code < 0xac00 || code > 0xd7a3) return word;
  const offset = code - 0xac00;
  const medial = Math.floor((offset % 588) / 28);
  const final = offset % 28;
  // Vowel-final ㅏ / ㅓ contract to -아요 / -어요 without doubling the vowel.
  if (final === 0 && [0, 1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 20].includes(medial)) return `${stem}${polite ? "요" : ""}`;
  return `${stem}${medial === 0 || medial === 8 ? "아요" : "어요"}`.replace(/요$/, polite ? "요" : "");
}

function inflections(word, partOfSpeech) {
  if (!["动词", "形容词"].includes(partOfSpeech ?? "") || !word.endsWith("다")) {
    return { polite_form: word, plain_form: word };
  }
  return { polite_form: endingForm(word, true), plain_form: endingForm(word, false) };
}

const words = JSON.parse(await readFile(sourcePath, "utf8"));
const enriched = words.map((word) => {
  const forms = inflections(word.korean, word.part_of_speech);
  const tags = Array.isArray(word.tags) && word.tags.length > 0 ? word.tags.join("、") : "日常";
  return {
    ...word,
    romanization: romanize(word.korean),
    ...forms,
    usage: `用于${tags}场景的${word.part_of_speech || "韩语"}表达。`,
  };
});

await writeFile(sourcePath, `${JSON.stringify(enriched, null, 2)}\n`, "utf8");
console.log(`Enriched ${enriched.length} words.`);
