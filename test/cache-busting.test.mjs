// Every css/js file index.html loads carries ?v=dev, and the Pages workflow
// rewrites all of them to the commit, so a cache never mixes two deploys.
// No test framework: run with `node test/cache-busting.test.mjs`.

import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const root = new URL("..", import.meta.url);
const html = readFileSync(new URL("index.html", root), "utf8");
const workflow = readFileSync(new URL(".github/workflows/pages.yml", root), "utf8");

const assets = [
  ...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g),
  ...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*\shref="([^"]+)"/g),
].map((m) => m[1]);
assert.deepEqual(assets.sort(), [
  "css/style.css?v=dev",
  "js/app.js?v=dev",
  "js/data.js?v=dev",
  "js/music.js?v=dev",
]);

// The workflow's stamp step, applied the same way.
assert.ok(workflow.includes(`sed -i "s/?v=dev\\"/?v=\${GITHUB_SHA::7}\\"/g" index.html`));
const stamped = html.replace(/\?v=dev"/g, '?v=abc1234"');
assert.doesNotMatch(stamped, /\?v=dev/);
assert.equal(stamped.match(/\?v=abc1234"/g).length, assets.length);

console.log("ok - css/js are versioned per deploy");
