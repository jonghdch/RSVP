// RSVP_MAIN_01 화면 동작. 정책 = docs/screens/RSVP_MAIN_01.md
import { tokenize, pivotIndex, wordDelay, remainingTable } from './rsvp.js';

const MIN_FIT = 0.3; // 긴 단어를 줄일 때 글자 크기 하한 (기본 크기 대비)

const $ = (id) => document.getElementById(id);
const el = {
  reader: $('reader'),
  stage: $('stage'),
  word: $('word'),
  message: $('stage-message'),
  announce: $('announce'),
  progress: $('progress'),
  status: $('status'),
  start: $('btn-start'),
  prev: $('btn-prev'),
  play: $('btn-play'),
  next: $('btn-next'),
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

// 단어가 영역 폭을 넘으면 글자 크기를 줄여 맞춘다
function fitWord() {
  el.word.style.setProperty('--fit', 1);
  const width = before.offsetWidth + pivot.offsetWidth + after.offsetWidth;
  const room = el.word.clientWidth;
  if (width > room) el.word.style.setProperty('--fit', Math.max(room / width, MIN_FIT));
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

  const focused = document.activeElement; // 아래에서 비활성으로 바뀌기 전에 잡아 둔다
  const playLabel = ended ? '처음부터' : playing ? '일시정지' : '재생';
  el.stage.disabled = empty;
  el.stage.setAttribute('aria-label', empty ? '읽을 글 없음' : ended ? '처음부터 다시 읽기' : playLabel);

  el.progress.disabled = empty;
  el.progress.max = Math.max(words.length - 1, 0);
  el.progress.value = index;
  el.progress.setAttribute('aria-valuetext', empty ? '글 없음' : `${index + 1} / ${words.length} 단어`);

  el.status.textContent = empty
    ? '0 / 0 단어'
    : `${index + 1} / ${words.length} 단어 · 남은 시간 ${formatTime(ended ? 0 : state.remaining[index])}`;

  el.start.disabled = empty;
  el.prev.disabled = empty || index === 0;
  el.next.disabled = empty || index === words.length - 1;
  el.play.disabled = empty;
  el.play.textContent = playLabel;

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

el.stage.addEventListener('click', togglePlay);
el.play.addEventListener('click', togglePlay);
el.start.addEventListener('click', () => moveTo(0));
el.prev.addEventListener('click', () => moveTo(state.index - 1));
el.next.addEventListener('click', () => moveTo(state.index + 1));

el.progress.addEventListener('input', () => {
  state.index = Number(el.progress.value);
  state.ended = false;
  state.shownAt = performance.now();
  render();
  schedule();
});

el.speed.addEventListener('input', () => setSpeed(Number(el.speed.value)));

el.source.addEventListener('input', () => {
  stop();
  state.words = tokenize(el.source.value);
  state.remaining = remainingTable(state.words, state.wpm);
  state.index = 0;
  state.ended = false;
  announce('');
  render();
});

window.addEventListener('resize', () => state.words.length && fitWord());

// 단축키는 포커스가 페이지 바탕이나 읽기 영역에 있을 때만 받는다. 입력칸 쪽에서는 글자 입력과 스크롤을 막지 않는다
document.addEventListener('keydown', (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.target !== document.body && !el.reader.contains(e.target)) return;
  if (e.key === ' ' && e.target instanceof HTMLButtonElement) return; // 버튼은 Space 기본 동작(누르기)을 쓴다
  const onRange = e.target instanceof HTMLInputElement && e.target.type === 'range';
  if (e.key === ' ') {
    e.preventDefault();
    togglePlay();
  } else if (onRange) {
    return; // 슬라이더 위에서는 화살표를 슬라이더 기본 동작에 맡긴다
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    moveTo(state.index - 1);
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    moveTo(state.index + 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    setSpeed(state.wpm + 25);
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    setSpeed(state.wpm - 25);
  }
});

setSpeed(state.wpm);
