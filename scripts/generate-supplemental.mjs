import { readFile, writeFile } from 'node:fs/promises';
import { romanize } from './generate-word-data.mjs';

// Source snapshots are preserved; corrections are explicit and repeatable.
const lesson = JSON.parse(await readFile(new URL('./fan-check.source.json', import.meta.url), 'utf8'));
const csv = (await readFile(new URL('./words-2026-09-22.csv', import.meta.url), 'utf8')).replace(/^\uFEFF/, '');
const rows = []; let row = [], cell = '', quoted = false;
for (let i = 0; i < csv.length; i++) {
  const c = csv[i];
  if (c === '"') { if (quoted && csv[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
  else if (c === ',' && !quoted) { row.push(cell.trim()); cell = ''; }
  else if ((c === '\n' || c === '\r') && !quoted) { if (c === '\r' && csv[i + 1] === '\n') i++; row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = ''; }
  else cell += c;
}
if (quoted) throw new Error('Unclosed CSV quote');
row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
const header = rows.shift();
if (header.join(',') !== 'korean,meaning_zh,part_of_speech,example_ko,example_zh,tags') throw new Error('Unexpected CSV columns');
const additions = rows.map((r, i) => {
  if (r.length !== 6 || !r[0] || !r[1]) throw new Error(`Invalid CSV row ${i + 2}`);
  return { id: -920001 - i, korean: r[0], meaning: r[1], type: r[2], example: r[3], translation: r[4], tags: r[5].split('|').filter(Boolean), romanization: romanize(r[0]) };
});
const moved = lesson.filter(word => word.id >= 90004 && word.id <= 90010);
for (const word of moved) {
  const variants = word.korean.split(/\s*\/\s*/);
  variants.forEach((korean, index) => {
    const synonym = variants.filter(other => other !== korean);
    const existing = additions.find(item => item.korean === korean);
    const meaning = `${word.meaning}${synonym.length ? `（同义词：${synonym.join('、')}）` : ''}`;
    if (existing) { existing.meaning = meaning; existing.type = '名词'; existing.tags = [...new Set([...existing.tags, '线下活动', '新增单词'])]; }
    else additions.push({ id: -930000 - word.id * 10 - index, korean, meaning, type: '名词', example: '', translation: '', tags: ['线下活动', '新增单词'], romanization: romanize(korean) });
  });
}
const sentences = lesson.filter(word => word.id < 90004 || word.id > 90010).map((word) => {
  const korean = word.korean.replace('팬 드릴 테니', '펜 드릴 테니');
  return { ...word, id: -word.id, korean, tags: [...new Set([...word.tags, '入场check'])], romanization: romanize(korean) };
});
const data = [...additions, ...sentences];
if (new Set(data.map(w => w.id)).size !== data.length || data.some(w => !w.romanization || !w.meaning)) throw new Error('Invalid supplemental vocabulary');
const target = new URL('../lib/supplemental-words.json', import.meta.url);
const output = JSON.stringify(data, null, 2) + '\n';
if (process.argv.includes('--check')) { if (await readFile(target, 'utf8') !== output) throw new Error('Run node scripts/generate-supplemental.mjs'); }
else await writeFile(target, output);
console.log(`Validated ${additions.length} supplemental words and ${sentences.length} entry-check items.`);
