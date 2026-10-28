// ================================
// Starlog - a mood journal where every day becomes a star
// ================================

// ----- Moods (5 = best day, 1 = hardest day) -----
const MOODS = {
  5: { name: 'Great', emoji: '😄', color: '#ffd166' },
  4: { name: 'Good',  emoji: '🙂', color: '#7ef0c3' },
  3: { name: 'Okay',  emoji: '😐', color: '#8ecbff' },
  2: { name: 'Low',   emoji: '😔', color: '#b9a6ff' },
  1: { name: 'Rough', emoji: '😢', color: '#ff8fab' }
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Words used to name constellations
const ADJECTIVES = ['Brave', 'Gentle', 'Golden', 'Laughing', 'Sleepy', 'Wild', 'Silver', 'Dancing', 'Curious', 'Shining', 'Quiet', 'Lucky'];
const CREATURES = ['Otter', 'Fox', 'Whale', 'Dragon', 'Owl', 'Kite', 'Lantern', 'Phoenix', 'Comet', 'Rabbit', 'Lion', 'Butterfly'];

// ----- Page elements -----
const canvas = document.getElementById('sky');
const ctx = canvas.getContext('2d');
const tip = document.getElementById('tip');
const emptyBox = document.getElementById('empty');
const detailBox = document.getElementById('detail');
const monthTitle = document.getElementById('month-title');
const constellationName = document.getElementById('constellation-name');
const dateInput = document.getElementById('entry-date');
const textInput = document.getElementById('entry-text');
const moodPicker = document.getElementById('mood-picker');
const formError = document.getElementById('form-error');
const charCount = document.getElementById('char-count');

// ----- App state -----
let entries = loadEntries();       // { '2026-10-28': { mood: 5, text: '...' }, ... }
let viewYear = new Date().getFullYear();
let viewMonth = new Date().getMonth(); // 0 = January
let selectedMood = 0;
let selectedDate = null;           // star that is open in the detail card
let hoverDate = null;              // star under the mouse
let starsOnScreen = [];            // positions of this month's stars (for mouse checks)
let backgroundStars = [];
let shootingStar = null;
let newStarDate = null;            // makes a freshly saved star "pop"
let newStarTime = 0;


// ================================
// Saving and loading (localStorage)
// ================================

function loadEntries() {
  try {
    return JSON.parse(localStorage.getItem('starlog-entries')) || {};
  } catch (error) {
    return {};
  }
}

function saveEntries() {
  localStorage.setItem('starlog-entries', JSON.stringify(entries));
}


// ================================
// Date helpers
// ================================

// Turn a Date into "YYYY-MM-DD" using the local time zone
function toKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

function fromKey(key) {
  const parts = key.split('-');
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

function todayKey() {
  return toKey(new Date());
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function niceDate(key) {
  const date = fromKey(key);
  return WEEKDAYS[date.getDay()] + ', ' + date.getDate() + ' ' + MONTHS[date.getMonth()];
}

// A random number that is always the same for the same text (so the sky never jumps around)
function seededRandom(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) % 100000;
  }
  const x = Math.sin(hash) * 10000;
  return x - Math.floor(x);
}

function escapeHTML(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}


// ================================
// Canvas size + background stars
// ================================

let width = 0;
let height = 0;

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  width = canvas.clientWidth;
  height = canvas.clientHeight;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  // Lots of tiny twinkling stars in the background
  backgroundStars = [];
  const count = Math.round((width * height) / 3500);
  for (let i = 0; i < count; i++) {
    backgroundStars.push({
      x: Math.random() * width,
      y: Math.random() * height,
      r: Math.random() * 1.2 + 0.2,
      speed: Math.random() * 2 + 0.5,
      phase: Math.random() * Math.PI * 2
    });
  }
}

new ResizeObserver(resizeCanvas).observe(canvas);


// ================================
// Where does each day's star go?
// ================================

// Days flow from left to right like a wave across the sky
function starPosition(key) {
  const date = fromKey(key);
  const day = date.getDate();
  const total = daysInMonth(date.getFullYear(), date.getMonth());

  const padX = 50;
  const x = padX + ((day - 1) / (total - 1)) * (width - padX * 2);
  const wave = Math.sin(day * 0.75 + date.getMonth()) * 0.26;
  const jitter = (seededRandom(key) - 0.5) * 0.22;
  const y = height * (0.5 + wave + jitter);

  return { x: x, y: Math.max(60, Math.min(height - 60, y)) };
}

// Bigger stars for longer stories
function starSize(entry) {
  return 4 + Math.min(entry.text.length / 45, 7);
}


// ================================
// Constellations: 2+ good days in a row
// ================================

function findConstellations(keys) {
  const groups = [];
  let current = [];

  keys.forEach(function (key, i) {
    const isGood = entries[key].mood >= 4;
    const previous = keys[i - 1];
    const followsYesterday = previous &&
      (fromKey(key) - fromKey(previous)) / 86400000 === 1;

    if (isGood && (current.length === 0 || followsYesterday)) {
      current.push(key);
    } else {
      if (current.length >= 2) groups.push(current);
      current = isGood ? [key] : [];
    }
  });
  if (current.length >= 2) groups.push(current);

  return groups;
}

function constellationTitle(group) {
  const a = Math.floor(seededRandom(group[0] + 'a') * ADJECTIVES.length);
  const b = Math.floor(seededRandom(group[0] + 'b') * CREATURES.length);
  return 'The ' + ADJECTIVES[a] + ' ' + CREATURES[b];
}

function monthKeys() {
  const prefix = viewYear + '-' + String(viewMonth + 1).padStart(2, '0');
  return Object.keys(entries)
    .filter(function (key) { return key.startsWith(prefix); })
    .sort();
}


// ================================
// Drawing the sky (runs about 60 times per second)
// ================================

function draw(time) {
  const t = time / 1000;
  ctx.clearRect(0, 0, width, height);

  // 1. Background twinkles
  backgroundStars.forEach(function (star) {
    const alpha = 0.35 + Math.sin(t * star.speed + star.phase) * 0.35;
    ctx.fillStyle = 'rgba(255, 255, 255, ' + Math.max(0.05, alpha) + ')';
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
    ctx.fill();
  });

  // 2. A shooting star now and then
  drawShootingStar();

  const keys = monthKeys();
  starsOnScreen = [];

  // 3. Constellation lines (drawn slowly, like a pen)
  const groups = findConstellations(keys);
  groups.forEach(function (group) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 220, 150, 0.35)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([2, 6]);
    ctx.lineDashOffset = -t * 6;
    ctx.beginPath();
    group.forEach(function (key, i) {
      const p = starPosition(key);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
    ctx.restore();
  });

  // 4. One glowing star per journal entry
  keys.forEach(function (key) {
    const entry = entries[key];
    const mood = MOODS[entry.mood];
    const p = starPosition(key);
    let r = starSize(entry);

    // Gentle pulse
    r *= 1 + Math.sin(t * 2 + seededRandom(key) * 6) * 0.08;

    // New stars grow in with a little bounce
    if (key === newStarDate) {
      const age = (time - newStarTime) / 900;
      if (age < 1) r *= easeOutBack(age);
    }

    if (key === hoverDate || key === selectedDate) r *= 1.3;

    // Soft glow
    const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 5);
    glow.addColorStop(0, mood.color + 'aa');
    glow.addColorStop(0.3, mood.color + '33');
    glow.addColorStop(1, mood.color + '00');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 5, 0, Math.PI * 2);
    ctx.fill();

    // Sparkle cross for great days
    if (entry.mood === 5) {
      drawSparkle(p.x, p.y, r * 2.6, mood.color, t);
    }

    // Bright core
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = mood.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 0.35, 0, Math.PI * 2);
    ctx.fill();

    // Ring around the selected star
    if (key === selectedDate) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 2.2, 0, Math.PI * 2);
      ctx.stroke();
    }

    starsOnScreen.push({ key: key, x: p.x, y: p.y, r: Math.max(r * 2, 14) });
  });

  // 5. Dashed "waiting" circle for tonight if nothing written yet
  const today = todayKey();
  const isThisMonth = today.startsWith(viewYear + '-' + String(viewMonth + 1).padStart(2, '0'));
  if (isThisMonth && !entries[today]) {
    const p = starPosition(today);
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 209, 102, ' + (0.4 + Math.sin(t * 3) * 0.3) + ')';
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = 'rgba(255, 209, 102, 0.8)';
    ctx.font = 'italic 13px Fraunces, serif';
    ctx.textAlign = 'center';
    ctx.fillText('tonight', p.x, p.y + 28);
  }

  requestAnimationFrame(draw);
}

function drawSparkle(x, y, size, color, t) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(t * 0.4);
  ctx.strokeStyle = color + 'cc';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-size, 0); ctx.lineTo(size, 0);
  ctx.moveTo(0, -size); ctx.lineTo(0, size);
  ctx.stroke();
  ctx.restore();
}

function drawShootingStar() {
  if (!shootingStar && Math.random() < 0.003) {
    shootingStar = {
      x: Math.random() * width * 0.7,
      y: Math.random() * height * 0.3,
      life: 0
    };
  }
  if (!shootingStar) return;

  const s = shootingStar;
  s.life += 0.02;
  const headX = s.x + s.life * 260;
  const headY = s.y + s.life * 130;

  const trail = ctx.createLinearGradient(headX - 90, headY - 45, headX, headY);
  trail.addColorStop(0, 'rgba(255, 255, 255, 0)');
  trail.addColorStop(1, 'rgba(255, 255, 255, ' + (1 - s.life) + ')');
  ctx.strokeStyle = trail;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(headX - 90, headY - 45);
  ctx.lineTo(headX, headY);
  ctx.stroke();

  if (s.life >= 1) shootingStar = null;
}

function easeOutBack(x) {
  const c = 1.7;
  return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
}


// ================================
// Mouse: hover tooltips and clicking stars
// ================================

function starAt(mouseX, mouseY) {
  for (let i = starsOnScreen.length - 1; i >= 0; i--) {
    const s = starsOnScreen[i];
    if (Math.hypot(mouseX - s.x, mouseY - s.y) <= s.r) return s;
  }
  return null;
}

canvas.addEventListener('mousemove', function (event) {
  const box = canvas.getBoundingClientRect();
  const star = starAt(event.clientX - box.left, event.clientY - box.top);

  if (star) {
    const entry = entries[star.key];
    const mood = MOODS[entry.mood];
    hoverDate = star.key;
    canvas.style.cursor = 'pointer';
    tip.innerHTML = '<b>' + niceDate(star.key) + '</b>' + mood.emoji + ' ' + mood.name +
      ' · ' + escapeHTML(entry.text.slice(0, 70)) + (entry.text.length > 70 ? '…' : '');
    tip.style.left = star.x + 'px';
    tip.style.top = star.y + 'px';
    tip.classList.remove('hidden');
  } else {
    hoverDate = null;
    canvas.style.cursor = 'crosshair';
    tip.classList.add('hidden');
  }
});

canvas.addEventListener('mouseleave', function () {
  hoverDate = null;
  tip.classList.add('hidden');
});

canvas.addEventListener('click', function (event) {
  const box = canvas.getBoundingClientRect();
  const star = starAt(event.clientX - box.left, event.clientY - box.top);
  if (star) {
    openDetail(star.key);
  } else {
    closeDetail();
  }
});


// ================================
// Star detail card
// ================================

function openDetail(key) {
  const entry = entries[key];
  const mood = MOODS[entry.mood];
  selectedDate = key;
  tip.classList.add('hidden');

  document.getElementById('detail-date').textContent = niceDate(key);
  const moodLine = document.getElementById('detail-mood');
  moodLine.textContent = mood.emoji + ' ' + mood.name + ' day';
  moodLine.style.color = mood.color;

  // Highlight #tags in gold
  document.getElementById('detail-text').innerHTML =
    escapeHTML(entry.text).replace(/#(\w+)/g, '<span class="tag">#$1</span>');

  detailBox.classList.remove('hidden');
}

function closeDetail() {
  selectedDate = null;
  detailBox.classList.add('hidden');
}

document.getElementById('detail-close').addEventListener('click', closeDetail);

document.getElementById('detail-edit').addEventListener('click', function () {
  const entry = entries[selectedDate];
  dateInput.value = selectedDate;
  textInput.value = entry.text;
  setMood(entry.mood);
  updateCharCount();
  closeDetail();
  textInput.focus();
});

document.getElementById('detail-delete').addEventListener('click', function () {
  const button = document.getElementById('detail-delete');

  // Ask once by changing the button text, delete on the second click
  if (button.dataset.sure !== 'yes') {
    button.dataset.sure = 'yes';
    button.textContent = 'Sure?';
    setTimeout(function () {
      button.dataset.sure = '';
      button.textContent = 'Delete';
    }, 3000);
    return;
  }

  delete entries[selectedDate];
  saveEntries();
  button.dataset.sure = '';
  button.textContent = 'Delete';
  closeDetail();
  refresh();
  showToast('That star has faded away');
});


// ================================
// Writing a new entry
// ================================

function buildMoodPicker() {
  [5, 4, 3, 2, 1].forEach(function (value) {
    const mood = MOODS[value];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mood-btn';
    button.dataset.mood = value;
    button.style.setProperty('--mood', mood.color);
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', 'false');
    button.innerHTML = '<span class="emoji">' + mood.emoji + '</span>' + mood.name;
    button.addEventListener('click', function () {
      setMood(value);
      formError.textContent = '';
    });
    moodPicker.appendChild(button);
  });
}

function setMood(value) {
  selectedMood = value;
  document.querySelectorAll('.mood-btn').forEach(function (button) {
    const isSelected = Number(button.dataset.mood) === value;
    button.classList.toggle('selected', isSelected);
    button.setAttribute('aria-checked', isSelected);
  });
}

function updateCharCount() {
  charCount.textContent = textInput.value.length + ' / 600 · longer stories make bigger stars';
}

textInput.addEventListener('input', function () {
  updateCharCount();
  formError.textContent = '';
});

document.getElementById('save-btn').addEventListener('click', function () {
  const key = dateInput.value;
  const text = textInput.value.trim();

  if (!key) {
    formError.textContent = 'Pick a day first.';
    return;
  }
  if (key > todayKey()) {
    formError.textContent = 'You can\'t write about the future (yet).';
    return;
  }
  if (!selectedMood) {
    formError.textContent = 'Choose how your day felt.';
    return;
  }
  if (text.length < 3) {
    formError.textContent = 'Write a few words about your day.';
    return;
  }

  const isNew = !entries[key];
  entries[key] = { mood: selectedMood, text: text };
  saveEntries();

  // Jump to the month of the entry so you see the new star appear
  const date = fromKey(key);
  viewYear = date.getFullYear();
  viewMonth = date.getMonth();
  newStarDate = key;
  newStarTime = performance.now();

  textInput.value = '';
  setMood(0);
  updateCharCount();
  refresh();
  showToast(isNew ? '✦ A new star is born' : '✦ Your star was updated');
});


// ================================
// Insights
// ================================

function writingStreak() {
  let streak = 0;
  const day = new Date();
  // If today isn't written yet, the streak can still continue from yesterday
  if (!entries[toKey(day)]) day.setDate(day.getDate() - 1);
  while (entries[toKey(day)]) {
    streak++;
    day.setDate(day.getDate() - 1);
  }
  return streak;
}

function updateInsights() {
  const keys = monthKeys();
  const allKeys = Object.keys(entries);

  document.getElementById('stat-month').textContent = keys.length;
  document.getElementById('stat-streak').textContent = writingStreak();

  // Mood mix bar
  const bar = document.getElementById('mood-bar');
  bar.innerHTML = '';
  [5, 4, 3, 2, 1].forEach(function (value) {
    const count = keys.filter(function (k) { return entries[k].mood === value; }).length;
    if (count === 0) return;
    const part = document.createElement('span');
    part.style.width = (count / keys.length) * 100 + '%';
    part.style.background = MOODS[value].color;
    part.title = MOODS[value].name + ': ' + count;
    bar.appendChild(part);
  });

  const facts = [];

  // Average mood this month
  if (keys.length > 0) {
    const avg = keys.reduce(function (sum, k) { return sum + entries[k].mood; }, 0) / keys.length;
    const mood = MOODS[Math.round(avg)];
    facts.push(['🌙', 'This month felt mostly <strong>' + mood.name.toLowerCase() + '</strong> ' + mood.emoji]);
  }

  // Happiest weekday (uses every entry ever written)
  if (allKeys.length >= 5) {
    const totals = [0, 0, 0, 0, 0, 0, 0];
    const counts = [0, 0, 0, 0, 0, 0, 0];
    allKeys.forEach(function (k) {
      const weekday = fromKey(k).getDay();
      totals[weekday] += entries[k].mood;
      counts[weekday]++;
    });
    let best = -1;
    let bestAvg = 0;
    for (let i = 0; i < 7; i++) {
      if (counts[i] > 0 && totals[i] / counts[i] > bestAvg) {
        bestAvg = totals[i] / counts[i];
        best = i;
      }
    }
    facts.push(['☀️', 'Your brightest days are usually <strong>' + WEEKDAYS[best] + 's</strong>']);
  }

  // Which #tag shows up on your happiest days?
  const tagStats = {};
  allKeys.forEach(function (k) {
    const tags = entries[k].text.toLowerCase().match(/#\w+/g) || [];
    tags.forEach(function (tag) {
      if (!tagStats[tag]) tagStats[tag] = { total: 0, count: 0 };
      tagStats[tag].total += entries[k].mood;
      tagStats[tag].count++;
    });
  });
  let bestTag = null;
  let bestTagAvg = 0;
  Object.keys(tagStats).forEach(function (tag) {
    const s = tagStats[tag];
    if (s.count >= 2 && s.total / s.count > bestTagAvg) {
      bestTagAvg = s.total / s.count;
      bestTag = tag;
    }
  });
  if (bestTag) {
    facts.push(['💛', 'Days with <strong>' + escapeHTML(bestTag) + '</strong> make you happiest']);
  } else {
    facts.push(['🏷️', 'Add <strong>#tags</strong> like #friends or #school to discover what makes you shine']);
  }

  // Longest constellation this month
  const groups = findConstellations(keys);
  if (groups.length > 0) {
    const longest = groups.reduce(function (a, b) { return b.length > a.length ? b : a; });
    constellationName.innerHTML = 'Constellation: <strong>' + constellationTitle(longest) + '</strong> · ' + longest.length + ' bright days';
    facts.push(['✨', 'You drew <strong>' + groups.length + '</strong> constellation' + (groups.length > 1 ? 's' : '') + ' with good-day streaks']);
  } else {
    constellationName.textContent = keys.length ? 'Two good days in a row will draw a constellation' : '';
  }

  document.getElementById('facts').innerHTML = facts.map(function (f) {
    return '<li><span class="icon">' + f[0] + '</span><span>' + f[1] + '</span></li>';
  }).join('');
}


// ================================
// Month navigation + page refresh
// ================================

function refresh() {
  monthTitle.textContent = MONTHS[viewMonth] + ' ' + viewYear;
  emptyBox.classList.toggle('hidden', Object.keys(entries).length > 0);

  // Don't allow going into future months
  const now = new Date();
  const atCurrentMonth = viewYear === now.getFullYear() && viewMonth === now.getMonth();
  document.getElementById('next-month').disabled = atCurrentMonth;
  document.getElementById('next-month').style.opacity = atCurrentMonth ? 0.35 : 1;

  updateInsights();
}

document.getElementById('prev-month').addEventListener('click', function () {
  viewMonth--;
  if (viewMonth < 0) { viewMonth = 11; viewYear--; }
  closeDetail();
  refresh();
});

document.getElementById('next-month').addEventListener('click', function () {
  viewMonth++;
  if (viewMonth > 11) { viewMonth = 0; viewYear++; }
  closeDetail();
  refresh();
});


// ================================
// Legend, sample data, export, clear
// ================================

function buildLegend() {
  document.getElementById('legend').innerHTML = [5, 4, 3, 2, 1].map(function (value) {
    const mood = MOODS[value];
    return '<span><i style="background:' + mood.color + ';color:' + mood.color + '"></i>' + mood.name + '</span>';
  }).join('');
}

function makeSampleSky() {
  const stories = [
    'Movie night with #friends, laughed so much my face hurt',
    'Finished my #project at last! Feeling proud',
    'Rainy day, stayed in and read a book with tea',
    'Long day at #school, tired but okay',
    'Went for a walk in the park, the leaves are turning orange',
    'Had an argument, felt pretty down tonight',
    'Cooked pasta from scratch with #family',
    'Nothing special, just a normal day',
    'Got a great mark on my test at #school!',
    'Felt anxious about tomorrow, could not focus',
    'Played football with #friends after class',
    'Video call with grandma, she told funny stories #family'
  ];

  const day = new Date();
  for (let i = 0; i < 45; i++) {
    if (Math.random() < 0.18) {
      day.setDate(day.getDate() - 1);
      continue; // some days are skipped, like real life
    }
    const story = stories[Math.floor(Math.random() * stories.length)];
    let mood = 3;
    if (/friends|family|proud|great|park/.test(story)) mood = Math.random() < 0.6 ? 5 : 4;
    if (/down|anxious/.test(story)) mood = Math.random() < 0.5 ? 1 : 2;
    entries[toKey(day)] = { mood: mood, text: story };
    day.setDate(day.getDate() - 1);
  }
  saveEntries();
  refresh();
  showToast('✦ Here is a sample sky. Clear it anytime.');
}

document.getElementById('sample-btn').addEventListener('click', makeSampleSky);

document.getElementById('export-btn').addEventListener('click', function () {
  // Copy the sky onto a new canvas and write the month name on it
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const o = out.getContext('2d');
  o.fillStyle = '#070a1c';
  o.fillRect(0, 0, out.width, out.height);
  o.drawImage(canvas, 0, 0);

  const ratio = window.devicePixelRatio || 1;
  o.fillStyle = '#ffd166';
  o.font = 'italic ' + (26 * ratio) + 'px Fraunces, serif';
  o.fillText('My ' + MONTHS[viewMonth] + ' in stars', 24 * ratio, out.height - 28 * ratio);

  const link = document.createElement('a');
  link.download = 'starlog-' + viewYear + '-' + (viewMonth + 1) + '.png';
  link.href = out.toDataURL('image/png');
  link.click();
});

document.getElementById('clear-btn').addEventListener('click', function () {
  const button = document.getElementById('clear-btn');
  if (button.dataset.sure !== 'yes') {
    button.dataset.sure = 'yes';
    button.textContent = 'Click again to clear everything';
    setTimeout(function () {
      button.dataset.sure = '';
      button.textContent = 'Clear all stars';
    }, 3000);
    return;
  }
  entries = {};
  saveEntries();
  button.dataset.sure = '';
  button.textContent = 'Clear all stars';
  closeDetail();
  refresh();
});

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(function () { toast.remove(); }, 2700);
}


// ================================
// Start
// ================================

dateInput.value = todayKey();
dateInput.max = todayKey();
buildMoodPicker();
buildLegend();
resizeCanvas();
refresh();
requestAnimationFrame(draw);
