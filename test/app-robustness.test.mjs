// A browser can hold files from two deploys at once (cached data.js with a
// new app.js). The viewer must then say the file couldn't load instead of
// throwing and going blank. Runs js/music.js and js/app.js against a stub DOM.
// No test framework: run with `node test/app-robustness.test.mjs`.

import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

function element() {
  return {
    textContent: "",
    innerHTML: "",
    hidden: true,
    dataset: {},
    classList: { toggle() {}, add() {} },
    addEventListener() {},
    appendChild() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    contains: () => false,
  };
}
const elements = new Map();
const context = vm.createContext({
  document: {
    getElementById: (id) => elements.get(id) ?? elements.set(id, element()).get(id),
    addEventListener() {},
    body: element(),
    documentElement: element(),
    createElement: element,
  },
  window: { addEventListener() {} },
  location: { hash: "" },
  localStorage: { getItem: () => null, setItem() {} },
  // An old-shaped data.js: music.txt was dynamic "spotify", and a file with
  // no content at all.
  FS: {
    name: "",
    type: "dir",
    children: [
      { name: "music.txt", type: "file", dynamic: "spotify" },
      { name: "empty.txt", type: "file" },
    ],
  },
  fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ unexpected: true }) }),
  setInterval: () => 0,
  clearInterval() {},
});
vm.runInContext(read("js/music.js"), context);
vm.runInContext(read("js/app.js"), context);
const viewer = elements.get("viewer-content");
const run = (code) => vm.runInContext(code, context);

const ERROR = run("FILE_ERROR");
assert.match(ERROR, /Couldn't load this file\. Try reloading/);

run("renderFileView(FS.children[0])");
assert.equal(viewer.textContent, ERROR, "unknown dynamic type");
run("renderFileView(FS.children[1])");
assert.equal(viewer.textContent, ERROR, "file without content");
assert.equal(run("sizeLabel(FS.children[1])"), "?", "the file list does not throw either");

// The worker answering with an unexpected shape: a short message, not a blank.
run("music.tracks = false; music.weeks = false");
const music = { name: "music.txt", type: "file", dynamic: "music" };
context.musicNode = music;
run("renderFileView(musicNode)");
assert.match(viewer.innerHTML, /Couldn't load this\. Try reloading/);
run("state.selected = musicNode; state.tail = ['weeks']; renderFileView(musicNode)");
assert.match(viewer.innerHTML, /Couldn't load this\. Try reloading/);

// Even a formatter crash on odd data ends in the message.
run("music.weeks = [{ from: 'x' }]");
run("renderFileView(musicNode)");
assert.equal(viewer.textContent, ERROR);

console.log("ok - mismatched files and data show a message instead of a blank viewer");
