// music.txt pages: a "recent" tab (Last.fm recent scrobbles) and a "weekly"
// tab (top albums per Last.fm week, one short page per year and per week).
// Everything here is pure text formatting; app.js fetches the data and
// renders the result. Every page state has its own address after the file:
//   #/personal/music.txt                    recent
//   #/personal/music.txt/weeks              newest year
//   #/personal/music.txt/weeks/2025         one year, a line per week
//   #/personal/music.txt/weeks/2025-11-16   one week, top 5
// Loaded as a classic script before app.js; test/music.test.mjs runs it in a vm.

const MUSIC_PATH = "personal/music.txt";
const MUSIC_WEEKS_PATH = `${MUSIC_PATH}/weeks`;
const MUSIC_WIDTH = 40;
const MUSIC_RULE = "-".repeat(MUSIC_WIDTH);
const SPOTIFY_PROFILE_URL = "https://open.spotify.com/user/goodgametr";
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function parseMusicTail(tail) {
  if (tail[0] !== "weeks") return { tab: "recent" };
  const arg = tail[1] || "";
  if (/^\d{4}$/.test(arg)) return { tab: "weekly", year: Number(arg) };
  if (/^\d{4}-\d{2}-\d{2}$/.test(arg)) return { tab: "weekly", week: arg };
  return { tab: "weekly" };
}

// Last.fm weeks run Sunday noon to Sunday noon UTC; a week is named and filed
// under the UTC date it starts on.
function weekId(week) {
  return new Date(week.from * 1000).toISOString().slice(0, 10);
}

function weekYear(week) {
  return Number(weekId(week).slice(0, 4));
}

function shortDate(sec) {
  const d = new Date(sec * 1000);
  return `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, "0")}`;
}

function weekLabel(week) {
  return `${shortDate(week.from)} - ${shortDate(week.to)}`;
}

// Names come from scrobbles, so keep them from forming [label](path) links,
// and fold any run of whitespace to one space for wrap().
function plain(str) {
  return String(str ?? "").replace(/\[/g, "(").replace(/\]/g, ")").replace(/\s+/g, " ").trim();
}

// Last.fm URLs can hold parentheses, which would end a (path) early.
function safeUrl(url) {
  if (typeof url !== "string" || !/^https:\/\//.test(url)) return null;
  return url.replace(/[()"\s]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"));
}

// Word-wrap to `width` columns after an `indent` already on the first line,
// indenting the lines that follow by the same amount (a hanging indent).
// Words are split on plain spaces only, so a no-break space keeps two words
// together; a word longer than a line is split.
function wrap(str, indent, width = MUSIC_WIDTH) {
  const room = width - indent;
  const words = str.split(" ").filter(Boolean).flatMap((w) => w.match(new RegExp(`.{1,${room}}`, "g")));
  const lines = [];
  for (const word of words) {
    const last = lines.length - 1;
    if (last >= 0 && lines[last].length + 1 + word.length <= room) lines[last] += " " + word;
    else lines.push(word);
  }
  return lines.join("\n" + " ".repeat(indent));
}

// The worker lists every Last.fm week since the user registered, including
// weeks with no plays and ones its cron has not fetched yet; only weeks with
// albums are shown, so years, pages and prev/next skip the rest.
// Anything malformed (no dates, albums that are not a list) is dropped too.
function musicPlayedWeeks(weeks) {
  if (!Array.isArray(weeks)) return [];
  return weeks.filter(
    (w) =>
      Number.isFinite(w?.from) &&
      Number.isFinite(w?.to) &&
      Array.isArray(w.albums) &&
      w.albums.length > 0 &&
      w.albums.every((a) => a && typeof a === "object"),
  );
}

function musicYears(weeks) {
  return [...new Set(weeks.map(weekYear))].sort((a, b) => b - a);
}

// The year a weekly view shows: the one named, the year of the week named,
// else the newest year with data.
function musicViewYear(view, weeks) {
  if (view.year) return view.year;
  if (view.week) return Number(view.week.slice(0, 4));
  return musicYears(weeks)[0] ?? null;
}

// Path to the year before (dir = -1, "[") or after (dir = 1, "]") the one
// shown, or null at either end.
function musicYearStep(view, weeks, dir) {
  if (view.tab !== "weekly" || !weeks) return null;
  const years = musicYears(weeks);
  const i = years.indexOf(musicViewYear(view, weeks));
  const next = i < 0 ? undefined : years[i - dir];
  return next === undefined ? null : `${MUSIC_WEEKS_PATH}/${next}`;
}

// The tab row, on both tabs: "recent  weekly  check out my spotify↗" is 37
// columns.
function formatTabs(tab) {
  return {
    text:
      `[recent](${MUSIC_PATH})  [weekly](${MUSIC_WEEKS_PATH})  ` +
      `[check out my spotify](${SPOTIFY_PROFILE_URL})\n${MUSIC_RULE}\n`,
    active: [tab === "recent" ? MUSIC_PATH : MUSIC_WEEKS_PATH],
  };
}

function formatYearRow(years, current) {
  // Wrap on visible width: "YEARS" plus five "  2026" fit in 40 columns.
  const perLine = Math.floor((MUSIC_WIDTH - 5) / 6);
  const lines = [];
  for (let i = 0; i < years.length; i += perLine) {
    const links = years.slice(i, i + perLine).map((y) => `  [${y}](${MUSIC_WEEKS_PATH}/${y})`);
    lines.push((i === 0 ? "YEARS" : "     ") + links.join(""));
  }
  return {
    text: lines.join("\n") + "\n\n",
    active: current ? [`${MUSIC_WEEKS_PATH}/${current}`] : [],
  };
}

// The recent tab's mood, a 40-column Norton Commander style panel:
//   ╔════════════ CURRENT MOOD ════════════╗
//   ║ mellow · jazz · late night           ║
//   ╚══════════════════════════════════════╝
// mood: null while loading ("..." in the box); false, undefined or no tags
// = no box.
// Tags that do not fit drop from the end.
function formatMoodBox(mood) {
  const inner = MUSIC_WIDTH - 2;
  const room = inner - 2;
  let line;
  if (mood === null) {
    line = "...";
  } else {
    const names = (Array.isArray(mood?.tags) ? mood.tags : [])
      .map((t) => plain(t?.name).toLowerCase())
      .filter(Boolean);
    if (names.length === 0) return "";
    line = names[0].length > room ? names[0].slice(0, room - 3) + "..." : names[0];
    for (const name of names.slice(1)) {
      if (line.length + 3 + name.length > room) break;
      line += ` · ${name}`;
    }
  }
  const label = " CURRENT MOOD ";
  const left = Math.floor((inner - label.length) / 2);
  return (
    `╔${"═".repeat(left)}${label}${"═".repeat(inner - left - label.length)}╗\n` +
    `║ ${line.padEnd(room)} ║\n` +
    `╚${"═".repeat(inner)}╝\n\n`
  );
}

const MUSIC_LOAD_ERROR = "Couldn't load this. Try reloading the\npage in a minute.";

function formatRecent(tracks) {
  if (tracks === null) return "Loading...";
  if (!Array.isArray(tracks)) return MUSIC_LOAD_ERROR;
  if (tracks.length === 0) {
    return "No listening history yet. Check back\nonce something has been scrobbled.";
  }
  return tracks
    .filter((t) => t && typeof t === "object")
    .map((t) => {
      const artists = Array.isArray(t.artists) ? t.artists.join(", ") : t.artist || "";
      const when = t.nowPlaying ? "now playing" : t.playedAt ? relativeTime(t.playedAt) : "";
      const url = safeUrl(t.url);
      const title = url ? `[${plain(t.name)}](${url})` : plain(t.name);
      return `- ${title}\n    ${plain(artists)}${when ? ` · ${when}` : ""}`;
    })
    .join("\n\n");
}

function formatYear(weeks, year) {
  const lines = weeks
    .filter((w) => weekYear(w) === year)
    .map((w) => {
      // The dash stays on the album's line, so no line starts with "- ".
      const top = `${plain(w.albums[0].name)}\u00a0- ${plain(w.albums[0].artist)}`;
      const label = weekLabel(w);
      return `[${label}](${MUSIC_WEEKS_PATH}/${weekId(w)})  ${wrap(top, label.length + 2)}`;
    });
  return lines.length ? lines.join("\n\n") : `No weeks in ${year}.`;
}

function formatWeek(weeks, id) {
  const i = weeks.findIndex((w) => weekId(w) === id);
  if (i < 0) return "No such week.";
  const week = weeks[i];
  const year = weekYear(week);
  const body = week.albums
    .slice(0, 5)
    .map((a, n) => {
      const plays = `${a.plays} play${Number(a.plays) === 1 ? "" : "s"}`;
      return `${n + 1}. ${wrap(plain(a.name), 3)}\n   ${wrap(`${plain(a.artist)} · ${plays}`, 3)}`;
    })
    .join("\n\n");
  // Newest first, so the older week is the next entry.
  const older = weeks[i + 1];
  const newer = weeks[i - 1];
  const prev = older ? `[< prev](${MUSIC_WEEKS_PATH}/${weekId(older)})` : "< prev";
  const next = newer ? `[next >](${MUSIC_WEEKS_PATH}/${weekId(newer)})` : "next >";
  return (
    `WEEK OF ${weekLabel(week)}, ${year}\n\n${body}\n\n` +
    `${prev}  ${next}  [all of ${year}](${MUSIC_WEEKS_PATH}/${year})`
  );
}

// data: { tracks, weeks, mood } where null means not loaded yet and false means
// the worker failed or answered with something unexpected; weeks are the
// played ones only (musicPlayedWeeks).
// Returns the page text, the paths of the links to mark as current, and
// `head`, how many links the tab and year rows take before the page body.
function formatMusicPage(view, data) {
  const tabs = formatTabs(view.tab);
  const page = (header, body, active) => ({
    text: header + body,
    active,
    head: (header.match(/\]\(/g) || []).length,
  });
  if (view.tab === "recent") {
    return page(
      tabs.text,
      (formatMoodBox(data.mood) || "\n") + formatRecent(data.tracks),
      tabs.active,
    );
  }
  if (data.weeks === null) return page(tabs.text, "Loading...", tabs.active);
  if (!Array.isArray(data.weeks)) return page(tabs.text, MUSIC_LOAD_ERROR, tabs.active);
  if (data.weeks.length === 0) {
    return page(tabs.text, "No weeks yet. Check back after the\nfirst sync.", tabs.active);
  }
  const year = musicViewYear(view, data.weeks);
  const row = formatYearRow(musicYears(data.weeks), year);
  const body = view.week
    ? formatWeek(data.weeks, view.week)
    : formatYear(data.weeks, year);
  return page(tabs.text + row.text, body, [...tabs.active, ...row.active]);
}

function relativeTime(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}
