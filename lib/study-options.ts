function seededShuffle<T>(items: T[], seed: string): T[] {
  const shuffled = [...items];
  let value = Array.from(seed).reduce(
    (total, character) => ((total << 5) - total + character.charCodeAt(0)) | 0,
    0,
  ) >>> 0;

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    value = (value * 1664525 + 1013904223) >>> 0;
    const target = value % (index + 1);
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

export function buildStudyOptions(correct: string, pool: string[], seed: string): string[] {
  const distractors = Array.from(new Set(pool.map((value) => value.trim()).filter(Boolean)))
    .filter((value) => value !== correct);
  const selected = [correct, ...seededShuffle(distractors, `${seed}-distractors`).slice(0, 3)];

  if (selected.length !== 4) {
    throw new Error(`Study option pool must provide three unique distractors for ${correct}.`);
  }

  return seededShuffle(selected, `${seed}-options`);
}
