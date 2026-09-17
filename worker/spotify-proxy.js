// Cloudflare Worker: serves the "spotify-recent" KV key as JSON with permissive CORS.
//
// Deploy instructions:
//   1. cd worker
//   2. npx wrangler login
//   3. npx wrangler deploy
//   (wrangler.toml already binds the "spotify-history" KV namespace; update
//   its `id` field with the namespace ID first if it is not already set)
//
// After deploy, wrangler prints a *.workers.dev URL (or configure a custom
// domain/route in the Cloudflare dashboard). Report that URL back so the
// site's fetch source can be switched over in phase 2.

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders() });
    }

    const value = await env.SPOTIFY_HISTORY.get("spotify-recent");

    if (value === null) {
      return new Response("Not found", { status: 404, headers: corsHeaders() });
    }

    return new Response(value, {
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(),
      },
    });
  },
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
}
