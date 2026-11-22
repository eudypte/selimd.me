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

// Last.fm weeks start Sunday noon UTC. Five weeks, newest first, spanning the
// 2025/2026 boundary; DEC 28 - JAN 04 belongs to 2025.
const DAY = 86400;
const first = Date.UTC(2025, 11, 14, 12) / 1000; // Sun 2025-12-14
const weeks = [0, 1, 2, 3, 4]
  .map((i) => ({ from: first + i * 7 * DAY, to: first + (i + 1) * 7 * DAY }))
  .reverse();
weeks[0].albums = [];
weeks[1].albums = [{ name: "Album [Deluxe]", artist: "Band", plays: 1 }];
weeks[2].albums = [
  { name: "A Very Long Album Title That Goes On And On", artist: "X", plays: 12 },
  { name: "Second", artist: "Y", plays: 7 },
];
// weeks[3] has no albums yet (cron catching up); weeks[4] too.
m.weeks = weeks;

assert.deepEqual(run("weeks.map(weekId)"), [
  "2026-01-11", "2026-01-04", "2025-12-28", "2025-12-21", "2025-12-14",
]);
assert.equal(run("weekLabel(weeks[2])"), "DEC 28 - JAN 04");

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

// Year page: one line per week, dates linked, top album truncated to 40 columns.
const year2025 = run("formatYear(weeks, 2025)").split("\n");
assert.deepEqual(year2025, [
  "[DEC 28 - JAN 04](personal/music.txt/weeks/2025-12-28)  A Very Long Album Ti...",
  "[DEC 21 - DEC 28](personal/music.txt/weeks/2025-12-21)  ...",
  "[DEC 14 - DEC 21](personal/music.txt/weeks/2025-12-14)  ...",
]);
assert.equal("DEC 28 - JAN 04  A Very Long Album Ti...".length, 40);
assert.match(run("formatYear(weeks, 2026)"), /JAN 04 - JAN 11\]\([^)]+\)  Album \(Deluxe\)$/m);
assert.match(run("formatYear(weeks, 2026)"), /JAN 11 - JAN 18\]\([^)]+\)  \(no plays\)$/m);

// Week page: top 5, prev/next cross the year boundary, link back to the year.
const week = run("formatWeek(weeks, '2025-12-28', weeks[2].albums)");
assert.match(week, /^WEEK OF DEC 28 - JAN 04, 2025\n/);
assert.match(week, /1\. A Very Long Album Title That Goes On And On\n   X · 12 plays/);
assert.match(week, /\[< prev\]\(personal\/music\.txt\/weeks\/2025-12-21\)/);
assert.match(week, /\[next >\]\(personal\/music\.txt\/weeks\/2026-01-04\)/);
assert.match(week, /\[all of 2025\]\(personal\/music\.txt\/weeks\/2025\)$/);
assert.match(run("formatWeek(weeks, '2026-01-04', weeks[1].albums)"), /Band · 1 play\n/);
// At the ends the missing direction is plain text, not a link.
assert.match(run("formatWeek(weeks, '2026-01-11', [])"), /No plays this week\.[\s\S]*\[< prev\]\([^)]+\)  next >  /);
assert.match(run("formatWeek(weeks, '2025-12-14', null)"), /Loading\.\.\.\n\n< prev  \[next >\]/);
assert.match(run("formatWeek(weeks, '2025-12-14', false)"), /Could not load this week\./);
assert.equal(run("formatWeek(weeks, '2025-12-15', [])"), "No such week.");

// "[" goes to the older year, "]" to the newer one, null past either end.
assert.equal(run("musicYearStep({ tab: 'weekly' }, weeks, -1)"), "personal/music.txt/weeks/2025");
assert.equal(run("musicYearStep({ tab: 'weekly', week: '2025-12-28' }, weeks, 1)"), "personal/music.txt/weeks/2026");
assert.equal(run("musicYearStep({ tab: 'weekly', year: 2025 }, weeks, -1)"), null);
assert.equal(run("musicYearStep({ tab: 'weekly', year: 2026 }, weeks, 1)"), null);
assert.equal(run("musicYearStep({ tab: 'recent' }, weeks, -1)"), null);

// Whole pages: tabs and year row, with the open tab and year marked current.
const page = run("formatMusicPage({ tab: 'weekly', week: '2025-12-28' }, { weeks, weekAlbums: {} })");
assert.match(page.text, /^\[recent\]\(personal\/music\.txt\)  \[weekly\]\(personal\/music\.txt\/weeks\)\n-{40}\nYEARS  \[2026\]\([^)]+\)  \[2025\]\([^)]+\)\n\n/);
assert.deepEqual([...page.active], ["personal/music.txt/weeks", "personal/music.txt/weeks/2025"]);
assert.equal(page.head, 4, "recent, weekly, 2026, 2025 come before the body");
assert.equal(run("formatMusicPage({ tab: 'recent' }, { tracks: [] }).head"), 2);
// A week without albums in the list uses ones fetched separately.
m.page2 = run("formatMusicPage({ tab: 'weekly', week: '2025-12-21' }, { weeks, weekAlbums: { '2025-12-21': [{ name: 'Fetched', artist: 'Z', plays: 3 }] } })");
assert.match(run("page2.text"), /1\. Fetched\n   Z · 3 plays/);
assert.equal(run("formatMusicPage({ tab: 'weekly' }, { weeks: null }).text").endsWith("Loading..."), true);

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
