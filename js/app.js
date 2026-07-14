const fileListEl = document.getElementById("file-list");
const leftTitleEl = document.getElementById("left-title");
const rightTitleEl = document.getElementById("right-title");
const viewerEl = document.getElementById("viewer-content");
const statusBarEl = document.getElementById("status-bar");

const state = {
  dirNode: FS,
  dirPath: [],
  selected: null,
  listing: [],
  cursor: 0,
  mode: "list", // "list" | "viewer"
  linkIndex: 0,
};

let pendingViewerFocus = false;

function setMode(mode) {
  state.mode = mode;
  document.body.classList.toggle("viewer-mode", mode === "viewer");
}

function resolveFromHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  const segments = raw ? raw.split("/").map(decodeURIComponent) : [];

  let node = FS;
  const dirPath = [];
  let selected = null;

  for (const seg of segments) {
    const child = (node.children || []).find((c) => c.name === seg);
    if (!child) break;
    if (child.type === "dir") {
      node = child;
      dirPath.push(seg);
    } else {
      selected = child;
      break;
    }
  }

  const children = [...(node.children || [])].sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const listing = [];
  if (dirPath.length > 0) listing.push({ type: "up", name: ".." });
  listing.push(...children);

  state.dirNode = node;
  state.dirPath = dirPath;
  state.selected = selected;
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
      openAt(i);
    });
    li.addEventListener("mouseenter", () => previewNode(node));
    li.addEventListener("mouseleave", () => {
      renderViewer();
      if (state.mode === "viewer") focusLink(state.linkIndex);
    });
    fileListEl.appendChild(li);
  });
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Content supports [label](path) links, e.g. [projects](projects) — path is
// always relative to the filesystem root, not the current file's folder.
function linkifyContent(raw) {
  return escapeHtml(raw).replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, path) => {
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

function renderFileView(node) {
  rightTitleEl.textContent = node.name.toUpperCase();
  viewerEl.innerHTML = linkifyContent(node.content);
}

function renderDirInfo(dirNode) {
  rightTitleEl.textContent = "Info";
  const fileCount = dirNode.children.filter((c) => c.type === "file").length;
  const dirCount = dirNode.children.filter((c) => c.type === "dir").length;
  viewerEl.textContent =
    `SELIM D. — PORTFOLIO\n` +
    `${"-".repeat(40)}\n\n` +
    `Use arrow keys + Enter, or click, to\n` +
    `browse. Start with ABOUT.TXT.\n\n` +
    `${fileCount} file(s), ${dirCount} folder(s) here.`;
}

function renderViewer() {
  if (state.selected) {
    renderFileView(state.selected);
  } else {
    renderDirInfo(state.dirNode);
  }
}

// Preview whatever the list cursor is currently on, without navigating.
function previewNode(node) {
  if (node && node.type === "file") {
    renderFileView(node);
  } else {
    renderViewer();
  }
}

function render() {
  leftTitleEl.textContent = dosPath(state.dirPath);
  statusBarEl.textContent =
    dosPath(state.dirPath) + (state.selected ? "\\" + state.selected.name.toUpperCase() : "");
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
    navigate(state.dirPath.slice(0, -1));
  } else {
    navigate([...state.dirPath, node.name]);
  }
}

function onKeyDown(e) {
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
      case "Enter":
      case "l":
        viewerLinks()[state.linkIndex]?.click();
        e.preventDefault();
        break;
      case "Backspace":
      case "h":
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
    case "Enter":
    case "l":
      openAt(state.cursor, { focusViewer: true });
      e.preventDefault();
      break;
    case "Backspace":
    case "h":
      if (state.selected) {
        navigate(state.dirPath);
      } else if (state.dirPath.length > 0) {
        navigate(state.dirPath.slice(0, -1));
      }
      e.preventDefault();
      break;
  }
}

function afterRender() {
  if (!pendingViewerFocus) return;
  pendingViewerFocus = false;
  if (state.selected && viewerLinks().length > 0) {
    setMode("viewer");
    focusLink(0);
  }
}

function applyHash() {
  resolveFromHash();
  setMode("list");
  render();
  afterRender();
}

window.addEventListener("hashchange", applyHash);

window.addEventListener("DOMContentLoaded", () => {
  applyHash();
  document.addEventListener("keydown", onKeyDown);
});
