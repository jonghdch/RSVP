import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, pivotIndex, wordDelay, remainingMs, remainingTable } from '../src/rsvp.js';

test('tokenize splits on any whitespace and marks paragraph ends', () => {
  const words = tokenize('  안녕하세요  반갑습니다.\n\n둘째   문단\t끝 ');
  assert.deepEqual(words.map((w) => w.text), ['안녕하세요', '반갑습니다.', '둘째', '문단', '끝']);
  assert.deepEqual(words.map((w) => w.paragraphEnd), [false, true, false, false, true]);
});

test('tokenize returns empty list for blank text', () => {
  assert.deepEqual(tokenize(''), []);
  assert.deepEqual(tokenize(' \n\t '), []);
});

test('pivotIndex follows ceil((n - 1) * 0.35), counting punctuation like the reference site', () => {
  assert.equal(pivotIndex(''), 0);
  assert.equal(pivotIndex('a'), 0);
  assert.equal(pivotIndex('읽는'), 1);
  assert.equal(pivotIndex('빠르게'), 1);
  assert.equal(pivotIndex('RSVP'), 2);
  assert.equal(pivotIndex('문장입니다'), 2);
  assert.equal(pivotIndex('reading'), 3);
  assert.equal(pivotIndex('끝났다.'), 2);
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
