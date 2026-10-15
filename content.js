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
