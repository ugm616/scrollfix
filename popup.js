const DEFAULTS = { mode: "list", enableList: [], disableList: [] };
let state = { ...DEFAULTS };
let currentHost = "";

const $ = (id) => document.getElementById(id);
const listKey = () => (state.mode === "all" ? "disableList" : "enableList");

function clean(h) {
  return h.trim().toLowerCase()
    .replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
}

function save() {
  chrome.storage.sync.set(state, render);
}

function render() {
  $("allowAll").checked = state.mode === "all";
  $("listTitle").textContent =
    state.mode === "all" ? "Feature Disabled list (sites to skip)"
                         : "Enabled list (sites to fix)";
  $("addCurrent").textContent =
    state.mode === "all" ? "Disable on current site" : "Enable on current site";
  $("current").textContent = currentHost ? `Current site: ${currentHost}` : "";
  const ul = $("list");
  ul.innerHTML = "";
  state[listKey()].forEach((site) => {
    const li = document.createElement("li");
    li.textContent = site;
    const b = document.createElement("button");
    b.textContent = "×";
    b.title = "Remove";
    b.onclick = () => {
      state[listKey()] = state[listKey()].filter((s) => s !== site);
      save();
    };
    li.appendChild(b);
    ul.appendChild(li);
  });
}

function add(site) {
  site = clean(site);
  if (!site || state[listKey()].includes(site)) return;
  state[listKey()].push(site);
  save();
}

$("allowAll").onchange = (e) => {
  state.mode = e.target.checked ? "all" : "list";
  save();
};
$("addCurrent").onclick = () => add(currentHost);
$("addManual").onclick = () => { add($("newSite").value); $("newSite").value = ""; };

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  try { currentHost = new URL(tabs[0].url).hostname.replace(/^www\./, ""); }
  catch { currentHost = ""; }
  chrome.storage.sync.get(DEFAULTS, (s) => { state = s; render(); });
});
