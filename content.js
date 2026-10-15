(() => {
  const DEFAULTS = { mode: "list", enableList: [], disableList: [] };

  // ---------- tuning ----------
  const MIN_OVERFLOW = 4;   // px of hidden content before we bother
  const MIN_WIDTH = 60;     // ignore tiny elements
  const MIN_HEIGHT = 16;
  const SCAN_DELAY = 300;   // ms, throttle between scans

  // Elements we never touch (form controls, media, non-rendered nodes).
  const SKIP_TAGS = new Set([
    "HEAD", "SCRIPT", "STYLE", "NOSCRIPT", "INPUT", "TEXTAREA", "SELECT",
    "OPTION", "BUTTON", "IFRAME", "OBJECT", "EMBED", "VIDEO", "AUDIO",
    "CANVAS", "IMG",
  ]);
  // `overflow` does not apply to these display types.
  const NO_OVERFLOW_DISPLAY =
    /^(inline-table|table|table-(row|column)(-group)?|table-(header|footer)-group)$/;

  const saved = new Map();      // element -> original inline values
  const rejected = new WeakSet(); // elements we tried and reverted
  let active = false;
  let timer = null;
  let observer = null;

  const host = location.hostname.toLowerCase();
  const matches = (list) =>
    list.some((h) => host === h || host.endsWith("." + h));

  function isActive(s) {
    return s.mode === "all" ? !matches(s.disableList) : matches(s.enableList);
  }

  // ---------- colour helpers ----------
  function parse(c) {
    const m = c && c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[,\s/]+/).filter(Boolean);
    const n = p.map((v) => (v.endsWith("%") ? parseFloat(v) / 100 : Number(v)));
    if (n.length < 3 || n.some(Number.isNaN)) return null;
    return { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1 };
  }

  const parentOf = (e) =>
    e.parentElement ||
    (e.getRootNode && e.getRootNode().host) ||
    null;

  function effectiveBg(el) {
    const chain = [];
    for (let e = el; e; e = parentOf(e)) chain.push(e);
    if (el === document.documentElement && document.body) {
      chain.unshift(document.body);
    }
    for (const e of chain) {
      const c = parse(getComputedStyle(e).backgroundColor);
      if (c && c.a > 0.5) return c;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  }

  const mix = (a, b, t) =>
    `rgb(${Math.round(a.r + (b.r - a.r) * t)},${Math.round(
      a.g + (b.g - a.g) * t
    )},${Math.round(a.b + (b.b - a.b) * t)})`;

  function parseSize(value) {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
  }

  function isDataLayout(el, cs) {
    const role = (el.getAttribute && el.getAttribute("role")) || "";
    const cls = `${el.className || ""}`.toLowerCase();
    const tag = el.tagName;

    if (tag === "TABLE" || tag === "THEAD" || tag === "TBODY" || tag === "TFOOT" || tag === "TR" || tag === "TD" || tag === "TH") {
      return true;
    }

    if (role === "table" || role === "grid" || role === "treegrid") return true;

    if (/\b(table|grid|datatable|data-table|data-grid|sheet|spreadsheet|matrix)\b/.test(cls)) {
      return true;
    }

    const display = cs.display;
    if (display.includes("grid") || display.includes("table")) return true;

    return false;
  }

  function isWrapCandidate(el, cs) {
    const o = cs.overflowX;
    if (!(o === "hidden" || o === "clip" || o === "auto" || o === "scroll")) return false;
    if (el.scrollWidth - el.clientWidth < MIN_OVERFLOW) return false;
    if (el.clientWidth < MIN_WIDTH || el.clientHeight < MIN_HEIGHT) return false;
    if (NO_OVERFLOW_DISPLAY.test(cs.display)) return false;
    return true;
  }

  function isInnerScrollable(el, cs) {
    if (!isDataLayout(el, cs)) return false;
    if (el.scrollWidth - el.clientWidth < MIN_OVERFLOW) return false;
    const childCount = el.children ? el.children.length : 0;
    if (childCount > 0 && el.scrollWidth / Math.max(el.clientWidth, 1) < 1.08) return false;
    return true;
  }

  // ---------- apply / restore ----------
  function applyStyles(el) {
    const bg = effectiveBg(el);
    const fg = parse(getComputedStyle(el).color) || { r: 0, g: 0, b: 0, a: 1 };
    const track = mix(bg, fg, 0.08);
    const thumb = mix(bg, fg, 0.45);
    const s = el.style;
    s.setProperty("overflow-x", "auto", "important");
    s.setProperty("scrollbar-color", `${thumb} ${track}`, "important");
    s.setProperty("scrollbar-width", "auto", "important");
  }

  const snap = (s, prop) => [s.getPropertyValue(prop), s.getPropertyPriority(prop)];

  function restoreProp(s, prop, [value, priority]) {
    s.removeProperty(prop);
    if (value) s.setProperty(prop, value, priority);
  }

  function restore(el) {
    const o = saved.get(el);
    if (!o) return;
    restoreProp(el.style, "overflow-x", o.ox);
    restoreProp(el.style, "scrollbar-color", o.sc);
    restoreProp(el.style, "scrollbar-width", o.sw);
    saved.delete(el);
  }

  function unfixAll() {
    for (const el of [...saved.keys()]) restore(el);
  }

  function needsReapply(el) {
    const s = el.style;
    return (
      s.getPropertyValue("overflow-x") !== "auto" ||
      s.getPropertyPriority("overflow-x") !== "important" ||
      !s.getPropertyValue("scrollbar-color")
    );
  }

  // ---------- detection ----------
  function scrollbarHidden(el, cs) {
    if (cs.scrollbarWidth === "none") return true;
    try {
      const p = getComputedStyle(el, "::-webkit-scrollbar");
      return p.display === "none" || p.height === "0px";
    } catch {
      return false;
    }
  }

  function needsFix(el, cs) {
    const ox = cs.overflowX;
    if (ox === "hidden" || ox === "clip") return true;
    if (ox === "auto" || ox === "scroll") return scrollbarHidden(el, cs);
    return false;
  }

  function fix(el, cs, isViewport) {
    const s = el.style;
    const yWasVisible = cs.overflowY === "visible";
    saved.set(el, {
      ox: snap(s, "overflow-x"),
      sc: snap(s, "scrollbar-color"),
      sw: snap(s, "scrollbar-width"),
    });
    applyStyles(el);
    if (!isViewport && yWasVisible && el.scrollHeight - el.clientHeight > 20) {
      restore(el);
      rejected.add(el);
    }
  }

  function consider(el) {
    if (saved.has(el) || rejected.has(el)) return;
    if (SKIP_TAGS.has(el.tagName)) return;
    if (typeof el.scrollWidth !== "number") return;
    if (el.scrollWidth - el.clientWidth < MIN_OVERFLOW) return;
    if (el.clientWidth < MIN_WIDTH || el.clientHeight < MIN_HEIGHT) return;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return;
    if (NO_OVERFLOW_DISPLAY.test(cs.display)) return;
    if (cs.textOverflow && cs.textOverflow.includes("ellipsis")) return;

    // Prefer fixing the innermost data table/grid rather than a generic wrapper.
    if (isDataLayout(el, cs)) {
      if (isInnerScrollable(el, cs) && needsFix(el, cs)) {
        fix(el, cs, false);
      }
      return;
    }

    // Generic overflow containers still get a fix, but only after we have
    // already handled obvious tables/grids.
    if (isWrapCandidate(el, cs) && needsFix(el, cs)) fix(el, cs, false);
  }

  function considerViewport() {
    const html = document.documentElement;
    const body = document.body;
    const se = document.scrollingElement || html;
    if (se.scrollWidth - se.clientWidth < MIN_OVERFLOW) return;
    const src =
      getComputedStyle(html).overflowX === "visible" && body ? body : html;
    if (saved.has(src) || rejected.has(src)) return;
    const cs = getComputedStyle(src);
    if (needsFix(src, cs)) fix(src, cs, true);
  }

  function collect(root, out) {
    for (const el of root.querySelectorAll("*")) {
      out.push(el);
      if (el.shadowRoot) collect(el.shadowRoot, out);
    }
  }

  function scan() {
    if (!active) return;

    for (const el of [...saved.keys()]) {
      if (!el.isConnected) saved.delete(el);
      else if (needsReapply(el)) applyStyles(el);
    }

    considerViewport();

    const els = [];
    if (document.body) {
      els.push(document.body);
      collect(document.body, els);
    }
    for (let i = els.length - 1; i >= 0; i--) consider(els[i]);
  }

  function schedule() {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      scan();
    }, SCAN_DELAY);
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
      attributeFilter: ["style", "class", "hidden", "open", "aria-expanded"],
    });
    window.addEventListener("resize", schedule);
    window.addEventListener("load", schedule);
    document.addEventListener("click", schedule, true);
  }

  function stop() {
    if (!active) return;
    active = false;
    observer && observer.disconnect();
    clearTimeout(timer);
    timer = null;
    window.removeEventListener("resize", schedule);
    window.removeEventListener("load", schedule);
    document.removeEventListener("click", schedule, true);
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
