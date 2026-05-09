(function () {
  const isMac = /mac|iphone|ipad|ipod/i.test(navigator.userAgent);
  const shortcutLabel = isMac ? "⌘K" : "Ctrl K";

  let dialog, input, list, empty, indexUrl;
  let fuse = null;
  let loadingPromise = null;
  let activeIndex = -1;
  let lastResults = [];

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === "class") node.className = v;
        else if (k === "text") node.textContent = v;
        else node.setAttribute(k, v);
      }
    }
    for (const c of children) {
      if (c == null) continue;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return node;
  }

  function buildDialog() {
    dialog = el("dialog", { class: "search-palette", "aria-label": "Search the site" });

    const close = el("button", { type: "button", class: "tl tl-close", "aria-label": "Close search" });
    close.addEventListener("click", () => dialog.close());
    const titlebar = el("header", { class: "search-palette-titlebar", "aria-hidden": "true" },
      el("div", { class: "search-palette-traffic" },
        close,
        el("span", { class: "tl tl-min" }),
        el("span", { class: "tl tl-max" })
      ),
      el("div", { class: "search-palette-title", text: "~ search" })
    );

    input = el("input", {
      type: "search", placeholder: "search posts, pages, photos...",
      autocomplete: "off", spellcheck: "false", "aria-label": "Search query",
    });
    const inputRow = el("div", { class: "search-palette-input" },
      el("span", { class: "search-palette-prompt", text: "⌕" }),
      input,
      el("kbd", { text: "esc" })
    );

    empty = el("div", { class: "search-palette-empty" },
      el("p", { class: "search-palette-empty-line", text: "start typing to search" }),
      el("p", { class: "search-palette-empty-hint" },
        el("kbd", { text: "↑" }),
        el("kbd", { text: "↓" }),
        " navigate ",
        el("span", { class: "search-palette-sep", text: "/" }),
        " ",
        el("kbd", { text: "⏎" }),
        " open ",
        el("span", { class: "search-palette-sep", text: "/" }),
        " ",
        el("kbd", { text: "esc" }),
        " close"
      )
    );

    list = el("ul", { class: "search-palette-results", role: "listbox" });

    const body = el("div", { class: "search-palette-body" }, inputRow, empty, list);
    dialog.append(titlebar, body);
    document.body.appendChild(dialog);

    dialog.addEventListener("close", () => {
      input.value = "";
      activeIndex = -1;
      renderResults([]);
    });
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) dialog.close();
    });
    input.addEventListener("input", () => onSearch(input.value));
    input.addEventListener("keydown", onInputKey);
  }

  async function lazyLoadIndex() {
    if (fuse) return fuse;
    if (loadingPromise) return loadingPromise;
    loadingPromise = (async () => {
      const [mod, data] = await Promise.all([
        import("https://cdn.jsdelivr.net/npm/fuse.js@7/dist/fuse.mjs"),
        fetch(indexUrl, { cache: "force-cache" }).then((r) => r.json()),
      ]);
      const Fuse = mod.default;
      fuse = new Fuse(data, {
        keys: [
          { name: "title", weight: 2 },
          { name: "summary", weight: 1 },
          { name: "tags", weight: 0.7 },
          { name: "content", weight: 0.3 },
        ],
        threshold: 0.4,
        ignoreLocation: true,
        minMatchCharLength: 2,
      });
      return fuse;
    })();
    return loadingPromise;
  }

  function onSearch(query) {
    const q = query.trim();
    if (!q) { renderResults([]); return; }
    lazyLoadIndex().then(() => {
      const out = fuse.search(q).slice(0, 8).map((r) => r.item);
      renderResults(out);
    });
  }

  function cleanSummary(s) {
    if (!s) return "";
    /* Strip HTML tags + decode common entities from PaperMod's index.json content */
    const tmp = document.createElement("div");
    tmp.innerHTML = s;
    return (tmp.textContent || "").replace(/\s+/g, " ").trim().slice(0, 140);
  }

  function renderResults(results) {
    lastResults = results;
    activeIndex = results.length ? 0 : -1;
    list.replaceChildren();
    empty.style.display = results.length || input.value.trim() ? "none" : "";
    results.forEach((r, i) => {
      let pathText;
      try { pathText = new URL(r.permalink).pathname; }
      catch (_e) { pathText = r.permalink; }
      const li = el("li",
        {
          class: "search-palette-result" + (i === 0 ? " active" : ""),
          role: "option",
          "data-permalink": r.permalink,
        },
        el("div", { class: "search-palette-result-title", text: r.title }),
        el("div", { class: "search-palette-result-meta", text: cleanSummary(r.summary || r.content) }),
        el("div", { class: "search-palette-result-path", text: pathText })
      );
      li.addEventListener("click", () => navigateTo(r.permalink));
      li.addEventListener("mouseenter", () => setActive(i));
      list.appendChild(li);
    });
  }

  function setActive(i) {
    if (i < 0 || i >= lastResults.length) return;
    activeIndex = i;
    Array.from(list.children).forEach((c, j) => {
      c.classList.toggle("active", j === i);
      if (j === i) c.scrollIntoView({ block: "nearest" });
    });
  }

  function navigateTo(href) {
    dialog.close();
    window.location.href = href;
  }

  function onInputKey(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(Math.min(lastResults.length - 1, activeIndex + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(Math.max(0, activeIndex - 1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      navigateTo(lastResults[activeIndex].permalink);
    }
  }

  function open() {
    if (!dialog.open) {
      dialog.showModal();
      input.focus();
      lazyLoadIndex();
    }
  }

  function decorateNavSearch() {
    const links = document.querySelectorAll('.menu a[href$="/search/"], .menu a[href$="/search"]');
    links.forEach((a) => {
      a.classList.add("nav-search");
      const span = a.querySelector("span") || a;
      span.textContent = "search";
      a.appendChild(el("kbd", { class: "nav-search-kbd", text: shortcutLabel }));
      a.addEventListener("click", (e) => {
        e.preventDefault();
        open();
      });
    });
  }

  function init() {
    const altLink = document.querySelector('link[type="application/json"]');
    indexUrl = altLink ? altLink.href : "/index.json";
    buildDialog();
    decorateNavSearch();
    document.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        open();
      }
      if (e.key === "/" &&
          !e.target.matches("input, textarea, [contenteditable]") &&
          !dialog.open) {
        e.preventDefault();
        open();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
