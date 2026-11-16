import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, pivotIndex, wordDelay, remainingMs, remainingTable, paragraphStarts, paragraphAt, sentenceStarts, stepTo } from '../src/rsvp.js';

test('tokenize splits on any whitespace and marks paragraph ends', () => {
  const words = tokenize('  안녕하세요  반갑습니다.\n\n둘째   문단\t끝 ');
  assert.deepEqual(words.map((w) => w.text), ['안녕하세요', '반갑습니다.', '둘째', '문단', '끝']);
  assert.deepEqual(words.map((w) => w.paragraphEnd), [false, true, false, false, true]);
});

test('tokenize returns empty list for blank text', () => {
  assert.deepEqual(tokenize(''), []);
  assert.deepEqual(tokenize(' \n\t '), []);
});

test('pivotIndex follows ceil((n - 1) * 0.35) like the reference site', () => {
  assert.equal(pivotIndex(''), 0);
  assert.equal(pivotIndex('a'), 0);
  assert.equal(pivotIndex('읽는'), 1);
  assert.equal(pivotIndex('빠르게'), 1);
  assert.equal(pivotIndex('RSVP'), 2);
  assert.equal(pivotIndex('문장입니다'), 2);
  assert.equal(pivotIndex('reading'), 3);
  assert.equal(pivotIndex('끝났다.'), 1);
});

test('pivotIndex counts surrogate pairs as one character', () => {
  assert.equal(pivotIndex('😀abc'), 2);
});

test('wordDelay base is 60000 / wpm', () => {
  assert.equal(wordDelay({ text: '단어', paragraphEnd: false }, 300), 200);
});

test('wordDelay matches the reference site: sentence end 2.5x, comma 2x, over 12 chars 1.5x', () => {
  assert.equal(wordDelay({ text: '그리고,', paragraphEnd: false }, 300), 400);
  assert.equal(wordDelay({ text: '끝났다.', paragraphEnd: false }, 300), 500);
  assert.equal(wordDelay({ text: '정말?"', paragraphEnd: false }, 300), 500);
  assert.equal(wordDelay({ text: '문단', paragraphEnd: true }, 300), 500);
  assert.equal(wordDelay({ text: 'extraordinary', paragraphEnd: false }, 300), 300);
  assert.equal(wordDelay({ text: 'anticipation', paragraphEnd: false }, 300), 200);
  assert.equal(wordDelay({ text: 'extraordinary.', paragraphEnd: false }, 300), 500);
});

test('remainingMs sums delays from the next word to the end', () => {
  const words = tokenize('하나 둘. 셋');
  assert.equal(remainingMs(words, 0, 300), 500 + 500);
  assert.equal(remainingMs(words, 2, 300), 0);
});

test('tokenize normalizes decomposed Hangul (NFD paste) so the pivot never splits a syllable', () => {
  const nfd = '한국어'.normalize('NFD');
  const [word] = tokenize(nfd);
  assert.equal(word.text, '한국어');
  assert.equal([...word.text][pivotIndex(word.text)], '국');
});

test('remainingTable matches remainingMs at every index', () => {
  const words = tokenize('첫째, 둘째. 셋째\n\n넷째 extraordinary');
  const table = remainingTable(words, 450);
  words.forEach((_, i) => {
    let ms = 0;
    for (let j = i + 1; j < words.length; j++) ms += wordDelay(words[j], 450);
    assert.equal(table[i], ms);
  });
});

test('paragraphStarts lists the first word index of each paragraph', () => {
  assert.deepEqual(paragraphStarts(tokenize('하나 둘.\n\n셋 넷\n\n\n다섯')), [0, 2, 4]);
  assert.deepEqual(paragraphStarts(tokenize('한 문단만 있다')), [0]);
  assert.deepEqual(paragraphStarts([]), []);
});

test('paragraphAt finds the paragraph containing a word', () => {
  const starts = [0, 2, 4];
  assert.equal(paragraphAt(starts, 0), 0);
  assert.equal(paragraphAt(starts, 3), 1);
  assert.equal(paragraphAt(starts, 9), 2);
});

test('sentenceStarts splits after sentence-ending punctuation and paragraph ends', () => {
  const words = tokenize('하나 둘. 셋 "넷?" 다섯\n\n여섯 일곱… 여덟');
  // 하나0 둘.1 | 셋2 "넷?"3 | 다섯4(문단 끝) | 여섯5 일곱…6 | 여덟7
  assert.deepEqual(sentenceStarts(words), [0, 2, 4, 5, 7]);
  assert.deepEqual(sentenceStarts([]), []);
});

test('stepTo moves to the next/previous unit start; mid-unit back goes to the current start first', () => {
  const starts = [0, 2, 4, 5, 7];
  assert.equal(stepTo(starts, 0, 1), 2);
  assert.equal(stepTo(starts, 3, 1), 4);
  assert.equal(stepTo(starts, 7, 1), 7);
  assert.equal(stepTo(starts, 3, -1), 2);
  assert.equal(stepTo(starts, 2, -1), 0);
  assert.equal(stepTo(starts, 0, -1), 0);
});

test('stepTo forward never moves backwards from the middle of the last unit', () => {
  const starts = [0, 2, 4, 5, 7];
  assert.equal(stepTo(starts, 8, 1), 8);
  assert.equal(stepTo(starts, 9, 1), 9);
});

test('pivotIndex ignores leading/trailing punctuation so "아니다." highlights the middle syllable', () => {
  assert.equal(pivotIndex('아니다.'), 1);
  assert.equal(pivotIndex('봅시다.'), 1);
  assert.equal(pivotIndex('그리고,'), 1);
  assert.equal(pivotIndex('"정말?"'), 2);
  assert.equal(pivotIndex('...'), 1);
});

test('tokenize tags each word with the latest numbered heading line ("1. ", "2.1 ")', () => {
  const words = tokenize('머리말 문장.\n\n1. 서론\n본문 하나.\n\n2.1 방법과 자료\n본문 둘.\n2) 이것도 제목');
  const by = Object.fromEntries(words.map((w) => [w.text, w.heading]));
  assert.equal(by['머리말'], null);
  assert.equal(by['서론'], '1. 서론');
  assert.equal(by['하나.'], '1. 서론');
  assert.equal(by['방법과'], '2.1 방법과 자료');
  assert.equal(by['둘.'], '2.1 방법과 자료');
  assert.equal(by['이것도'], '2) 이것도 제목');
});

test('a heading line ends a sentence even without punctuation', () => {
  const words = tokenize('1. 서론\n본문 하나');
  assert.deepEqual(sentenceStarts(words), [0, 2]);
});

test('long or number-only lines are not headings', () => {
  const long = '1. ' + '아주 긴 목록 항목 문장이 계속 이어진다 '.repeat(4);
  assert.equal(tokenize(long)[0].heading, null);
  assert.equal(tokenize('2026. 11. 13 기록')[0].heading, null);
  assert.equal(tokenize('3.5 퍼센트가 늘었다')[0].heading, '3.5 퍼센트가 늘었다');
});
