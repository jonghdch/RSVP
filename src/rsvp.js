// RSVP 핵심 계산: 단어 나누기, 강조 글자 위치, 단어별 표시 시간.
// 강조 글자·표시 시간 규칙은 참고 사이트(gamebob.dev RSVP 속독기)와 같게 맞췄다 (2026-11-13 사용자 결정).
// 다만 강조 글자는 앞뒤 문장부호를 세지 않는다 ("아니다." 가 "다" 로 밀리던 문제, 같은 날 사용자 지적)
// 화면 정책 = docs/screens/RSVP_MAIN_01.md ①·⑧·⑨

const CLOSERS = /["'”’)\]}」』》〉]+$/u;

const LONG_WORD = 12;
const FACTOR = { sentence: 2.5, comma: 2, long: 1.5 };

// 목차 제목 줄: "1. 서론", "2.1 방법", "3) 결과" 처럼 번호(1~3자리, 점으로 이어짐) 뒤에 공백과 글자가 오는 짧은 줄.
// "2026. 11. 13" 같은 날짜는 번호 뒤가 숫자라 제외된다
const HEADING = /^\d{1,3}(?:\.\d{1,3})*(?:[.)]|(?=\s))\s+\D/u;
const HEADING_MAX = 40;

function isHeading(line) {
  return line.length <= HEADING_MAX && HEADING.test(line);
}

// 단어마다 text, paragraphEnd(문단 끝), headingEnd(제목 줄 끝), heading(지금 속한 목차 제목, 없으면 null)
export function tokenize(text) {
  const words = [];
  let heading = null;
  for (const paragraph of text.normalize('NFC').split(/\n\s*\n/)) {
    const lines = paragraph.split('\n').map((line) => line.trim()).filter(Boolean);
    lines.forEach((line, li) => {
      const headingLine = isHeading(line);
      if (headingLine) heading = line.replace(/\s+/g, ' ');
      const parts = line.split(/\s+/);
      parts.forEach((part, i) => {
        const lineEnd = i === parts.length - 1;
        words.push({
          text: part,
          paragraphEnd: lineEnd && li === lines.length - 1,
          headingEnd: lineEnd && headingLine,
          headingMark: headingLine && i === 0 && /^[\d.)]+$/.test(part), // 제목 앞 번호 "1." — 문장 끝이 아니다
          heading,
        });
      });
    });
  }
  return words;
}

const EDGE_LEAD = /^[\p{P}\p{S}]+/u;
const EDGE_TRAIL = /[\p{P}\p{S}]+$/u;

// 앞뒤 문장부호를 뺀 글자에서 앞 35% 지점(올림). 부호만 있는 단어는 전체로 센다. 인덱스는 코드 포인트 기준
export function pivotIndex(word) {
  const chars = [...word];
  let lead = [...(word.match(EDGE_LEAD)?.[0] ?? '')].length;
  let n = chars.length - lead - [...(word.match(EDGE_TRAIL)?.[0] ?? '')].length;
  if (n <= 0) [lead, n] = [0, chars.length];
  if (n <= 1) return lead;
  return lead + Math.min(Math.ceil((n - 1) * 0.35), n - 1);
}

function lastChar(word) {
  return [...word.text.replace(CLOSERS, '')].pop() ?? '';
}

// 문장이 끝나는 단어: 닫는 따옴표·괄호 앞이 . ? ! 류이거나, 문단·목차 제목 줄의 마지막 단어
function endsSentence(word) {
  if (word.headingMark && !word.headingEnd) return false;
  return /[.?!。？！…]/u.test(lastChar(word)) || word.paragraphEnd || Boolean(word.headingEnd);
}

// 배율은 겹치지 않는다: 문장 끝 > 쉼표 > 긴 단어 순으로 하나만 적용
export function wordDelay(word, wpm) {
  const base = 60000 / wpm;
  const last = lastChar(word);
  let factor = 1;
  if (endsSentence(word)) factor = FACTOR.sentence;
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

// 문단마다 첫 단어의 위치 (진행 막대의 문단 눈금용)
export function paragraphStarts(words) {
  return words.flatMap((word, i) => (i === 0 || words[i - 1].paragraphEnd ? [i] : []));
}

// index 번째 단어가 들어 있는 칸 번호 (0부터). starts = 문단·문장 시작 위치 목록
export function paragraphAt(starts, index) {
  let p = 0;
  while (p + 1 < starts.length && starts[p + 1] <= index) p++;
  return p;
}

// 문장마다 첫 단어의 위치 (문장 단위로 넘길 때)
export function sentenceStarts(words) {
  return words.flatMap((word, i) => (i === 0 || endsSentence(words[i - 1]) ? [i] : []));
}

// 단위(문장·문단) 시작 위치 목록에서 한 칸 앞뒤로. 뒤로 갈 때 단위 중간이면 그 단위의 처음으로 먼저 간다
export function stepTo(starts, index, step) {
  if (!starts.length) return index;
  const current = paragraphAt(starts, index);
  const target = step < 0 && index > starts[current] ? current : current + step;
  if (target >= starts.length) return index; // 마지막 단위에서는 앞으로 갈 곳이 없다
  return starts[Math.max(target, 0)];
}
