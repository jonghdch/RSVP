// RSVP_MAIN_01 화면 동작. 정책 = docs/screens/RSVP_MAIN_01.md
import { tokenize, pivotIndex, wordDelay, remainingTable, paragraphStarts, paragraphAt, sentenceStarts, stepTo } from './rsvp.js';

const MIN_FIT = 0.3; // 긴 단어를 줄일 때 글자 크기 하한 (기본 크기 대비)

const $ = (id) => document.getElementById(id);
const el = {
  reader: $('reader'),
  stageWrap: $('stage-wrap'),
  stage: $('stage'),
  fullscreen: $('btn-fullscreen'),
  heading: $('stage-heading'),
  word: $('word'),
  message: $('stage-message'),
  announce: $('announce'),
  progress: $('progress'),
  marks: $('paragraph-marks'),
  status: $('status'),
  prev: $('btn-prev'),
  play: $('btn-play'),
  next: $('btn-next'),
  prevSentence: $('btn-prev-sentence'),
  nextSentence: $('btn-next-sentence'),
  prevParagraph: $('btn-prev-paragraph'),
  nextParagraph: $('btn-next-paragraph'),
  speed: $('speed'),
  speedValue: $('speed-value'),
  source: $('source'),
};
const [before, pivot, after] = el.word.children;

const state = {
  words: [],
  index: 0,
  playing: false,
  ended: false,
  wpm: 300,
  remaining: [],
  paragraphs: [], // 문단마다 첫 단어 위치
  sentences: [], // 문장마다 첫 단어 위치
  timer: null,
  shownAt: 0, // 지금 단어가 나타난 시각 (performance.now 기준)
};

function formatTime(ms) {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, '0');
  return m ? `${m}분 ${s}초` : `${total}초`;
}

function announce(text) {
  el.announce.textContent = text;
}

// 빨간 글자가 가운데에 있으니 앞·뒤 중 긴 쪽이 절반 폭을 넘으면 글자 크기를 줄인다
function fitWord() {
  el.word.style.setProperty('--fit', 1);
  const half = (el.word.clientWidth - pivot.offsetWidth) / 2;
  const longest = Math.max(before.scrollWidth, after.scrollWidth);
  if (longest > half) el.word.style.setProperty('--fit', Math.max(half / longest, MIN_FIT));
}

// unit(단어·문장·문단)으로 한 칸 앞뒤에 있는 단어 위치
function unitStep(unit, step) {
  const { index, words } = state;
  if (unit === 'word') return Math.min(Math.max(index + step, 0), Math.max(words.length - 1, 0));
  return stepTo(unit === 'sentence' ? state.sentences : state.paragraphs, index, step);
}

function render() {
  const { words, index, playing, ended } = state;
  const empty = words.length === 0;

  el.stage.dataset.state = empty ? 'empty' : ended ? 'ended' : playing ? 'playing' : 'paused';
  el.message.textContent = empty ? '아래에 글을 붙여넣으세요' : ended ? '다 읽었어요' : '';

  if (!empty) {
    const chars = [...words[index].text];
    const p = pivotIndex(words[index].text);
    before.textContent = chars.slice(0, p).join('');
    pivot.textContent = chars[p] ?? '';
    after.textContent = chars.slice(p + 1).join('');
    fitWord();
  }

  const heading = empty || ended ? null : words[index].heading;
  el.heading.textContent = heading ?? '';
  el.stageWrap.classList.toggle('has-heading', Boolean(heading));

  const focused = document.activeElement; // 아래에서 비활성으로 바뀌기 전에 잡아 둔다
  const playLabel = ended ? '처음부터' : playing ? '일시정지' : '재생';
  el.stage.disabled = empty;
  el.fullscreen.disabled = empty;
  el.stage.setAttribute('aria-label', empty ? '읽을 글 없음' : ended ? '처음부터 다시 읽기' : playLabel);

  el.progress.disabled = empty;
  el.progress.max = Math.max(words.length - 1, 0);
  el.progress.value = index;
  el.progress.setAttribute('aria-valuetext', empty ? '글 없음' : `${index + 1} / ${words.length} 단어`);

  const paragraph = paragraphAt(state.paragraphs, index);
  const paragraphText = state.paragraphs.length > 1 ? ` · ${paragraph + 1} / ${state.paragraphs.length} 문단` : '';
  el.status.textContent = empty
    ? '0 / 0 단어'
    : `${index + 1} / ${words.length} 단어${paragraphText} · 남은 시간 ${formatTime(ended ? 0 : state.remaining[index])}`;
  [...el.marks.children].forEach((mark, i) => mark.setAttribute('aria-current', String(i === paragraph)));

  el.prev.disabled = el.prevSentence.disabled = el.prevParagraph.disabled = empty || index === 0;
  el.next.disabled = empty || unitStep('word', 1) === index;
  el.nextSentence.disabled = empty || unitStep('sentence', 1) === index;
  el.nextParagraph.disabled = empty || unitStep('paragraph', 1) === index;
  el.play.disabled = empty;
  el.play.dataset.mode = ended ? 'restart' : playing ? 'pause' : 'play';
  el.play.setAttribute('aria-label', playLabel);
  el.play.title = playLabel;

  // 누르던 버튼이 비활성이 되면 포커스가 사라지므로 재생 버튼으로 옮긴다
  if (focused?.disabled) (el.play.disabled ? el.source : el.play).focus();
}

// delay 를 주지 않으면 지금 단어가 나타난 시각 기준으로 남은 만큼만 기다린다
function schedule() {
  clearTimeout(state.timer);
  if (!state.playing) return;
  const wait = wordDelay(state.words[state.index], state.wpm) - (performance.now() - state.shownAt);
  state.timer = setTimeout(tick, Math.max(wait, 0));
}

function tick() {
  const due = state.shownAt + wordDelay(state.words[state.index], state.wpm);
  if (state.index < state.words.length - 1) {
    state.index += 1;
    state.shownAt = due; // 목표 시각 기준이라 렌더 시간만큼 느려지지 않는다
    render();
    schedule();
  } else {
    state.playing = false;
    state.ended = true;
    render();
    announce('다 읽었어요');
  }
}

function stop() {
  state.playing = false;
  clearTimeout(state.timer);
}

function togglePlay() {
  if (!state.words.length) return;
  if (state.playing) {
    stop();
    announce(`일시정지: ${state.words[state.index].text}`);
  } else {
    if (state.ended) state.index = 0;
    state.ended = false;
    state.playing = true;
    state.shownAt = performance.now();
    announce('재생');
  }
  render();
  schedule();
}

function moveTo(index) {
  if (!state.words.length) return;
  stop();
  state.index = Math.min(Math.max(index, 0), state.words.length - 1);
  state.ended = false;
  render();
  announce(`${state.words[state.index].text} (${state.index + 1} / ${state.words.length})`);
}

function setSpeed(wpm) {
  state.wpm = Math.min(Math.max(wpm, 100), 1000);
  state.remaining = remainingTable(state.words, state.wpm);
  el.speed.value = state.wpm;
  el.speed.setAttribute('aria-valuetext', `분당 ${state.wpm}단어`);
  el.speedValue.textContent = `${state.wpm} WPM`;
  render();
  schedule();
}

// 전체 화면: 브라우저가 지원하면 Fullscreen API, 아니면(아이폰 Safari 등) 페이지를 덮는다
function isFullscreen() {
  return document.fullscreenElement === el.stageWrap || el.stageWrap.classList.contains('is-covering');
}

function syncFullscreen() {
  const on = isFullscreen();
  const label = on ? '전체 화면 끝내기' : '전체 화면';
  el.fullscreen.setAttribute('aria-label', label);
  el.fullscreen.title = label;
  el.fullscreen.toggleAttribute('data-on', on);
  document.body.classList.toggle('no-scroll', on);
  if (state.words.length) fitWord();
}

function setCovering(on) {
  el.stageWrap.classList.toggle('is-covering', on);
  syncFullscreen();
}

async function toggleFullscreen() {
  if (isFullscreen()) {
    if (document.fullscreenElement) await document.exitFullscreen();
    else setCovering(false);
  } else if (el.stageWrap.requestFullscreen && document.fullscreenEnabled) {
    try {
      await el.stageWrap.requestFullscreen();
    } catch {
      setCovering(true);
    }
  } else {
    setCovering(true);
  }
  if (!el.stage.disabled) el.stage.focus();
}

document.addEventListener('fullscreenchange', syncFullscreen);
el.fullscreen.addEventListener('click', toggleFullscreen);

// ⑮ 화면 모드: 처음에는 시스템 설정을 따르고, 누르면 반대 모드로 고정한다 (저장하지 않음)
const themeBtn = $('btn-theme');
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

function isDark() {
  const chosen = document.documentElement.dataset.theme;
  return chosen ? chosen === 'dark' : systemDark.matches;
}

function syncThemeButton() {
  const dark = isDark();
  const label = dark ? '라이트 모드로 바꾸기' : '다크 모드로 바꾸기';
  themeBtn.toggleAttribute('data-dark', dark);
  themeBtn.setAttribute('aria-label', label);
  themeBtn.title = label;
}

themeBtn.addEventListener('click', () => {
  document.documentElement.dataset.theme = isDark() ? 'light' : 'dark';
  syncThemeButton();
});
systemDark.addEventListener('change', syncThemeButton);
syncThemeButton();

el.stage.addEventListener('click', togglePlay);
el.play.addEventListener('click', togglePlay);
for (const [button, unit, step] of [
  [el.prev, 'word', -1], [el.next, 'word', 1],
  [el.prevSentence, 'sentence', -1], [el.nextSentence, 'sentence', 1],
  [el.prevParagraph, 'paragraph', -1], [el.nextParagraph, 'paragraph', 1],
]) {
  button.addEventListener('click', () => moveTo(unitStep(unit, step)));
}

el.progress.addEventListener('input', () => jumpTo(Number(el.progress.value)));

el.speed.addEventListener('input', () => setSpeed(Number(el.speed.value)));

// 재생 중이면 계속 재생한다 (진행 막대를 끌 때와 같음)
function jumpTo(index) {
  state.index = index;
  state.ended = false;
  state.shownAt = performance.now();
  render();
  schedule();
}

// 문단 눈금: 문단이 2개 이상일 때만. 키보드는 PageUp/PageDown 으로 대신하므로 탭 순서에서 뺀다
function buildMarks() {
  const { words, paragraphs } = state;
  el.marks.replaceChildren(...(paragraphs.length > 1 ? paragraphs : []).map((start, i) => {
    const mark = document.createElement('button');
    mark.type = 'button';
    mark.className = 'paragraph-mark';
    mark.tabIndex = -1;
    mark.style.setProperty('--at', start / Math.max(words.length - 1, 1));
    const preview = words.slice(start, start + 4).map((w) => w.text).join(' ');
    mark.title = `${i + 1}문단: ${preview}`;
    mark.setAttribute('aria-label', `${i + 1}문단으로 이동`);
    mark.addEventListener('click', () => jumpTo(start));
    return mark;
  }));
  el.marks.hidden = paragraphs.length < 2;
}

el.source.addEventListener('input', () => {
  stop();
  state.words = tokenize(el.source.value);
  state.remaining = remainingTable(state.words, state.wpm);
  state.paragraphs = paragraphStarts(state.words);
  state.sentences = sentenceStarts(state.words);
  buildMarks();
  state.index = 0;
  state.ended = false;
  announce('');
  render();
});

window.addEventListener('resize', () => state.words.length && fitWord());

// 단축키는 포커스가 페이지 바탕이나 읽기 영역에 있을 때만 받는다. 입력칸 쪽에서는 글자 입력과 스크롤을 막지 않는다
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && el.stageWrap.classList.contains('is-covering')) {
    setCovering(false); // 브라우저 전체 화면은 Esc 를 브라우저가 처리한다
    return;
  }
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.target !== document.body && !el.reader.contains(e.target)) return;
  if (e.key === ' ' && e.target instanceof HTMLButtonElement) return; // 버튼은 Space 기본 동작(누르기)을 쓴다
  const onRange = e.target instanceof HTMLInputElement && e.target.type === 'range';
  // F·0 은 키 위치(code)로 본다 — 한글 입력 상태에서도 F 자리는 KeyF 다
  if (e.code === 'KeyF' && !e.shiftKey) {
    e.preventDefault();
    if (state.words.length) toggleFullscreen();
  } else if (e.code === 'Digit0' || e.code === 'Numpad0') {
    e.preventDefault();
    moveTo(0);
  } else if (e.key === ' ') {
    e.preventDefault();
    togglePlay();
  } else if (onRange) {
    return; // 슬라이더 위에서는 화살표를 슬라이더 기본 동작에 맡긴다
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    moveTo(unitStep(e.shiftKey ? 'sentence' : 'word', -1));
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    moveTo(unitStep(e.shiftKey ? 'sentence' : 'word', 1));
  } else if (e.key === 'PageUp') {
    e.preventDefault();
    moveTo(unitStep('paragraph', -1));
  } else if (e.key === 'PageDown') {
    e.preventDefault();
    moveTo(unitStep('paragraph', 1));
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    setSpeed(state.wpm + 25);
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    setSpeed(state.wpm - 25);
  }
});

setSpeed(state.wpm);
