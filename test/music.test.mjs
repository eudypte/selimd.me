// music.txt page formatting and navigation: the address after the file, the
// year and week pages, prev/next across years, and "[" / "]" year steps.
// No test framework: run with `node test/music.test.mjs`.

import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const src = readFileSync(new URL("../js/music.js", import.meta.url), "utf8");
const m = vm.createContext({});
vm.runInContext(src, m);
const run = (expr) => vm.runInContext(expr, m);

// Last.fm weeks start Sunday noon UTC. The worker's list, newest first, as
// it can arrive: an empty 2024 week from before the first scrobble, empty
// weeks, a week the cron has not fetched yet, and played weeks across the
// 2025/2026 boundary (DEC 28 - JAN 04 belongs to 2025).
const DAY = 86400;
const first = Date.UTC(2025, 11, 7, 12) / 1000; // Sun 2025-12-07
const raw = [0, 1, 2, 3, 4, 5]
  .map((i) => ({ from: first + i * 7 * DAY, to: first + (i + 1) * 7 * DAY }))
  .reverse();
raw[0].albums = [{ name: "Album [Deluxe]", artist: "Band", plays: 1 }]; // 2026-01-11
raw[1].albums = []; // 2026-01-04
raw[2].albums = [
  { name: "Selected Ambient Works 85-92 (Remastered Expanded Edition)", artist: "Aphex Twin", plays: 12 },
  { name: "Second", artist: "Y", plays: 7 },
]; // 2025-12-28
raw[3].albums = [{ name: "Short", artist: "Z", plays: 3 }]; // 2025-12-21
raw[4].albums = []; // 2025-12-14
// raw[5] (2025-12-07) is not fetched yet.
const old = Date.UTC(2024, 5, 2, 12) / 1000;
raw.push({ from: old, to: old + 7 * DAY, albums: [] });
m.raw = raw;
m.weeks = run("musicPlayedWeeks(raw)");
const weeks = run("weeks");

// Only played weeks are kept: no empty, unfetched or pre-history weeks.
assert.deepEqual(run("weeks.map(weekId)"), ["2026-01-11", "2025-12-28", "2025-12-21"]);
assert.deepEqual([...run("musicYears(weeks)")], [2026, 2025], "no 2024 tab");
assert.equal(run("musicPlayedWeeks(null).length"), 0);
assert.equal(run("weekLabel(weeks[1])"), "DEC 28 - JAN 04");

// Address parsing
assert.equal(run("parseMusicTail([]).tab"), "recent");
assert.equal(run("parseMusicTail(['junk']).tab"), "recent");
assert.equal(run("JSON.stringify(parseMusicTail(['weeks']))"), '{"tab":"weekly"}');
assert.equal(run("parseMusicTail(['weeks', '2025']).year"), 2025);
assert.equal(run("parseMusicTail(['weeks', '2025-12-28']).week"), "2025-12-28");
assert.equal(run("JSON.stringify(parseMusicTail(['weeks', 'x']))"), '{"tab":"weekly"}');

// The weekly tab opens the newest year; a week opens its own year.
assert.equal(run("musicViewYear({ tab: 'weekly' }, weeks)"), 2026);
assert.equal(run("musicViewYear({ tab: 'weekly', week: '2025-12-28' }, weeks)"), 2025);

// Wrapping: hanging indent, 40 columns, long words split.
assert.equal(run("wrap('aaa bbb ccc', 2, 10)"), "aaa bbb\n  ccc");
assert.equal(run("wrap('abcdefghijkl', 2, 10)"), "abcdefgh\n  ijkl");
assert.equal(run("wrap('', 3)"), "");

// Year page: one entry per played week, dates linked, then the top album and
// its artist, wrapped under the album (never cut off).
assert.deepEqual(run("formatYear(weeks, 2025)").replace(/\u00a0/g, " ").split("\n"), [
  "[DEC 28 - JAN 04](personal/music.txt/weeks/2025-12-28)  Selected Ambient Works",
  "                 85-92 (Remastered",
  "                 Expanded Edition) -",
  "                 Aphex Twin",
  "",
  "[DEC 21 - DEC 28](personal/music.txt/weeks/2025-12-21)  Short - Z",
]);
// The dash never starts a line: it stays with the album's last word.
assert.equal(run("wrap('Kid A Mnesia\u00a0- Radiohead', 17)"), "Kid A Mnesia\u00a0-\n" + " ".repeat(17) + "Radiohead");
for (const line of run("formatYear(weeks, 2025)").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").split("\n")) {
  assert.ok(line.length <= 40, `fits 40 columns: ${line}`);
}
assert.match(run("formatYear(weeks, 2026)"), /JAN 11 - JAN 18\]\([^)]+\)  Album \(Deluxe\)\u00a0- Band$/);

// Week page: top 5 with artists, prev/next skip unplayed weeks and cross the
// year boundary, link back to the year.
const week = run("formatWeek(weeks, '2025-12-28')");
assert.match(week, /^WEEK OF DEC 28 - JAN 04, 2025\n/);
assert.match(week, /1\. Selected Ambient Works 85-92\n   \(Remastered Expanded Edition\)\n   Aphex Twin · 12 plays/);
assert.match(week, /2\. Second\n   Y · 7 plays/);
assert.match(week, /\[< prev\]\(personal\/music\.txt\/weeks\/2025-12-21\)/);
assert.match(week, /\[next >\]\(personal\/music\.txt\/weeks\/2026-01-11\)/);
assert.match(week, /\[all of 2025\]\(personal\/music\.txt\/weeks\/2025\)$/);
assert.match(run("formatWeek(weeks, '2026-01-11')"), /Band · 1 play\n/);
// At the ends the missing direction is plain text, not a link.
assert.match(run("formatWeek(weeks, '2026-01-11')"), /\[< prev\]\([^)]+\)  next >  /);
assert.match(run("formatWeek(weeks, '2025-12-21')"), /\n< prev  \[next >\]/);
assert.equal(run("formatWeek(weeks, '2026-01-04')"), "No such week.", "empty weeks have no page");
assert.equal(run("formatWeek(weeks, '2025-12-15')"), "No such week.");

// "[" goes to the older year, "]" to the newer one, null past either end.
assert.equal(run("musicYearStep({ tab: 'weekly' }, weeks, -1)"), "personal/music.txt/weeks/2025");
assert.equal(run("musicYearStep({ tab: 'weekly', week: '2025-12-28' }, weeks, 1)"), "personal/music.txt/weeks/2026");
assert.equal(run("musicYearStep({ tab: 'weekly', year: 2025 }, weeks, -1)"), null);
assert.equal(run("musicYearStep({ tab: 'weekly', year: 2026 }, weeks, 1)"), null);
assert.equal(run("musicYearStep({ tab: 'recent' }, weeks, -1)"), null);

// Whole pages: tabs and year row, with the open tab and year marked current.
const page = run("formatMusicPage({ tab: 'weekly', week: '2025-12-28' }, { weeks })");
assert.match(page.text, /^\[recent\]\(personal\/music\.txt\)  \[weekly\]\(personal\/music\.txt\/weeks\)\n-{40}\nYEARS  \[2026\]\([^)]+\)  \[2025\]\([^)]+\)\n\n/);
assert.deepEqual([...page.active], ["personal/music.txt/weeks", "personal/music.txt/weeks/2025"]);
assert.equal(page.head, 4, "recent, weekly, 2026, 2025 come before the body");
assert.equal(run("formatMusicPage({ tab: 'recent' }, { tracks: [] }).head"), 2);
assert.equal(run("formatMusicPage({ tab: 'weekly' }, { weeks: null }).text").endsWith("Loading..."), true);
assert.match(run("formatMusicPage({ tab: 'weekly' }, { weeks: [] }).text"), /No weeks yet/);

// The year row wraps after five years, in 40 columns.
const row = run("formatYearRow([2026,2025,2024,2023,2022,2021,2020], 2026).text");
const visible = row.replace(/\[(\d{4})\]\([^)]+\)/g, "$1").trimEnd().split("\n");
assert.deepEqual(visible, ["YEARS  2026  2025  2024  2023  2022", "       2021  2020"]);

// Recent tab: now playing, relative time, and names that cannot form links.
m.tracks = [
  { name: "Song (Live)", artists: ["Artist"], url: "https://www.last.fm/music/A/_/Song+(Live)", nowPlaying: true },
  { name: "x](javascript:alert(1)", artists: ["B"], url: "javascript:alert(1)", playedAt: new Date(Date.now() - 300_000).toISOString() },
];
const recent = run("formatRecent(tracks)");
assert.match(recent, /^- \[Song \(Live\)\]\(https:\/\/www\.last\.fm\/music\/A\/_\/Song\+%28Live%29\)\n    Artist · now playing/);
assert.match(recent, /- x\)\(javascript:alert\(1\)\n    B · 5m ago$/);
assert.doesNotMatch(recent, /\]\(javascript/);
assert.equal(run("formatRecent([])").startsWith("No listening history yet."), true);

console.log("ok - music.txt pages, addresses and year/week navigation");
