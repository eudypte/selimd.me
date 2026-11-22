const navigatorEl = document.getElementById("navigator");
const parentListEl = document.getElementById("parent-list");
const parentTitleEl = document.getElementById("parent-title");
const fileListEl = document.getElementById("file-list");
const leftTitleEl = document.getElementById("left-title-text");
const rightTitleEl = document.getElementById("right-title");
const viewerEl = document.getElementById("viewer-content");
const statusBarEl = document.getElementById("status-bar-text");

const state = {
  dirNode: FS,
  dirPath: [],
  parentNode: null,
  selected: null,
  tail: [],
  listing: [],
  cursor: 0,
  mode: "list", // "list" | "viewer"
  linkIndex: 0,
};

const paneRightEl = document.getElementById("pane-right");

let pendingViewerFocus = false;
let pendingCursorName = null;
let pendingReveal = false;

function setMode(mode) {
  state.mode = mode;
  document.body.classList.toggle("viewer-mode", mode === "viewer");
}

function sortChildren(children) {
  return [...(children || [])].sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function getNodeAtPath(segments) {
  let node = FS;
  for (const seg of segments) {
    node = (node.children || []).find((c) => c.name === seg && c.type === "dir");
    if (!node) return FS;
  }
  return node;
}

function resolveFromHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  const segments = raw ? raw.split("/").map(decodeURIComponent) : [];

  let node = FS;
  const dirPath = [];
  let selected = null;
  let tail = [];

  // Anything after a file is that file's own page address (music.txt tabs).
  for (const [i, seg] of segments.entries()) {
    const child = (node.children || []).find((c) => c.name === seg);
    if (!child) break;
    if (child.type === "dir") {
      node = child;
      dirPath.push(seg);
    } else {
      selected = child;
      tail = segments.slice(i + 1);
      break;
    }
  }

  const children = sortChildren(node.children);

  const listing = [];
  if (dirPath.length > 0) listing.push({ type: "up", name: ".." });
  listing.push(...children);

  state.dirNode = node;
  state.dirPath = dirPath;
  state.parentNode = dirPath.length > 0 ? getNodeAtPath(dirPath.slice(0, -1)) : null;
  state.selected = selected;
  state.tail = tail;
  state.listing = listing;
  state.cursor = selected
    ? Math.max(
        listing.findIndex((n) => n === selected),
        0,
      )
    : 0;
}

function dosPath(segments) {
  return "C:\\" + segments.join("\\").toUpperCase();
}

function sizeLabel(node) {
  if (node.type === "up") return "UP--DIR";
  if (node.type === "dir") return "SUB-DIR";
  if (node.dynamic) return "LIVE";
  return `${node.content.length}`;
}

function renderList() {
  fileListEl.innerHTML = "";
  state.listing.forEach((node, i) => {
    const li = document.createElement("li");
    li.className = node.type === "file" ? "file" : "dir";
    if (i === state.cursor) li.classList.add("selected");
    li.innerHTML = `<span class="name">${node.name}</span><span class="size">${sizeLabel(node)}</span>`;
    li.addEventListener("click", () => {
      state.cursor = i;
      pendingReveal = true;
      openAt(i);
    });
    // Hover preview is for mice only: a tap also fires enter/leave, and the
    // leave would re-render the viewer under a link the finger just touched.
    li.addEventListener("pointerenter", (e) => {
      if (e.pointerType === "mouse") previewNode(node);
    });
    li.addEventListener("pointerleave", (e) => {
      if (e.pointerType !== "mouse") return;
      renderViewer();
      if (state.mode === "viewer") focusLink(state.linkIndex);
    });
    fileListEl.appendChild(li);
  });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Content supports [label](path) links, e.g. [projects](projects) — path is
// always relative to the filesystem root, not the current file's folder.
// A path with a URL scheme, e.g. [github](https://github.com/eudypte), is
// treated as external and opens in a new tab instead of being routed in-app.
// ![alt](assets/x.jpg) embeds an image; a missing file shows [alt] instead.
// The image is wrapped in a viewer-link so it joins j/k navigation and opens
// the photo preview on click or Enter; data-name feeds the hover name bar.
function linkifyContent(raw) {
  return escapeHtml(raw).replace(/(!?)\[([^\]]+)\]\(([^)]+)\)/g, (match, bang, label, path) => {
    if (bang) {
      return `<a href="${path}" class="viewer-link viewer-photo" data-name="${path.split("/").pop()}"><img src="${path}" alt="${label}" class="viewer-image" loading="lazy"></a>`;
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(path)) {
      return `<a href="${path}" class="viewer-link" target="_blank" rel="noopener noreferrer">${label}</a><span class="external-link-mark" aria-hidden="true">↗</span>`;
    }
    return `<a href="#/${path}" class="viewer-link">${label}</a>`;
  });
}

function viewerLinks() {
  return Array.from(viewerEl.querySelectorAll("a.viewer-link"));
}

function focusLink(index) {
  const links = viewerLinks();
  if (links.length === 0) {
    setMode("list");
    return;
  }
  state.linkIndex = Math.max(0, Math.min(index, links.length - 1));
  links[state.linkIndex].focus();
}

function leaveViewerMode() {
  viewerLinks()[state.linkIndex]?.blur();
  setMode("list");
}

const MUSIC_API = "https://spotify-proxy.eudypte.workers.dev";
const MUSIC_REFRESH_MS = 60_000;
// null = not loaded yet. Weeks load once per session; recent tracks poll.
const music = { tracks: null, weeks: null, weekAlbums: {} };
const musicRequests = {};
let musicPollTimer = null;
let musicRenderedNode = null;
let musicRenderedHash = null;

// The address after music.txt picks the page; a hover preview shows "recent".
function musicView() {
  return parseMusicTail(state.selected === musicRenderedNode ? state.tail : []);
}

// One request per path at a time. Whatever happens, `done` stores something
// non-null, so the redraw that follows never asks again in a loop.
function musicFetch(path, done) {
  if (musicRequests[path]) return;
  musicRequests[path] = fetch(MUSIC_API + path, { cache: "no-store" })
    .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
    .then(done, () => done(null))
    .finally(() => {
      delete musicRequests[path];
      if (musicRenderedNode) drawMusic();
    });
}

function loadRecent() {
  musicFetch("/", (data) => {
    if (Array.isArray(data)) music.tracks = data;
    else if (music.tracks === null) music.tracks = [];
  });
}

function drawMusic() {
  const view = musicView();
  if (view.tab === "recent" && music.tracks === null) loadRecent();
  if (view.tab === "weekly" && music.weeks === null) {
    musicFetch("/lastfm/weeks", (data) => {
      music.weeks = Array.isArray(data) ? data : [];
    });
  }
  if (view.week && music.weeks?.some((w) => weekId(w) === view.week)) {
    if (musicWeekAlbums(music, view.week) === null) {
      musicFetch(`/lastfm/week/${view.week}`, (data) => {
        music.weekAlbums[view.week] = Array.isArray(data?.albums) ? data.albums : false;
      });
    }
  }
  showMusic(formatMusicPage(view, music));
}

// A redraw of the same page (fresh data) keeps the focused link and scroll;
// a new page leaves focus to applyHash.
function showMusic({ text, active, head }) {
  const samePage = musicRenderedHash === location.hash;
  musicRenderedHash = location.hash;
  const activeLink = samePage && viewerEl.contains(document.activeElement) ? document.activeElement : null;
  const activeHref = activeLink?.getAttribute("href");
  const activeIndex = activeLink ? viewerLinks().indexOf(activeLink) : -1;
  const scrollTop = viewerEl.scrollTop;
  viewerEl.innerHTML = linkifyContent(text);
  for (const path of active) {
    viewerEl.querySelector(`a[href="#/${path}"]`)?.setAttribute("aria-current", "page");
  }
  viewerLinks()[head]?.setAttribute("data-body-start", "");
  if (samePage) viewerEl.scrollTop = scrollTop;
  if (activeIndex >= 0) {
    const links = viewerLinks();
    (links.find((link) => link.getAttribute("href") === activeHref) || links[activeIndex])
      ?.focus({ preventScroll: true });
  }
}

function syncMusicPolling(refresh = true) {
  clearInterval(musicPollTimer);
  musicPollTimer = null;

  if (state.selected?.dynamic !== "music" || parseMusicTail(state.tail).tab !== "recent") return;
  if (refresh) loadRecent();
  if (document.hidden) return;
  musicPollTimer = setInterval(loadRecent, MUSIC_REFRESH_MS);
}

function renderFileView(node) {
  rightTitleEl.textContent = node.name.toUpperCase();
  if (node.dynamic === "music") {
    musicRenderedNode = node;
    drawMusic();
    return;
  }
  musicRenderedNode = null;
  musicRenderedHash = null;
  viewerEl.innerHTML = linkifyContent(node.content);
}

function renderDirInfo(dirNode) {
  musicRenderedNode = null;
  musicRenderedHash = null;
  rightTitleEl.textContent = "Info";
  const fileCount = dirNode.children.filter((c) => c.type === "file").length;
  const dirCount = dirNode.children.filter((c) => c.type === "dir").length;
  viewerEl.textContent =
    `SELIM D. - PORTFOLIO\n` +
    `${"-".repeat(40)}\n\n` +
    `Use arrow keys + Enter, or click, to\n` +
    `browse. Start with ME.TXT.\n\n` +
    `${fileCount} file(s), ${dirCount} folder(s) here.`;
}

// Show a single list entry in the right pane, without navigating. Anything
// that isn't a file (a folder, "..", nothing at all) falls back to the info
// for the folder being listed.
function previewNode(node) {
  if (node && node.type === "file") {
    renderFileView(node);
  } else {
    renderDirInfo(state.dirNode);
  }
}

// In list mode the pane always follows the list cursor; an open file wins over
// it, so going back from a file lands on that file rather than the info.
function renderViewer() {
  previewNode(state.selected || state.listing[state.cursor]);
}

function renderParentPane() {
  navigatorEl.classList.toggle("has-parent", state.parentNode !== null);
  if (!state.parentNode) return;

  const activeName = state.dirPath[state.dirPath.length - 1];
  parentTitleEl.textContent = dosPath(state.dirPath.slice(0, -1));
  parentListEl.innerHTML = "";
  sortChildren(state.parentNode.children).forEach((node) => {
    const li = document.createElement("li");
    li.className = node.type === "file" ? "file" : "dir";
    if (node.name === activeName) li.classList.add("selected");
    li.innerHTML = `<span class="name">${node.name}</span><span class="size">${sizeLabel(node)}</span>`;
    li.addEventListener("click", () => {
      pendingReveal = true;
      navigate([...state.dirPath.slice(0, -1), node.name]);
    });
    parentListEl.appendChild(li);
  });
}

function render() {
  leftTitleEl.textContent = dosPath(state.dirPath);
  statusBarEl.textContent = dosPath(
    state.selected ? [...state.dirPath, state.selected.name, ...state.tail] : state.dirPath,
  );
  renderParentPane();
  renderList();
  renderViewer();
}

function navigate(segments) {
  const target = "/" + segments.map(encodeURIComponent).join("/");
  // Setting location.hash to its current value doesn't fire "hashchange" —
  // re-run the render/focus logic directly so re-opening the same file works.
  if (location.hash === "#" + target) {
    applyHash();
  } else {
    location.hash = target;
  }
}

function openAt(index, { focusViewer = false } = {}) {
  const node = state.listing[index];
  if (!node) return;
  if (focusViewer) pendingViewerFocus = true;
  if (node.type === "up") {
    pendingCursorName = state.dirPath[state.dirPath.length - 1];
    navigate(state.dirPath.slice(0, -1));
  } else {
    navigate([...state.dirPath, node.name]);
  }
}

function onKeyDown(e) {
  if (!settingsOverlayEl.hidden || photoPreviewEl.open) return;

  if (e.key === "1") {
    openSettings();
    e.preventDefault();
    return;
  }

  // "[" and "]" step to the previous and next year on any weekly page.
  if ((e.key === "[" || e.key === "]") && state.selected?.dynamic === "music") {
    const dir = e.key === "[" ? -1 : 1;
    const path = musicYearStep(parseMusicTail(state.tail), music.weeks, dir);
    if (path) navigate(path.split("/"));
    e.preventDefault();
    return;
  }

  if (state.mode === "viewer") {
    switch (e.key) {
      case "ArrowDown":
      case "j":
        focusLink(state.linkIndex + 1);
        e.preventDefault();
        break;
      case "ArrowUp":
      case "k":
        focusLink(state.linkIndex - 1);
        e.preventDefault();
        break;
      case "ArrowRight":
      case "Enter":
      case "l":
        viewerLinks()[state.linkIndex]?.click();
        e.preventDefault();
        break;
      case "Backspace":
      case "h":
      case "ArrowLeft":
        leaveViewerMode();
        if (state.selected) {
          pendingCursorName = state.selected.name;
          navigate(state.dirPath);
        }
        e.preventDefault();
        break;
      case "Escape":
        leaveViewerMode();
        e.preventDefault();
        break;
    }
    return;
  }

  switch (e.key) {
    case "ArrowDown":
    case "j":
      state.cursor = Math.min(state.cursor + 1, state.listing.length - 1);
      renderList();
      previewNode(state.listing[state.cursor]);
      e.preventDefault();
      break;
    case "ArrowUp":
    case "k":
      state.cursor = Math.max(state.cursor - 1, 0);
      renderList();
      previewNode(state.listing[state.cursor]);
      e.preventDefault();
      break;
    case "ArrowRight":
    case "Enter":
    case "l":
      openAt(state.cursor, { focusViewer: true });
      e.preventDefault();
      break;
    case "Backspace":
    case "h":
    case "ArrowLeft":
      if (state.selected) {
        pendingCursorName = state.selected.name;
        navigate(state.dirPath);
      } else if (state.dirPath.length > 0) {
        pendingCursorName = state.dirPath[state.dirPath.length - 1];
        navigate(state.dirPath.slice(0, -1));
      }
      e.preventDefault();
      break;
  }
}

// On small screens the viewer sits below the file list and the page scrolls.
// After a click, scroll the pane that now matters (the viewer for a file, the
// list for a folder) into view when its top is off-screen or near the bottom.
// Side by side, both panes start at the top of the screen, so this never scrolls.
function revealPane() {
  const el = state.selected ? paneRightEl : navigatorEl;
  const top = el.getBoundingClientRect().top;
  if (top < 0 || top > window.innerHeight / 2) el.scrollIntoView({ block: "start" });
}

function afterRender() {
  if (pendingReveal) {
    pendingReveal = false;
    revealPane();
  }
  if (!pendingViewerFocus) return;
  pendingViewerFocus = false;
  if (state.selected && viewerLinks().length > 0) {
    setMode("viewer");
    focusLink(0);
  }
}

function applyHash() {
  const prevSelected = state.selected;
  const focusText = state.mode === "viewer" ? viewerLinks()[state.linkIndex]?.textContent : null;
  resolveFromHash();
  if (!state.selected && pendingCursorName) {
    const idx = state.listing.findIndex((n) => n.name === pendingCursorName);
    if (idx >= 0) state.cursor = idx;
  }
  pendingCursorName = null;
  setMode("list");
  render();
  syncMusicPolling();
  // A link to another page of the same file (music.txt's tabs, years and
  // weeks) keeps the keyboard in the viewer, on the link with the same text
  // (so "next >" can be pressed again), else on the first link of the page
  // body, past the tab and year rows.
  if (focusText != null && state.selected && state.selected === prevSelected) {
    const links = viewerLinks();
    if (links.length > 0) {
      const same = links.findIndex((link) => link.textContent === focusText);
      const body = links.findIndex((link) => link.hasAttribute("data-body-start"));
      setMode("viewer");
      focusLink(same >= 0 ? same : Math.max(body, 0));
    }
  }
  afterRender();
}

const settingsOverlayEl = document.getElementById("settings-overlay");
const settingsOptionsEl = document.getElementById("settings-options");
const fkeySettingsEl = document.getElementById("fkey-settings");
const paneTitleSettingsBtnEl = document.getElementById("pane-title-settings-btn");
const settingsItems = [...settingsOptionsEl.querySelectorAll("li")];

let settingsCursor = 0;

function currentTheme() {
  return document.documentElement.dataset.theme || "default";
}

function applyTheme(theme) {
  if (theme && theme !== "default") {
    document.documentElement.dataset.theme = theme;
  } else {
    delete document.documentElement.dataset.theme;
  }
}

function renderSettings() {
  settingsItems.forEach((li, i) => {
    li.classList.toggle("current", li.dataset.theme === currentTheme());
    li.classList.toggle("selected", i === settingsCursor);
  });
}

function saveTheme(theme) {
  localStorage.setItem("theme", theme);
  applyTheme(theme);
}

function selectTheme(theme) {
  saveTheme(theme);
  closeSettings();
}

function openSettings() {
  settingsCursor = Math.max(
    settingsItems.findIndex((li) => li.dataset.theme === currentTheme()),
    0,
  );
  renderSettings();
  settingsOverlayEl.hidden = false;
}

function closeSettings() {
  settingsOverlayEl.hidden = true;
}

fkeySettingsEl.addEventListener("click", openSettings);
paneTitleSettingsBtnEl.addEventListener("click", openSettings);

settingsItems.forEach((li, i) => {
  li.addEventListener("click", () => {
    settingsCursor = i;
    selectTheme(li.dataset.theme);
  });
});

settingsOverlayEl.addEventListener("click", (e) => {
  if (e.target === settingsOverlayEl) closeSettings();
});

document.getElementById("sp-select").addEventListener("click", () => {
  selectTheme(settingsItems[settingsCursor].dataset.theme);
});

document.getElementById("sp-cancel").addEventListener("click", closeSettings);

function onSettingsKeyDown(e) {
  switch (e.key) {
    case "ArrowDown":
    case "j":
      settingsCursor = Math.min(settingsCursor + 1, settingsItems.length - 1);
      renderSettings();
      e.preventDefault();
      break;
    case "ArrowUp":
    case "k":
      settingsCursor = Math.max(settingsCursor - 1, 0);
      renderSettings();
      e.preventDefault();
      break;
    case "ArrowRight":
    case "Enter":
    case "l":
      selectTheme(settingsItems[settingsCursor].dataset.theme);
      e.preventDefault();
      break;
    case " ":
      saveTheme(settingsItems[settingsCursor].dataset.theme);
      renderSettings();
      e.preventDefault();
      break;
    case "Escape":
      closeSettings();
      e.preventDefault();
      break;
  }
}

document.addEventListener("keydown", (e) => {
  if (!settingsOverlayEl.hidden) {
    e.stopImmediatePropagation();
    onSettingsKeyDown(e);
  }
});

window.addEventListener("hashchange", applyHash);

document.addEventListener("visibilitychange", () => {
  syncMusicPolling(!document.hidden);
});

// "error" does not bubble, so listen in the capture phase.
viewerEl.addEventListener(
  "error",
  (e) => {
    if (e.target.matches?.("img.viewer-image")) {
      e.target.closest("a.viewer-photo").replaceWith(`[${e.target.alt}]`);
    }
  },
  true,
);

// The preview is a modal <dialog>: the browser's top layer puts it above the
// body.crt scanline overlay, and it handles Escape and returns focus itself.
const photoPreviewEl = document.getElementById("photo-preview");
const photoPreviewImgEl = photoPreviewEl.querySelector("img");

photoPreviewEl.addEventListener("click", (e) => {
  if (e.target !== photoPreviewImgEl) photoPreviewEl.close();
});

viewerEl.addEventListener("click", (e) => {
  const photo = e.target.closest("a.viewer-photo");
  if (photo) {
    e.preventDefault();
    // Focus returns to the photo on close, so make the keyboard agree with it.
    setMode("viewer");
    state.linkIndex = viewerLinks().indexOf(photo);
    const img = photo.querySelector("img");
    photoPreviewImgEl.src = img.src;
    photoPreviewImgEl.alt = img.alt;
    photoPreviewEl.showModal();
    return;
  }
  const link = e.target.closest("a.viewer-link");
  if (link && link.getAttribute("href").startsWith("#")) pendingReveal = true;
});

window.addEventListener("DOMContentLoaded", () => {
  applyHash();
  document.addEventListener("keydown", onKeyDown);
});
