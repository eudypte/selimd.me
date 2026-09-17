Cloudflare Worker that serves the `spotify-recent` KV key as JSON with permissive CORS, for selimd.me's Spotify listening-history widget.

Deploy:

1. `cd worker`
2. `npx wrangler login`
3. Edit `wrangler.toml` and set `id` under `[[kv_namespaces]]` to the "spotify-history" namespace's ID (`npx wrangler kv namespace list` if you need to look it up).
4. `npx wrangler deploy`

Wrangler prints the deployed `*.workers.dev` URL. That URL (or a custom domain, if you set one up in the Cloudflare dashboard) is needed for phase 2, when `js/app.js` gets switched to read from Cloudflare instead of the committed `data/spotify-recent.json` file.
