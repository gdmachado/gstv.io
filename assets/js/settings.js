(function () {
  const PREFS = [
    {
      key: "pref-sans",
      attr: "sans",
      defaultValue: "cabinet",
      label: "sans",
      options: [
        { value: "cabinet",  name: "Cabinet Grotesk" },
        { value: "atkinson", name: "Atkinson Hyperlegible" },
      ],
    },
    {
      key: "pref-mono",
      attr: "mono",
      defaultValue: "geist",
      label: "monospace",
      options: [
        { value: "geist",     name: "Geist Mono" },
        { value: "jetbrains", name: "JetBrains Mono" },
      ],
    },
    {
      key: "pref-syntax",
      attr: "syntax",
      defaultValue: "default",
      label: "syntax (a11y)",
      options: [
        { value: "default", name: "default" },
        { value: "cb",      name: "colorblind-safe" },
      ],
    },
  ];

  function applyPref(pref, value) {
    document.documentElement.dataset[pref.attr] = value;
    localStorage.setItem(pref.key, value);
  }

  function buildPopover(currentValues) {
    const el = document.createElement("div");
    el.className = "settings-popover";
    el.hidden = true;
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", "Site preferences");

    const header = document.createElement("div");
    header.className = "settings-popover-header";
    const headerTitle = document.createElement("strong");
    headerTitle.textContent = "~/.preferences";
    const headerExt = document.createElement("span");
    headerExt.textContent = "toml";
    header.append(headerTitle, headerExt);

    const body = document.createElement("div");
    body.className = "settings-popover-body";

    /* TOML-style comment with build provenance at the top of the body */
    const site = window.__SITE__ || {};
    if (site.hugo || site.builtAt) {
      const buildLine = document.createElement("div");
      buildLine.className = "settings-popover-buildinfo";
      const parts = [];
      if (site.hugo) parts.push(`hugo v${site.hugo}`);
      if (site.builtAt) parts.push(site.builtAt);
      buildLine.textContent = `# built with ${parts.join(" @ ")}`;
      body.appendChild(buildLine);
    }

    PREFS.forEach((pref, i) => {
      const section = document.createElement("div");
      section.className = "settings-popover-section";
      section.textContent = pref.label;
      body.appendChild(section);

      pref.options.forEach((opt) => {
        const label = document.createElement("label");
        const input = document.createElement("input");
        input.type = "radio";
        input.name = pref.attr;
        input.value = opt.value;
        if (currentValues[pref.attr] === opt.value) input.checked = true;
        const span = document.createElement("span");
        span.textContent = opt.name;
        if (pref.attr === "sans") {
          span.style.fontFamily = `var(--font-body-${opt.value})`;
        } else if (pref.attr === "mono") {
          span.style.fontFamily = `var(--font-mono-${opt.value})`;
        }
        label.append(input, span);
        body.appendChild(label);
      });

      if (i < PREFS.length - 1) {
        const spacer = document.createElement("div");
        spacer.className = "settings-popover-spacer";
        body.appendChild(spacer);
      }
    });

    /* Stats row: site totals as a TOML-comment-flavored line */
    const stats = document.createElement("div");
    stats.className = "settings-popover-stats";
    const counts = [];
    if (typeof site.posts === "number") counts.push(`${site.posts} post${site.posts === 1 ? "" : "s"}`);
    if (typeof site.photos === "number") counts.push(`${site.photos} photo${site.photos === 1 ? "" : "s"}`);
    if (counts.length) stats.textContent = `# ${counts.join(", ")}`;
    body.appendChild(stats);

    /* Footer: esc hint + reset link. Reset clears all pref keys and reloads. */
    const footer = document.createElement("div");
    footer.className = "settings-popover-footer";
    const kbd = document.createElement("kbd");
    kbd.textContent = "esc";
    const escSpan = document.createElement("span");
    escSpan.append(kbd, document.createTextNode(" to close"));
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "settings-popover-reset";
    reset.textContent = "reset";
    reset.title = "Clear all preferences and reload";
    reset.addEventListener("click", () => {
      PREFS.forEach((p) => localStorage.removeItem(p.key));
      location.reload();
    });
    footer.append(escSpan, reset);

    el.append(header, body, footer);
    return el;
  }

  function init() {
    const switches = document.querySelector(".logo-switches");
    if (!switches) return;

    const currentValues = {};
    PREFS.forEach((p) => {
      const v = localStorage.getItem(p.key) || p.defaultValue;
      currentValues[p.attr] = v;
      document.documentElement.dataset[p.attr] = v;
    });

    const button = document.createElement("button");
    button.className = "settings-toggle";
    button.type = "button";
    button.setAttribute("aria-label", "Open preferences");
    button.setAttribute("aria-expanded", "false");
    button.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

    switches.appendChild(button);

    const popover = buildPopover(currentValues);
    document.body.appendChild(popover);

    function position() {
      const rect = button.getBoundingClientRect();
      popover.style.top = `${Math.round(rect.bottom + 8)}px`;
      popover.style.right = `${Math.round(window.innerWidth - rect.right)}px`;
    }

    function open() {
      position();
      popover.hidden = false;
      button.setAttribute("aria-expanded", "true");
      window.addEventListener("resize", position);
      window.addEventListener("scroll", position, { passive: true });
    }

    function close() {
      popover.hidden = true;
      button.setAttribute("aria-expanded", "false");
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position);
    }

    PREFS.forEach((pref) => {
      popover.querySelectorAll(`input[name="${pref.attr}"]`).forEach((input) => {
        input.addEventListener("change", (e) => applyPref(pref, e.target.value));
      });
    });

    let consoleGreeted = false;
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      if (popover.hidden) {
        if (!consoleGreeted) {
          console.log(
            "%c~/.preferences",
            "color:#a6e3a1;font-family:monospace;",
            "say hi at hello@gstv.io"
          );
          consoleGreeted = true;
        }
        open();
      }
      else close();
    });

    document.addEventListener("click", (e) => {
      if (!popover.hidden && !popover.contains(e.target) && e.target !== button && !button.contains(e.target)) {
        close();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !popover.hidden) {
        close();
        button.focus();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
