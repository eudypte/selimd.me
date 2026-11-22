// Worker routes and the weekly cron, against a fake KV and a mocked Last.fm.
// No test framework: run with `node test/worker.test.mjs`.

import assert from "node:assert/strict";

const DAY = 86400;
const start = Date.UTC(2025, 11, 14, 12) / 1000; // Sun 2025-12-14 noon UTC
// Four finished weeks plus the running one, oldest first like Last.fm.
const charts = [0, 1, 2, 3, 4].map((i) => ({
  "#text": "",
  from: String(start + i * 7 * DAY),
  to: String(start + (i + 1) * 7 * DAY),
}));
const now = (start + 4 * 7 * DAY + DAY) * 1000; // a day into the running week
// Registered during the second week, so the first week is pre-history.
const registered = start + 10 * DAY;

const calls = [];
let failFrom = null;
globalThis.fetch = async (url) => {
  const u = new URL(url);
  assert.equal(u.origin + u.pathname, "https://ws.audioscrobbler.com/2.0/");
  assert.equal(u.searchParams.get("api_key"), "test-key");
  assert.equal(u.searchParams.get("user"), "someone");
  const method = u.searchParams.get("method");
  calls.push(method);
  let body;
  if (method === "user.getRecentTracks") {
    body = { recenttracks: { track: [
      { name: "Now", artist: { "#text": "A" }, album: { "#text": "L" }, url: "https://www.last.fm/x", "@attr": { nowplaying: "true" } },
      { name: "Then", artist: { "#text": "B" }, album: { "#text": "M" }, url: "https://www.last.fm/y", date: { uts: "1700000000" } },
    ] } };
  } else if (method === "user.getInfo") {
    body = { user: { name: "someone", registered: { unixtime: String(registered), "#text": registered } } };
  } else if (method === "user.getWeeklyChartList") {
    body = { weeklychartlist: { chart: charts } };
  } else if (method === "user.getWeeklyAlbumChart") {
    if (u.searchParams.get("from") === failFrom) return new Response("", { status: 500 });
    const album = Array.from({ length: 7 }, (_, i) => ({
      name: `Album ${i + 1} of ${u.searchParams.get("from")}`,
      artist: { "#text": `Artist ${i + 1}` },
      playcount: String(20 - i),
    }));
    body = { weeklyalbumchart: { album } };
  } else {
    body = { error: 3, message: "Invalid method" };
  }
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
};

const store = new Map();
let puts = 0;
const env = {
  LASTFM_API_KEY: "test-key",
  LASTFM_USER: "someone",
  SPOTIFY_HISTORY: {
    get: async (k) => store.get(k) ?? null,
    put: async (k, v) => { puts++; store.set(k, v); },
  },
};

const realNow = Date.now;
Date.now = () => now;
const { default: worker } = await import("../worker/spotify-proxy.js");
const get = (path) => worker.fetch(new Request(`https://w.example${path}`), env);

// Recent: Last.fm tracks in the page's shape, cached for 60s.
let res = await get("/");
assert.equal(res.status, 200);
assert.equal(res.headers.get("Access-Control-Allow-Origin"), "*");
assert.deepEqual(await res.json(), [
  { name: "Now", artists: ["A"], album: "L", playedAt: null, url: "https://www.last.fm/x", nowPlaying: true },
  { name: "Then", artists: ["B"], album: "M", playedAt: "2023-11-14T22:13:20.000Z", url: "https://www.last.fm/y", nowPlaying: false },
]);
await get("/");
assert.equal(calls.filter((c) => c === "user.getRecentTracks").length, 1, "second call within 60s is cached");
Date.now = () => now + 61_000;
await get("/");
assert.equal(calls.filter((c) => c === "user.getRecentTracks").length, 2, "refetched after 60s");
Date.now = () => now;

// Before any cron run the week list is empty and no week is known.
assert.equal(await (await get("/lastfm/weeks")).text(), "[]");
assert.equal((await get("/lastfm/week/2025-12-14")).status, 404);

// A pre-history week stored by an older version (before the registration
// filter) is dropped, not kept or refetched.
store.set("lastfm-weeks", JSON.stringify([{ from: Number(charts[0].from), to: Number(charts[0].to) }]));

// Cron: finished weeks since registration, newest first, top 5; a failure
// keeps the progress made so far.
failFrom = charts[2].from;
calls.length = 0;
await worker.scheduled({}, env);
let weeks = JSON.parse(store.get("lastfm-weeks"));
assert.deepEqual(weeks.map((w) => w.from), [3, 2, 1].map((i) => Number(charts[i].from)));
assert.equal(weeks[0].albums.length, 5);
assert.deepEqual(weeks[0].albums[0], { name: `Album 1 of ${charts[3].from}`, artist: "Artist 1", plays: 20 });
assert.equal(weeks[1].albums, undefined, "failed week is left to the next run");
assert.equal(weeks[2].albums, undefined, "the run stops at the first failure");
assert.equal(calls.filter((c) => c === "user.getWeeklyAlbumChart").length, 2, "pre-history is never fetched");
assert.equal(puts, 1);

// /lastfm/weeks serves the stored value as is.
assert.equal(await (await get("/lastfm/weeks")).text(), store.get("lastfm-weeks"));

// A week the cron filled comes from KV; an unfilled known week is fetched
// live once; dates outside the list are refused without calling Last.fm.
calls.length = 0;
res = await get("/lastfm/week/2026-01-04");
assert.equal((await res.json()).albums.length, 5);
assert.equal(calls.length, 0);
failFrom = null;
res = await get("/lastfm/week/2025-12-21");
assert.equal(res.status, 200);
assert.equal((await res.json()).albums[0].name, `Album 1 of ${charts[1].from}`);
await get("/lastfm/week/2025-12-21");
assert.deepEqual(calls, ["user.getWeeklyAlbumChart"], "live week fetched once");
calls.length = 0;
for (const path of ["/lastfm/week/2025-12-14", "/lastfm/week/2026-01-11", "/lastfm/week/2025-12-15", "/lastfm/week/x", "/nope"]) {
  assert.equal((await get(path)).status, 404, path);
}
assert.equal(calls.length, 0, "unknown weeks never reach Last.fm");

// The next run fills the rest; a run with nothing new writes nothing.
await worker.scheduled({}, env);
weeks = JSON.parse(store.get("lastfm-weeks"));
assert.ok(weeks.every((w) => w.albums.length === 5));
assert.equal(puts, 2);
await worker.scheduled({}, env);
assert.equal(puts, 2);

// Method checks and Last.fm errors.
assert.equal((await worker.fetch(new Request("https://w.example/", { method: "POST" }), env)).status, 405);
assert.equal((await worker.fetch(new Request("https://w.example/", { method: "OPTIONS" }), env)).status, 200);
Date.now = () => now + 200_000;
env.LASTFM_USER = "fails";
globalThis.fetch = async () => new Response(JSON.stringify({ error: 6, message: "User not found" }));
assert.equal((await get("/")).status, 502);

Date.now = realNow;
console.log("ok - worker routes and weekly cron");
