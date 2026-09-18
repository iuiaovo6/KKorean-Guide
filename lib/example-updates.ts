type ExampleRow = { korean: string; meaning_zh: string; example_ko: string | null; example_zh: string | null };

export function isLegacyExample(text: string) {
  return /^(?:오늘 .+에 대해 이야기해요\.|팬들이 .+에 대해 이야기하고 있어요\.|휴대폰에서 .+ 확인해 주세요\.|오늘 .+라는 말을 들었어요\.|오늘 .+ 정말 잘 어울려요\.|오늘 .+ 연습해요\.|오늘 .+ 있어요\.|오늘 정말 \S+\.|오늘도 \S+\.)$/u.test(text);
}

// Match both word and meaning: 눈 (eyes) and 눈 (snow) must stay distinct.
// Only replace obsolete built-in examples; preserve custom database sentences.
export function refreshLegacyExamples<T extends ExampleRow>(rows: T[], publicWords: ExampleRow[]): T[] {
  const examples = new Map(publicWords.map((word) => [`${word.korean}\u0000${word.meaning_zh}`, word]));
  return rows.map((word) => {
    const current = examples.get(`${word.korean}\u0000${word.meaning_zh}`);
    return current?.example_ko && isLegacyExample(word.example_ko ?? "")
      ? { ...word, example_ko: current.example_ko, example_zh: current.example_zh }
      : word;
  });
}
