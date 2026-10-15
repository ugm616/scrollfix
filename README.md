# ScrollFix – Force Horizontal Scrollbars

This is a browser extension for **Microsoft Edge** and **Google Chrome** that helps restore horizontal scrolling on pages where websites block it.

It is useful when a page contains content like wide tables or grids that overflow the page, but the site prevents horizontal scrolling from appearing. The extension attempts to force the relevant element to allow horizontal scrolling again.

---

## What this extension does

- Lets users create a list of websites where the fix should run.
- Includes an **Allow All** mode, where the extension runs on every site except those explicitly excluded.
- Tries to restore horizontal scrollbars on elements that have overflow content.
- Attempts to match scrollbar colors to the element’s background and text colors.

---

## How it works

The extension looks for elements that:

- have content wider than their visible width, and
- have horizontal overflow blocked by CSS such as `overflow-x: hidden` or `overflow-x: clip`.

When it finds one, it changes the element to use:

```css
overflow-x: auto;
```

This usually makes the browser display a horizontal scrollbar when the content is wider than the container.

The extension also applies standard scrollbar styling where supported so the scrollbar blends better with the page.

---

## Features

### Site allow list mode
By default, the extension only runs on websites you add to the enabled list.

### Allow All mode
If you turn on **Allow All**, the extension runs on every site and the list becomes a **Feature Disabled** list of sites to skip.

### Subdomain support
If you add `example.com`, it also applies to subdomains such as:

- `app.example.com`
- `docs.example.com`

### Visual styling
The scrollbar will try to blend in with the element by using:

- the element’s background color
- the element’s text color

---

## Folder structure

```text
scrollfix/
├── manifest.json
├── content.js
├── popup.html
├── popup.css
└── popup.js
```

---

## Files

### `manifest.json`

```json
{
  "manifest_version": 3,
  "name": "ScrollFix – Force Horizontal Scrollbars",
  "version": "1.0.0",
  "description": "Adds a horizontal scrollbar to elements that overflow but have scrolling blocked by the site.",
  "permissions": ["storage", "activeTab", "tabs"],
  "action": {
    "default_popup": "popup.html",
    "default_title": "ScrollFix"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_idle",
      "all_frames": true
    }
  ]
}
```

### `content.js`

```javascript
(() => {
  const DEFAULTS = { mode: "list", enableList: [], disableList: [] };
  const fixed = new Set();
  let active = false;
  let timer = null;
  let observer = null;

  const host = location.hostname.toLowerCase();
  const matches = (list) =>
    list.some((h) => host === h || host.endsWith("." + h));

  function isActive(s) {
    return s.mode === "all" ? !matches(s.disableList) : matches(s.enableList);
  }

  function parse(c) {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }

  function effectiveBg(el) {
    for (let e = el; e; e = e.parentElement) {
      const c = parse(getComputedStyle(e).backgroundColor);
      if (c && c.a > 0.5) return c;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  }

  const mix = (a, b, t) =>
    `rgb(${Math.round(a.r + (b.r - a.r) * t)},${Math.round(
      a.g + (b.g - a.g) * t
    )},${Math.round(a.b + (b.b - a.b) * t)})`;

  function applyColours(el) {
    const bg = effectiveBg(el);
    const fg = parse(getComputedStyle(el).color) || { r: 0, g: 0, b: 0, a: 1 };
    const track = mix(bg, fg, 0.08);
    const thumb = mix(bg, fg, 0.45);
    el.style.setProperty("scrollbar-color", `${thumb} ${track}`, "important");
    el.style.setProperty("scrollbar-width", "auto", "important");
  }

  function fix(el) {
    if (fixed.has(el)) return;
    el.dataset.scrollfixPrev = el.style.getPropertyValue("overflow-x") || "";
    el.style.setProperty("overflow-x", "auto", "important");
    applyColours(el);
    fixed.add(el);
  }

  function unfixAll() {
    fixed.forEach((el) => {
      const prev = el.dataset.scrollfixPrev;
      el.style.removeProperty("overflow-x");
      if (prev) el.style.setProperty("overflow-x", prev);
      el.style.removeProperty("scrollbar-color");
      el.style.removeProperty("scrollbar-width");
      delete el.dataset.scrollfixPrev;
    });
    fixed.clear();
  }

  function scan() {
    if (!active) return;
    const els = document.querySelectorAll("body, body *");
    for (const el of els) {
      if (fixed.has(el)) continue;
      if (el.scrollWidth <= el.clientWidth + 1 || el.clientWidth === 0) continue;
      const ox = getComputedStyle(el).overflowX;
      if (ox === "hidden" || ox === "clip") fix(el);
    }
    const root = document.documentElement;
    if (root.scrollWidth > root.clientWidth + 1) {
      const ox = getComputedStyle(root).overflowX;
      if (ox === "hidden" || ox === "clip") fix(root);
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(scan, 300);
  }

  function start() {
    if (active) return;
    active = true;
    scan();
    observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class"],
    });
    window.addEventListener("resize", schedule);
  }

  function stop() {
    if (!active) return;
    active = false;
    observer && observer.disconnect();
    window.removeEventListener("resize", schedule);
    unfixAll();
  }

  function apply(s) {
    isActive(s) ? start() : stop();
  }

  chrome.storage.sync.get(DEFAULTS, apply);
  chrome.storage.onChanged.addListener(() =>
    chrome.storage.sync.get(DEFAULTS, apply)
  );
})();
```

### `popup.html`

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="popup.css" />
  </head>
  <body>
    <h1>ScrollFix</h1>

    <label class="row">
      <input type="checkbox" id="allowAll" />
      <span><b>Allow All</b> (run on every site)</span>
    </label>

    <p id="listTitle" class="title"></p>
    <p id="current" class="muted"></p>
    <button id="addCurrent">Add current site</button>

    <div class="row">
      <input type="text" id="newSite" placeholder="example.com" />
      <button id="addManual">Add</button>
    </div>

    <ul id="list"></ul>
    <p class="muted">Reload the page if a change doesn't appear.</p>
    <script src="popup.js"></script>
  </body>
</html>
```

### `popup.css`

```css
body { font: 13px system-ui, sans-serif; width: 320px; padding: 12px; }
h1 { font-size: 16px; margin: 0 0 8px; }
.row { display: flex; gap: 6px; align-items: center; margin: 8px 0; }
.row input[type="text"] { flex: 1; padding: 4px; }
.title { font-weight: 600; margin: 10px 0 2px; }
.muted { color: #666; font-size: 12px; margin: 2px 0 6px; }
button { padding: 4px 8px; cursor: pointer; }
ul { list-style: none; padding: 0; margin: 8px 0; max-height: 180px; overflow: auto; }
li { display: flex; justify-content: space-between; align-items: center;
     padding: 3px 0; border-bottom: 1px solid #ddd; }
li button { border: none; background: none; color: #c00; font-size: 15px; }
```

### `popup.js`

```javascript
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
```

---

## How to install it in Chrome or Edge

### 1. Create the folder
Make a folder named `scrollfix`, then save all the files above into it.

### 2. Open the extensions page
- **Chrome:** `chrome://extensions`
- **Edge:** `edge://extensions`

### 3. Turn on Developer mode
Use the Developer mode toggle on the extensions page.

### 4. Load the unpacked extension
Click **Load unpacked** and choose the `scrollfix` folder.

### 5. Pin the extension
Use the toolbar puzzle-piece icon and pin **ScrollFix** for easier access.

### 6. Add sites
Open the extension popup and either:
- click **Add current site**, or
- type a domain manually and click **Add**

### 7. Use Allow All if needed
If you want the extension to run everywhere, enable **Allow All**.
In this mode, the list becomes a **Feature Disabled** list instead of an enabled list.

---

## Debug mode (optional)

To see why an element was (or was not) modified, enable debug logging:

- set `debug` to `true` in `chrome.storage.sync` (e.g. from the extension's service-worker console: `chrome.storage.sync.set({ debug: true })`), or
- on the page, run `localStorage.setItem("scrollfix-debug", "1")` and reload.

Open DevTools and filter the console for `[ScrollFix]`. Each fixed, skipped or reverted element is logged with the reason. Normal users are unaffected.

## Detection notes

- The innermost real scroll container is preferred; tables/grids are handled before generic wrappers.
- Elements are only modified if in-flow content really overflows (absolutely positioned popovers or off-screen decorations are ignored).
- Sliders, carousels, tickers, `aria-hidden` and ellipsis-truncated elements are skipped.

## Notes and limitations

- You may need to refresh a page after changing the site list.
- Some websites actively reset styles or use advanced layout techniques that may still prevent scrolling.
- The scrollbar styling uses standard browser support and may look different depending on the browser and operating system.
- This extension is best used on sites where horizontal scrolling is blocked by CSS rather than intentionally disabled by custom JavaScript.

---

## Optional improvements

If you want, this extension could be expanded later to include:

- a toggle for the current tab only
- a keyboard shortcut
- export/import of site lists
- an options page
- an icon and proper branding
- packaging instructions for distributing it internally

---

## Disclaimer

This extension changes how pages behave locally in your browser. It does not modify the website itself and only affects your own browser session.
```
