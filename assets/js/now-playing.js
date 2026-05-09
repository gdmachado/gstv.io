(function () {
  const cfg = window.__LASTFM__;
  if (!cfg || !cfg.apiKey || !cfg.user) return;

  const root = document.querySelector(".np-window");
  if (!root) return;

  const elTrack = root.querySelector(".np-track");
  const elMeta = root.querySelector(".np-meta");
  const elClose = root.querySelector(".tl-close");
  const elMin = root.querySelector(".tl-min");
  const REFRESH_MS = 30_000;

  console.log("%c~ now-playing", "color:#a6e3a1;font-family:monospace;", "fetching", cfg.user, "via Last.fm. Hi 👋");

  function relTime(unixSecs) {
    const diff = Math.floor(Date.now() / 1000) - unixSecs;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  function setState(state) {
    root.dataset.state = state;
  }

  function render(track) {
    if (!track) {
      setState("idle");
      elTrack.textContent = "no recent scrobbles";
      elMeta.textContent = "";
      return;
    }
    const playing = track["@attr"] && track["@attr"].nowplaying === "true";
    const title = track.name || "(untitled)";
    const artist = (track.artist && (track.artist["#text"] || track.artist.name)) || "(unknown)";
    const album = track.album && track.album["#text"];
    const ts = track.date && track.date.uts && Number(track.date.uts);

    setState(playing ? "playing" : "recent");

    const parts = [artist];
    if (album) parts.push(album);
    if (!playing && ts) parts.push(relTime(ts));
    else if (playing) parts.push("now");

    if (elTrack.textContent !== title || elMeta.textContent !== parts.join(" · ")) {
      root.classList.add("np-changing");
      requestAnimationFrame(() => {
        elTrack.textContent = title;
        elMeta.textContent = parts.join(" · ");
        requestAnimationFrame(() => root.classList.remove("np-changing"));
      });
    }
  }

  async function fetchOnce() {
    try {
      const url = `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${encodeURIComponent(cfg.user)}&api_key=${encodeURIComponent(cfg.apiKey)}&format=json&limit=1`;
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const track = data && data.recenttracks && data.recenttracks.track && data.recenttracks.track[0];
      render(track);
    } catch (e) {
      setState("error");
      elTrack.textContent = "couldn't reach last.fm";
      elMeta.textContent = "";
      console.warn("[now-playing]", e);
    }
  }

  // Easter eggs on traffic lights: non-destructive, just for fun.
  if (elClose) {
    elClose.addEventListener("click", (e) => {
      e.preventDefault();
      root.classList.add("np-dismissed");
      setTimeout(() => root.classList.remove("np-dismissed"), 1800);
    });
  }
  if (elMin) {
    elMin.style.cursor = "pointer";
    elMin.addEventListener("click", () => root.classList.toggle("np-collapsed"));
  }

  fetchOnce();
  setInterval(fetchOnce, REFRESH_MS);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) fetchOnce();
  });
})();
