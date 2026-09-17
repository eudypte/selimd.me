// Regression check for the phone-width Settings trigger.
//
// The trigger used to live in the status bar, the last thing in the document
// flow. Once the viewer pane's content is long enough, the status bar scrolls
// below the fold and Settings becomes unreachable without scrolling (see
// data/selimd-mobile-settings-icon/report.md, finding #2, reproduced against
// the live site: a 780px viewport with ME.TXT open needed 811px). Moving the
// trigger into the pane title, the first thing in the document, fixes this
// unconditionally, regardless of how much content sits below it. This check
// guards the structural fact a future edit could quietly undo: the trigger
// lives in #left-title, not #status-bar.
//
// No test framework: run with `node test/settings-trigger.test.mjs`.

import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const root = new URL("..", import.meta.url);
const html = readFileSync(new URL("index.html", root), "utf8");
const js = readFileSync(new URL("js/app.js", root), "utf8");
const css = readFileSync(new URL("css/style.css", root), "utf8");

const leftTitleMatch = html.match(
  /<div class="pane-title pane-title--file" id="left-title">([\s\S]*?)<\/div>\s*<ul class="file-list"/,
);
assert.ok(leftTitleMatch, "expected #left-title to carry the pane-title--file markup");
assert.match(
  leftTitleMatch[1],
  /id="pane-title-settings-btn"/,
  "expected the Settings button inside #left-title",
);

const statusBarMatch = html.match(/<div class="status-bar" id="status-bar">([\s\S]*?)<\/div>/);
assert.ok(statusBarMatch, "expected #status-bar to exist");
assert.doesNotMatch(
  statusBarMatch[1],
  /<button/,
  "the status bar must not contain a button - it can scroll off-screen (finding #2)",
);

assert.match(
  js,
  /getElementById\("pane-title-settings-btn"\)/,
  "js/app.js must wire up #pane-title-settings-btn",
);
assert.doesNotMatch(
  js,
  /status-settings-btn/,
  "no leftover references to the old status-bar button id",
);

assert.doesNotMatch(
  css,
  /\.status-settings-btn/,
  "the old .status-settings-btn rule should be deleted, not left dead",
);

console.log("ok - settings trigger lives in the pane title, not the status bar");
