import supplemental from './supplemental-words.json';

type Word = (typeof supplemental)[number];
export function mergeSupplemental<T extends Word>(words: T[]): Array<T | Word> {
  const result: Array<T | Word> = [...words];
  for (const word of supplemental) {
    // Lesson cards remain separate from dictionary words, even for identical headwords.
    const index = word.tags.includes('入场check') ? -1 : result.findIndex(existing => existing.korean === word.korean);
    if (index < 0) result.push(word);
    else result[index] = { ...result[index], ...(word.meaning.includes('同义词：') ? { meaning: word.meaning } : {}), tags: [...new Set([...result[index].tags, ...word.tags])] };
  }
  return result;
}
