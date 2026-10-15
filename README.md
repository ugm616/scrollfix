<p align="center">
  <img src="icons/scrollfix.svg" width="96" height="96" alt="ScrollFix logo" />
</p>

<h1 align="center">ScrollFix</h1>

ScrollFix is a lightweight browser extension for **Microsoft Edge** and **Google Chrome** that restores horizontal scrolling on pages where a website blocks it.

It is especially useful for wide tables, dashboards, spreadsheets, and other content that extends beyond the visible area but cannot be scrolled horizontally because the site forces `overflow-x: hidden` or similar CSS.

---

## Features

- **Site-based activation** — choose exactly which websites the fix should run on.
- **Allow All mode** — run the fix everywhere except on sites you exclude.
- **Horizontal scrollbar restoration** — attempts to re-enable horizontal scrolling on blocked elements.
- **Scrollbar styling** — uses browser-supported styling to better match the page.
- **Chrome and Edge support** — install as an unpacked extension with no app store required.

---

## How it works

ScrollFix scans the page for elements that:

- contain content wider than their visible area, and
- have horizontal scrolling blocked or visually hidden.

When it finds a likely match, it updates the element to allow horizontal scrolling again by applying:

```css
overflow-x: auto;
```

The extension also tries to apply compatible scrollbar colors so the scrollbar blends into the page more naturally.

---

## Installation

### Chrome

1. Download or clone this repository.
2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Select the `scrollfix` folder.

### Microsoft Edge

1. Download or clone this repository.
2. Open Edge and go to `edge://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Select the `scrollfix` folder.

### Optional: pin the extension

After installation, use the browser’s extensions menu to pin **ScrollFix** to the toolbar for easier access.

---

## How to use

1. Open the ScrollFix popup from the toolbar.
2. Choose one of the following:
   - **Enable on current site** to add the current website to the active list
   - **Allow All** to run ScrollFix everywhere except on excluded sites
3. Reload the page if the scrollbar does not appear immediately.

### Adding websites

You can add websites in two ways:

- **Current site** — automatically adds the site you are viewing.
- **Manual entry** — type a domain such as `example.com` and add it yourself.

### Excluding websites in Allow All mode

When **Allow All** is enabled, the list becomes a **Feature Disabled** list. Add sites there if you want ScrollFix to skip them.

---

## Debug mode

ScrollFix includes an optional debug mode for troubleshooting and tuning detection.

To enable it, open the browser console and run:

```javascript
chrome.storage.sync.set({ debug: true })
```

You can also set a page-level flag for quick testing:

```javascript
localStorage.setItem("scrollfix-debug", "1")
```

Then reload the page and open DevTools. Debug output is prefixed with `[ScrollFix]`.

To turn debug mode off:

```javascript
chrome.storage.sync.set({ debug: false })
localStorage.removeItem("scrollfix-debug")
```

---

## Detection notes

- The extension prefers the **actual scroll container** instead of generic wrappers.
- Tables, grids, and similar data layouts are handled before broader overflow containers.
- Elements are only modified when content truly overflows horizontally.
- Common false positives such as sliders, carousels, tickers, and ellipsis-truncated text are skipped.
- Open shadow DOM content is also scanned.

---

## Notes and limitations

- You may need to refresh a page after changing the site list.
- Some websites actively reset styles or use advanced layout techniques that may still prevent scrolling.
- The scrollbar styling uses standard browser support and may look different depending on the browser and operating system.
- This extension is best used on sites where horizontal scrolling is blocked by CSS rather than intentionally disabled by custom JavaScript.

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

## Optional improvements

If you want, this extension could be expanded later to include:

- a keyboard shortcut
- export/import of site lists
- an options page
- packaging instructions for internal distribution

---

## Disclaimer

This extension changes how pages behave locally in your browser. It does not modify the website itself and only affects your own browser session.
