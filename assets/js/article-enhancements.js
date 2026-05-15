(function () {
  function initShareButtons() {
    document.querySelectorAll("[data-share-copy]").forEach((button) => {
      button.addEventListener("click", async () => {
        const url = button.getAttribute("data-share-copy") || location.href;
        const label = button.querySelector(".article-share-label");
        const original = label ? label.textContent : "";

        try {
          if (navigator.clipboard) {
            await navigator.clipboard.writeText(url);
          } else {
            prompt("Copy this link", url);
          }

          button.classList.remove("is-copied");
          void button.offsetWidth;
          button.classList.add("is-copied");
          if (label) label.textContent = "Copied";
          window.setTimeout(() => {
            button.classList.remove("is-copied");
            if (label) label.textContent = original;
          }, 1800);
        } catch (error) {
          if (error && error.name === "AbortError") return;
          button.classList.add("is-error");
          if (label) label.textContent = "Copy failed";
          window.setTimeout(() => {
            button.classList.remove("is-error");
            if (label) label.textContent = original;
          }, 1800);
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
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      initShareButtons();
      initTocSpy();
    });
  } else {
    initShareButtons();
    initTocSpy();
  }
})();
