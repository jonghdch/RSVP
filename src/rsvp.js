// RSVP 핵심 계산: 단어 나누기, 강조 글자 위치, 단어별 표시 시간.
// 강조 글자·표시 시간 규칙은 참고 사이트(gamebob.dev RSVP 속독기)와 같게 맞췄다 (2026-11-13 사용자 결정)
// 화면 정책 = docs/screens/RSVP_MAIN_01.md ①·⑧·⑨

const CLOSERS = /["'”’)\]}」』》〉]+$/u;

const LONG_WORD = 12;
const FACTOR = { sentence: 2.5, comma: 2, long: 1.5 };

export function tokenize(text) {
  const words = [];
  for (const paragraph of text.normalize('NFC').split(/\n\s*\n/)) {
    const parts = paragraph.split(/\s+/).filter(Boolean);
    parts.forEach((part, i) => {
      words.push({ text: part, paragraphEnd: i === parts.length - 1 });
    });
  }
  return words;
}

// 앞에서 35% 지점(올림). 문장부호도 글자 수에 센다. 인덱스는 코드 포인트 기준
export function pivotIndex(word) {
  const n = [...word].length;
  if (n <= 1) return 0;
  return Math.min(Math.ceil((n - 1) * 0.35), n - 1);
}

// 배율은 겹치지 않는다: 문장 끝 > 쉼표 > 긴 단어 순으로 하나만 적용
export function wordDelay(word, wpm) {
  const base = 60000 / wpm;
  const last = [...word.text.replace(CLOSERS, '')].pop() ?? '';
  let factor = 1;
  if (/[.?!。？！…]/u.test(last) || word.paragraphEnd) factor = FACTOR.sentence;
  else if (/[,;:，、]/u.test(last)) factor = FACTOR.comma;
  else if ([...word.text].length > LONG_WORD) factor = FACTOR.long;
  return Math.round(base * factor);
}

// 현재 단어 다음부터 끝까지 남은 시간
export function remainingMs(words, index, wpm) {
  return remainingTable(words, wpm)[index] ?? 0;
}

// 위치마다 남은 시간 표. 재생 중 매 단어마다 전체를 다시 더하지 않도록 글·속도가 바뀔 때 한 번 만든다
export function remainingTable(words, wpm) {
  const table = new Array(words.length).fill(0);
  for (let i = words.length - 2; i >= 0; i--) table[i] = table[i + 1] + wordDelay(words[i + 1], wpm);
  return table;
}
