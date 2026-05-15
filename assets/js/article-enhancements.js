(function () {
  function initShareButtons() {
    document.querySelectorAll("[data-share-copy]").forEach((button) => {
      const label = button.querySelector(".article-share-label");
      const defaultLabel = label ? label.textContent : "";
      let resetToken = 0;

      function scheduleReset() {
        const token = resetToken + 1;
        resetToken = token;

        window.setTimeout(() => {
          if (token !== resetToken) return;
          button.classList.remove("is-copied");
          button.classList.remove("is-error");
          if (label) label.textContent = defaultLabel;
        }, 1800);
      }

      button.addEventListener("click", async () => {
        const url = button.getAttribute("data-share-copy") || location.href;

        try {
          if (navigator.clipboard) {
            await navigator.clipboard.writeText(url);
          } else {
            prompt("Copy this link", url);
          }

          button.classList.remove("is-error");
          button.classList.remove("is-copied");
          void button.offsetWidth;
          button.classList.add("is-copied");
          if (label) label.textContent = "Copied";
          scheduleReset();
        } catch (error) {
          if (error && error.name === "AbortError") return;
          button.classList.remove("is-copied");
          button.classList.add("is-error");
          if (label) label.textContent = "Copy failed";
          scheduleReset();
        }
      });
    });
  }

  function initTocSpy() {
    const toc = document.querySelector(".docs-toc");
    if (!toc) return;

    const links = Array.from(toc.querySelectorAll('a[href^="#"]'));
    const headings = links
      .map((link) => {
        const id = decodeURIComponent(link.hash.slice(1));
        const heading = document.getElementById(id);
        return heading ? { link, heading } : null;
      })
      .filter(Boolean);

    if (!headings.length) return;

    function activate(item) {
      links.forEach((link) => link.classList.toggle("is-active", link === item.link));

      const tocRect = toc.getBoundingClientRect();
      const linkRect = item.link.getBoundingClientRect();
      toc.style.setProperty("--toc-active-y", `${Math.round(linkRect.top - tocRect.top)}px`);
      toc.style.setProperty("--toc-active-h", `${Math.round(linkRect.height)}px`);
    }

    function update() {
      const offset = 120;
      let current = headings[0];

      for (const item of headings) {
        if (item.heading.getBoundingClientRect().top <= offset) current = item;
        else break;
      }

      activate(current);
    }

    links.forEach((link) => {
      link.addEventListener("click", () => {
        const item = headings.find((candidate) => candidate.link === link);
        if (item) activate(item);
      });
    });

    update();
    document.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);

    const disclosure = toc.closest("[data-responsive-toc]");
    if (disclosure) disclosure.addEventListener("toggle", update);
  }

  function initResponsiveToc() {
    const disclosure = document.querySelector("[data-responsive-toc]");
    if (!disclosure) return;

    const narrow = window.matchMedia("(max-width: 1220px)");
    let userToggled = false;

    function sync() {
      if (narrow.matches) {
        if (!userToggled) disclosure.open = false;
      } else {
        disclosure.open = true;
        userToggled = false;
      }
    }

    disclosure.addEventListener("toggle", () => {
      if (narrow.matches) userToggled = true;
    });

    disclosure.querySelectorAll('.docs-toc a[href^="#"]').forEach((link) => {
      link.addEventListener("click", () => {
        if (!narrow.matches) return;
        window.setTimeout(() => {
          disclosure.open = false;
          userToggled = false;
        }, 120);
      });
    });

    if (narrow.addEventListener) narrow.addEventListener("change", sync);
    else narrow.addListener(sync);

    sync();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      initShareButtons();
      initResponsiveToc();
      initTocSpy();
    });
  } else {
    initShareButtons();
    initResponsiveToc();
    initTocSpy();
  }
})();
