// Cloudflare Worker behind music.txt: Last.fm listening data as JSON with
// permissive CORS. The API key is a secret (LASTFM_API_KEY) and never leaves
// the worker; the user name is the LASTFM_USER var in wrangler.toml.
//
//   GET /                      recent scrobbles, newest first, the track
//                              playing now marked nowPlaying
//   GET /lastfm/weeks          every finished Last.fm week since the user
//                              registered, newest first:
//                              [{from, to, albums?: [{name, artist, plays}]}]
//                              (from/to in Unix seconds; albums = top 5, absent
//                              until the cron has fetched that week)
//   GET /lastfm/week/<date>    one week's top 5, by the UTC date it starts on
//   GET /lastfm/mood           top 3 artist tags of the last 20 plays:
//                              {of, tags: [{name, count}]}, count = plays
//                              whose artist carries the tag
//
// The hourly cron (wrangler.toml) keeps KV key "lastfm-weeks" up to date: it
// adds new weeks and fills in up to 40 missing ones per run, newest first,
// so a long history catches up over a few hours.
//
// Deploy: cd worker && npx wrangler deploy (after
// `npx wrangler secret put LASTFM_API_KEY`). The name stays "spotify-proxy"
// because the site fetches spotify-proxy.eudypte.workers.dev.

const LASTFM_API = "https://ws.audioscrobbler.com/2.0/";
const WEEKS_KEY = "lastfm-weeks";
const RECENT_TTL_MS = 60_000;
const WEEKS_PER_RUN = 40; // stays under the free plan's 50 subrequests per run
const TOP_ALBUMS = 5;
const MOOD_TTL_MS = 30 * 60_000;
const MOOD_PLAYS = 20;
const ARTIST_TAGS_TTL_MS = 24 * 60 * 60_000;
// Tags that say nothing about the music.
const TAG_STOPLIST = new Set([
  "seen live", "favorites", "favourite", "favourites", "love", "albums i own", "under 2000 listeners",
]);

// caches.default does nothing on *.workers.dev, so these live in the isolate.
// ponytail: per-isolate memory, so each new isolate pays one Last.fm call;
// move to the Cache API if the worker gets a custom domain.
let recentCache = null; // { at, tracks, body }
let moodCache = null; // { at, body }
const artistTagsCache = new Map(); // lowercased artist -> { at, tags }
const weekCache = new Map(); // date -> body; a finished week never changes

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }
    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders() });
    }

    const { pathname } = new URL(request.url);
    try {
      if (pathname === "/") return json((await recentTracks(env)).body, 60);
      if (pathname === "/lastfm/mood") return json(await mood(env), 1800);
      if (pathname === "/lastfm/weeks") {
        return json((await env.SPOTIFY_HISTORY.get(WEEKS_KEY)) ?? "[]", 300);
      }
      const week = pathname.match(/^\/lastfm\/week\/(\d{4}-\d{2}-\d{2})$/);
      if (week) {
        const body = await weekChart(env, week[1]);
        return body === null ? notFound() : json(body, 31_536_000);
      }
    } catch {
      return new Response("Last.fm unavailable", { status: 502, headers: corsHeaders() });
    }
    return notFound();
  },

  async scheduled(_event, env) {
    await syncWeeks(env);
  },
};

async function recentTracks(env, now = Date.now()) {
  if (recentCache && now - recentCache.at < RECENT_TTL_MS) return recentCache;
  const data = await lastfm(env, "user.getRecentTracks", { limit: "50" });
  const tracks = [].concat(data.recenttracks?.track ?? []).map((t) => ({
    name: t.name,
    artists: [t.artist?.["#text"] ?? ""],
    album: t.album?.["#text"] ?? "",
    playedAt: t.date?.uts ? new Date(Number(t.date.uts) * 1000).toISOString() : null,
    url: t.url,
    nowPlaying: t["@attr"]?.nowplaying === "true",
  }));
  recentCache = { at: now, tracks, body: JSON.stringify(tracks) };
  return recentCache;
}

// The mood is the artists' Last.fm tags, since most tracks have none: each
// tag scores one point per recent play whose artist carries it.
async function mood(env, now = Date.now()) {
  if (moodCache && now - moodCache.at < MOOD_TTL_MS) return moodCache.body;
  const plays = (await recentTracks(env, now)).tracks.slice(0, MOOD_PLAYS);
  const artists = [...new Set(plays.map((t) => t.artists[0]).filter(Boolean))];
  const names = new Set(artists.map((a) => a.toLowerCase().trim()));
  const tagsOf = new Map();
  await Promise.all(
    artists.map(async (a) => tagsOf.set(a, (await artistTags(env, a, now)).filter((t) => !names.has(t)))),
  );
  const score = new Map();
  for (const t of plays) {
    for (const tag of tagsOf.get(t.artists[0]) ?? []) score.set(tag, (score.get(tag) ?? 0) + 1);
  }
  const tags = [...score]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => ({ name, count }));
  moodCache = { at: now, body: JSON.stringify({ of: plays.length, tags }) };
  return moodCache.body;
}

// An artist's top 5 tags with weight >= 10, lowercased, without decades,
// years and the stoplist. A failed lookup counts as no tags and is retried
// next time.
async function artistTags(env, artist, now) {
  const key = artist.toLowerCase().trim();
  const hit = artistTagsCache.get(key);
  if (hit && now - hit.at < ARTIST_TAGS_TTL_MS) return hit.tags;
  let data;
  try {
    data = await lastfm(env, "artist.getTopTags", { artist, autocorrect: "1" });
  } catch {
    return [];
  }
  const tags = [...new Set(
    [].concat(data.toptags?.tag ?? [])
      .filter((t) => Number(t.count) >= 10)
      .slice(0, 5)
      .map((t) => String(t.name ?? "").toLowerCase().trim())
      .filter((t) => t && !/^(\d{2}|\d{4})s?$/.test(t) && !TAG_STOPLIST.has(t)),
  )];
  artistTagsCache.set(key, { at: now, tags });
  return tags;
}

// Only weeks in the stored list are served, so an arbitrary date can neither
// spend the key nor grow the memory cache.
async function weekChart(env, date) {
  const weeks = JSON.parse((await env.SPOTIFY_HISTORY.get(WEEKS_KEY)) ?? "[]");
  const week = weeks.find((w) => weekId(w) === date);
  if (!week) return null;
  if (week.albums) return JSON.stringify(week);
  if (!weekCache.has(date)) {
    weekCache.set(date, JSON.stringify({ ...week, albums: await weekAlbums(env, week) }));
  }
  return weekCache.get(date);
}

async function syncWeeks(env, now = Date.now()) {
  const list = await lastfm(env, "user.getWeeklyChartList");
  // The chart list starts in 2005 for everyone; weeks that ended before the
  // user registered have no plays, so they are never stored or fetched.
  const info = await lastfm(env, "user.getInfo");
  const registered = Number(info.user?.registered?.unixtime ?? 0);
  const stored = JSON.parse((await env.SPOTIFY_HISTORY.get(WEEKS_KEY)) ?? "[]");
  const known = new Map(stored.filter((w) => w.albums).map((w) => [w.from, w]));

  // The chart list runs oldest first; keep finished weeks, newest first.
  const weeks = [].concat(list.weeklychartlist?.chart ?? [])
    .map((c) => ({ from: Number(c.from), to: Number(c.to) }))
    .filter((w) => w.to * 1000 <= now && w.to > registered)
    .reverse()
    .map((w) => known.get(w.from) ?? w);

  let budget = WEEKS_PER_RUN;
  for (const week of weeks) {
    if (week.albums) continue;
    if (budget-- === 0) break;
    try {
      week.albums = await weekAlbums(env, week);
    } catch {
      break; // keep what this run already fetched; the next run retries
    }
  }

  const value = JSON.stringify(weeks);
  if (value !== JSON.stringify(stored)) await env.SPOTIFY_HISTORY.put(WEEKS_KEY, value);
}

async function weekAlbums(env, week) {
  const data = await lastfm(env, "user.getWeeklyAlbumChart", {
    from: String(week.from),
    to: String(week.to),
  });
  return [].concat(data.weeklyalbumchart?.album ?? []).slice(0, TOP_ALBUMS).map((a) => ({
    name: a.name,
    artist: a.artist?.["#text"] ?? "",
    plays: Number(a.playcount),
  }));
}

async function lastfm(env, method, params = {}) {
  const url = new URL(LASTFM_API);
  url.search = new URLSearchParams({
    method,
    user: env.LASTFM_USER,
    api_key: env.LASTFM_API_KEY,
    format: "json",
    ...params,
  });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Last.fm ${method}: HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`Last.fm ${method}: ${data.message}`);
  return data;
}

function weekId(week) {
  return new Date(week.from * 1000).toISOString().slice(0, 10);
}

function json(body, maxAge) {
  return new Response(body, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${maxAge}`,
      ...corsHeaders(),
    },
  });
}

function notFound() {
  return new Response("Not found", { status: 404, headers: corsHeaders() });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
}
