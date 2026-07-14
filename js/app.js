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
};

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
    fileListEl.appendChild(li);
  });
}

function renderViewer() {
  if (state.selected) {
    rightTitleEl.textContent = state.selected.name.toUpperCase();
    viewerEl.textContent = state.selected.content;
  } else {
    rightTitleEl.textContent = "Info";
    const fileCount = state.dirNode.children.filter((c) => c.type === "file").length;
    const dirCount = state.dirNode.children.filter((c) => c.type === "dir").length;
    viewerEl.textContent =
      `SELIM D. — PORTFOLIO\n` +
      `${"-".repeat(40)}\n\n` +
      `Use arrow keys + Enter, or click, to\n` +
      `browse. Start with ABOUT.TXT.\n\n` +
      `${fileCount} file(s), ${dirCount} folder(s) here.`;
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
  location.hash = "/" + segments.map(encodeURIComponent).join("/");
}

function openAt(index) {
  const node = state.listing[index];
  if (!node) return;
  if (node.type === "up") {
    navigate(state.dirPath.slice(0, -1));
  } else {
    navigate([...state.dirPath, node.name]);
  }
}

function onKeyDown(e) {
  switch (e.key) {
    case "ArrowDown":
    case "j":
      state.cursor = Math.min(state.cursor + 1, state.listing.length - 1);
      renderList();
      e.preventDefault();
      break;
    case "ArrowUp":
    case "k":
      state.cursor = Math.max(state.cursor - 1, 0);
      renderList();
      e.preventDefault();
      break;
    case "Enter":
    case "l":
      openAt(state.cursor);
      e.preventDefault();
      break;
    case "Backspace":
    case "h":
      if (state.dirPath.length > 0) navigate(state.dirPath.slice(0, -1));
      e.preventDefault();
      break;
  }
}

window.addEventListener("hashchange", () => {
  resolveFromHash();
  render();
});

window.addEventListener("DOMContentLoaded", () => {
  resolveFromHash();
  render();
  document.addEventListener("keydown", onKeyDown);
});
