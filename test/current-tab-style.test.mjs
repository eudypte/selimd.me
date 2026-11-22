// The open tab or year on music.txt (aria-current="page") must look the same
// however it was reached. It used to turn the hover/focus color after a second
// click, because `.viewer-link:focus` and `.viewer-link:hover` repaint every
// link and came later in the file with equal specificity. The current style
// now names :hover and :focus itself (higher specificity), and keyboard focus
// on it only adds an outline ring.
// No test framework: run with `node test/current-tab-style.test.mjs`.

import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const css = readFileSync(new URL("../css/style.css", import.meta.url), "utf8");

const current = css.match(
  /\.viewer-link\[aria-current="page"\],\s*\.viewer-link\[aria-current="page"\]:is\(:hover, :focus\)\s*\{([^}]*)\}/,
);
assert.ok(current, "the current style must also cover :hover and :focus");
assert.match(current[1], /background:\s*var\(--theme-chrome\)/);
assert.match(current[1], /color:\s*var\(--theme-background\)/);

const ring = css.match(/\.viewer-link\[aria-current="page"\]:focus-visible\s*\{([^}]*)\}/);
assert.ok(ring, "keyboard focus on the current tab needs its own cue");
assert.match(ring[1], /outline:\s*2px solid var\(--theme-selected-bg\)/);
assert.doesNotMatch(ring[1], /background/, "the ring must not repaint the tab");

console.log("ok - the current music tab keeps one look in every state");
