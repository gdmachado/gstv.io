(function () {
  function initPhotoPager() {
    const grid = document.querySelector("[data-photo-grid]");
    const pagination = document.querySelector("[data-photo-pagination]");
    const sentinel = document.querySelector("[data-photo-sentinel]");
    const skeletons = document.querySelector("[data-photo-skeletons]");
    const status = document.querySelector("[data-photo-status]");

    if (!grid || !pagination) return;

    let nextLink = pagination.querySelector("[data-photo-next]");
    if (!nextLink) {
      pagination.classList.add("is-complete");
      return;
    }

    if (!sentinel || !("IntersectionObserver" in window) || !window.fetch || !window.DOMParser) {
      return;
    }

    let loading = false;
    let observer;
    const totalPages = Number(pagination.dataset.photoTotal || "0");
    let currentPage = Number(pagination.dataset.photoCurrent || "1");

    function setLoading(isLoading, options = {}) {
      loading = isLoading;
      pagination.classList.toggle("is-loading", isLoading);
      pagination.setAttribute("aria-busy", isLoading ? "true" : "false");

      if (skeletons) skeletons.hidden = !isLoading;
      if (status && !options.keepStatus) {
        status.textContent = isLoading
          ? "loading next photo batch"
          : `page ${currentPage} / ${totalPages}`;
      }
    }

    function finishArchive() {
      const finishedLink = nextLink;
      nextLink = null;
      pagination.classList.add("is-complete");
      if (skeletons) skeletons.hidden = true;
      finishedLink?.remove();
      if (status) status.textContent = `page ${currentPage} / ${totalPages}`;
      observer?.disconnect();
      sentinel.hidden = true;
    }

    async function loadNextPage() {
      if (loading || !nextLink) return;

      const url = nextLink.href;
      let failed = false;
      setLoading(true);

      try {
        const response = await fetch(url, { credentials: "same-origin" });
        if (!response.ok) throw new Error(`Photo page returned ${response.status}`);

        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, "text/html");
        const cards = Array.from(doc.querySelectorAll("[data-photo-grid] [data-photo-item]"));
        const fragment = document.createDocumentFragment();

        cards.forEach((card) => {
          card.classList.add("is-new");
          card.querySelectorAll("img").forEach((image) => {
            image.loading = "lazy";
            image.decoding = "async";
            image.removeAttribute("fetchpriority");
          });
          fragment.append(card);
        });

        grid.append(fragment);
        grid.dispatchEvent(new CustomEvent("photos:items-added", { detail: { items: cards } }));
        currentPage += 1;
        pagination.dataset.photoCurrent = String(currentPage);

        requestAnimationFrame(() => {
          grid.querySelectorAll("[data-photo-item].is-new").forEach((card) => {
            card.classList.remove("is-new");
          });
        });

        const upcoming = doc.querySelector("[data-photo-next]");
        if (!upcoming) {
          finishArchive();
          return;
        }

        const href = upcoming.getAttribute("href");
        nextLink.href = href ? new URL(href, url).href : upcoming.href;
        nextLink.textContent = upcoming.textContent;
      } catch (error) {
        failed = true;
        pagination.classList.add("has-error");
        if (status) status.textContent = "loading paused";
        document.dispatchEvent(new CustomEvent("photos:load-error", { detail: { url, error } }));
        console.warn("Photo pagination paused", error);
      } finally {
        setLoading(false, { keepStatus: failed });
      }
    }

    pagination.classList.add("is-enhanced");
    observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadNextPage();
    }, { rootMargin: "900px 0px" });
    observer.observe(sentinel);
  }

  function initSalonWall() {
    document.querySelectorAll("[data-photo-grid]").forEach((wall) => {
      if (wall.dataset.salonReady === "true") return;
      wall.dataset.salonReady = "true";

      function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
      }

      function columnCount(width) {
        // Keep these thresholds tuned to the salon wall, not to global CSS breakpoints.
        if (width >= 1180) return 12;
        if (width >= 900) return 10;
        if (width >= 620) return 6;
        return 3;
      }

      function getGap() {
        const styles = getComputedStyle(wall);
        return Number.parseFloat(styles.gap || styles.columnGap || "12") || 12;
      }

      function getItems() {
        return Array.from(wall.querySelectorAll("[data-photo-item]"));
      }

      function spanProfile(item, index, columns) {
        const aspect = Number.parseFloat(item.dataset.aspect || "1");
        const wallSize = (item.dataset.wallSize || "").toLowerCase();
        if (columns <= 3) return { min: columns, max: columns, preferred: columns };

        if (wallSize === "large") {
          if (aspect >= 1.25) {
            const min = columns >= 12 ? 6 : 4;
            const max = Math.min(columns >= 12 ? 9 : 7, columns);
            const preferred = clamp(columns >= 12 ? 8 : 6, min, max);
            return { min, max, preferred };
          }

          const min = aspect <= 0.78 ? 3 : 4;
          const max = Math.min(aspect <= 0.78 ? 5 : 7, columns);
          const preferred = clamp(aspect <= 0.78 ? 4 : 6, min, max);
          return { min, max, preferred };
        }

        if (aspect >= 1.25) {
          const spans = columns >= 12 ? [5, 6, 5, 4, 6, 5] : [5, 4, 5, 3];
          const min = columns >= 12 ? 4 : 3;
          const max = Math.min(columns >= 12 ? 7 : 5, columns);
          const preferred = clamp(spans[index % spans.length], min, max);
          return { min, max, preferred };
        }

        if (aspect <= 0.78) {
          const spans = columns >= 12 ? [3, 3, 2, 3, 2, 4] : [3, 2, 3, 2];
          const min = 2;
          const max = Math.min(4, columns);
          const preferred = clamp(spans[index % spans.length], min, max);
          return { min, max, preferred };
        }

        const spans = columns >= 12 ? [4, 3, 4, 3] : [3, 4, 3];
        const min = 3;
        const max = Math.min(columns >= 12 ? 5 : 4, columns);
        const preferred = clamp(spans[index % spans.length], min, max);
        return { min, max, preferred };
      }

      function orderFor(item, index) {
        const frame = Number.parseInt(item.dataset.frame || "", 10);
        return Number.isFinite(frame) && frame > 0 ? frame - 1 : index;
      }

      function bestSlot(heights, span) {
        let bestColumn = 0;
        let bestY = Number.POSITIVE_INFINITY;

        for (let column = 0; column <= heights.length - span; column += 1) {
          const y = Math.max(...heights.slice(column, column + span));
          if (y < bestY) {
            bestY = y;
            bestColumn = column;
          }
        }

        return { column: bestColumn, y: bestY };
      }

      function candidateSpans(candidate, limit = Number.POSITIVE_INFINITY) {
        const spans = [];
        const max = Math.min(candidate.max, limit);

        for (let span = candidate.min; span <= max; span += 1) {
          spans.push(span);
        }

        return spans;
      }

      function candidateSlots(heights, span) {
        const slots = [];

        for (let column = 0; column <= heights.length - span; column += 1) {
          const y = Math.max(...heights.slice(column, column + span));
          slots.push({ column, y });
        }

        return slots;
      }

      function skylineStats(heights) {
        const maxHeight = Math.max(...heights);
        const mean = heights.reduce((total, height) => total + height, 0) / heights.length;
        const deadArea = heights.reduce((total, height) => total + maxHeight - height, 0);
        const variance = heights.reduce((total, height) => total + Math.abs(height - mean), 0);
        let raggedness = 0;

        for (let index = 1; index < heights.length; index += 1) {
          raggedness += Math.abs(heights[index] - heights[index - 1]);
        }

        return { maxHeight, deadArea, variance, raggedness };
      }

      function chooseCandidate(queue, heights, columns, gap) {
        const currentHeight = Math.max(...heights);
        const lookahead = Math.min(queue.length, columns >= 10 ? 10 : 6);
        let winner = {
          index: 0,
          span: queue[0].preferred,
          slot: bestSlot(heights, queue[0].preferred),
          height: queue[0].heightForSpan(queue[0].preferred),
        };
        let bestScore = Number.POSITIVE_INFINITY;

        for (let index = 0; index < lookahead; index += 1) {
          const candidate = queue[index];
          const rest = queue.slice(0, lookahead).filter((_, candidateIndex) => candidateIndex !== index);
          const restMinSpan = rest.reduce((min, item) => Math.min(min, item.min), Number.POSITIVE_INFINITY);

          candidateSpans(candidate).forEach((span) => {
            candidateSlots(heights, span).forEach((placement) => {
              const height = candidate.heightForSpan(span);
              const nextY = placement.y + height + gap;
              const nextHeights = heights.slice();
              const rightRemainder = columns - (placement.column + span);
              const leavesUnfillableRightGap = rightRemainder > 0 && rightRemainder < restMinSpan;
              // Heuristic weights favor filled rows, gentle skyline changes, and left-to-right endings.
              const edgeGapPenalty = leavesUnfillableRightGap ? 320 + rightRemainder * 180 : 0;
              const edgeBonus = rightRemainder === 0 ? -30 : placement.column === 0 ? -15 : 0;
              const valleyReward = Math.min(220, Math.max(0, currentHeight - placement.y) * 0.1) * -1;
              const expansionPenalty = Math.abs(span - candidate.preferred) * 12;
              const orderPenalty = index * 18;

              for (let offset = 0; offset < span; offset += 1) {
                nextHeights[placement.column + offset] = nextY;
              }

              const nextStats = skylineStats(nextHeights);
              const score = nextStats.maxHeight
                + nextStats.deadArea * 0.11
                + nextStats.variance * 0.18
                + nextStats.raggedness * 0.16
                + edgeGapPenalty
                + edgeBonus
                + valleyReward
                + expansionPenalty
                + orderPenalty;

              if (score < bestScore) {
                bestScore = score;
                winner = {
                  index,
                  span,
                  slot: { column: placement.column, y: placement.y },
                  height,
                };
              }
            });
          });
        }

        return winner;
      }

      let layoutFrame = 0;
      let measureFrame = 0;
      let fontFrame = 0;
      let lastPackedWidth = 0;
      function pack(options = {}) {
        const items = getItems();
        if (!items.length) return;

        const width = Math.round(wall.getBoundingClientRect().width);
        if (!width) return;
        if (!options.force && Math.abs(width - lastPackedWidth) < 2) return;
        lastPackedWidth = width;

        cancelAnimationFrame(layoutFrame);
        cancelAnimationFrame(measureFrame);
        layoutFrame = requestAnimationFrame(() => {
          const columns = columnCount(width);
          const gap = getGap();
          const columnWidth = (width - gap * (columns - 1)) / columns;

          wall.style.setProperty("--salon-columns", String(columns));
          wall.style.setProperty("--salon-gap", `${gap}px`);

          measureFrame = requestAnimationFrame(() => {
            const heights = Array.from({ length: columns }, () => 0);
            const widthForSpan = (span) => columnWidth * span + gap * (span - 1);
            const placed = [];
            const queue = items.map((item, index) => {
              const profile = spanProfile(item, orderFor(item, index), columns);
              const heightCache = new Map();

              function heightForSpan(span) {
                if (heightCache.has(span)) return heightCache.get(span);

                item.style.setProperty("--salon-w", `${Math.max(0, widthForSpan(span))}px`);
                const height = Math.ceil(item.getBoundingClientRect().height);
                heightCache.set(span, height);
                return height;
              }

              return {
                item,
                ...profile,
                heightForSpan,
              };
            });

            function positionRecord(record, column, y, span) {
              const itemHeight = record.heightForSpan(span);
              const x = column * (columnWidth + gap);

              record.column = column;
              record.y = y;
              record.span = span;
              record.height = itemHeight;

              record.item.style.setProperty("--salon-w", `${Math.max(0, widthForSpan(span))}px`);
              record.item.style.setProperty("--salon-x", `${Math.round(x)}px`);
              record.item.style.setProperty("--salon-y", `${Math.round(y)}px`);

              return itemHeight;
            }

            function rebuildHeights(records) {
              const nextHeights = Array.from({ length: columns }, () => 0);

              records.forEach((record) => {
                const nextY = record.y + record.height + gap;
                for (let offset = 0; offset < record.span; offset += 1) {
                  nextHeights[record.column + offset] = Math.max(nextHeights[record.column + offset], nextY);
                }
              });

              return nextHeights;
            }

            function minSpanTotal(records) {
              return records.reduce((total, record) => total + record.min, 0);
            }

            function tailCandidates() {
              const bottomMostTop = Math.max(...placed.map((record) => record.y));
              const tailTopWindow = columns >= 10 ? 540 : 360;
              const maxTailItems = columns >= 10 ? 4 : 3;
              const tailBottom = Math.max(...placed.map((record) => record.y + record.height));
              const tailBottomWindow = columns >= 10 ? 260 : 200;
              let tail = placed
                .filter((record) => bottomMostTop - record.y <= tailTopWindow)
                .sort((left, right) => right.y - left.y || right.column - left.column);

              if (tail.length < 2) {
                tail = placed
                  .filter((record) => record.y + record.height >= tailBottom - tailBottomWindow)
                  .sort((left, right) => right.y + right.height - (left.y + left.height));
              }

              tail = tail.slice(0, maxTailItems);

              while (tail.length > 2 && minSpanTotal(tail) > columns) {
                tail.pop();
              }

              if (tail.length < 2 || minSpanTotal(tail) > columns) return [];

              return tail.sort((left, right) => left.column - right.column || left.y - right.y);
            }

            function repackTail() {
              const tail = tailCandidates();

              if (!tail.length) return;

              const tailSet = new Set(tail);
              const anchored = placed.filter((record) => !tailSet.has(record));
              const tailHeights = rebuildHeights(anchored);
              let cursor = 0;

              const spans = tail.map((record) => record.span);
              let currentTotal = spans.reduce((total, span) => total + span, 0);

              while (currentTotal > columns) {
                let shrunk = false;

                for (let index = tail.length - 1; index >= 0 && currentTotal > columns; index -= 1) {
                  if (spans[index] <= tail[index].min) continue;

                  spans[index] -= 1;
                  currentTotal -= 1;
                  shrunk = true;
                }

                if (!shrunk) return;
              }

              let remaining = columns - currentTotal;

              while (remaining > 0) {
                let stretched = false;

                for (let index = 0; index < tail.length && remaining > 0; index += 1) {
                  const record = tail[index];
                  if (spans[index] >= record.max) continue;

                  spans[index] += 1;
                  remaining -= 1;
                  stretched = true;
                }

                if (!stretched) break;
              }

              const rowFloor = Math.max(...tailHeights);
              const rowY = Math.max(rowFloor, tail.reduce((maxY, record, index) => {
                const span = spans[index];
                const y = Math.max(...tailHeights.slice(cursor, cursor + span));
                cursor += span;
                return Math.max(maxY, y);
              }, 0));

              cursor = 0;
              tail.forEach((record, index) => {
                const span = spans[index];
                if (cursor + span > columns) cursor = 0;

                const itemHeight = positionRecord(record, cursor, rowY, span);
                const nextY = rowY + itemHeight + gap;

                for (let offset = 0; offset < span; offset += 1) {
                  tailHeights[cursor + offset] = nextY;
                }

                cursor += span;
              });

              heights.splice(0, heights.length, ...tailHeights);
            }

            while (queue.length) {
              const { index, span, slot, height: itemHeight } = chooseCandidate(queue, heights, columns, gap);
              const [record] = queue.splice(index, 1);
              const { column, y } = slot;
              positionRecord(record, column, y, span);
              const nextY = y + itemHeight + gap;
              placed.push(record);

              for (let offset = 0; offset < span; offset += 1) {
                heights[column + offset] = nextY;
              }
            }

            repackTail();

            const packedHeight = Math.max(0, Math.max(...heights) - gap);
            wall.style.setProperty("--salon-h", `${Math.ceil(packedHeight)}px`);
            wall.classList.add("is-positioned");
          });
        });
      }

      const wiredImages = new WeakSet();
      function wireImages(items = getItems()) {
        items.forEach((item) => {
          const image = item.querySelector("img");
          if (!image || image.complete || wiredImages.has(image)) return;
          if (image.hasAttribute("width") && image.hasAttribute("height")) return;

          wiredImages.add(image);
          image.addEventListener("load", () => pack({ force: true }), { once: true });
        });
      }

      wireImages();
      wall.addEventListener("photos:items-added", (event) => {
        wireImages(Array.from(event.detail?.items || []));
        pack({ force: true });
      });

      if ("ResizeObserver" in window) {
        new ResizeObserver(pack).observe(wall);
      } else {
        window.addEventListener("resize", pack);
      }

      if (document.fonts?.ready) {
        document.fonts.ready.then(() => {
          cancelAnimationFrame(fontFrame);
          fontFrame = requestAnimationFrame(() => pack({ force: true }));
        });
      }

      pack({ force: true });
    });
  }

  function initPhotoViewer() {
    const article = document.querySelector("[data-photo-single]");
    const viewer = document.querySelector("[data-photo-viewer]");
    if (!article || !viewer) return;

    const triggers = Array.from(article.querySelectorAll("[data-photo-viewer-open]"));
    const stage = viewer.querySelector("[data-photo-viewer-stage]");
    const image = viewer.querySelector("[data-photo-viewer-image]");
    const closeButton = viewer.querySelector("[data-photo-viewer-close]");
    const zoomButtons = Array.from(viewer.querySelectorAll("[data-photo-viewer-zoom]"));
    let lastFocus = null;
    let scale = 1;
    let x = 0;
    let y = 0;
    let drag = null;
    let suppressClick = false;

    function getNaturalSize() {
      // Dataset dimensions let the viewer fit immediately while the full preview image is still loading.
      return {
        width: image.naturalWidth || Number(image.dataset.viewerWidth) || 0,
        height: image.naturalHeight || Number(image.dataset.viewerHeight) || 0,
      };
    }

    function fitImageToStage() {
      if (!stage || !image) return;

      const stageRect = stage.getBoundingClientRect();
      const natural = getNaturalSize();
      if (!stageRect.width || !stageRect.height || !natural.width || !natural.height) return;

      const fit = Math.min(stageRect.width / natural.width, stageRect.height / natural.height);
      image.style.width = `${Math.floor(natural.width * fit)}px`;
      image.style.height = `${Math.floor(natural.height * fit)}px`;
    }

    function getPanBounds() {
      if (!stage || !image) return { x: 0, y: 0 };

      const stageRect = stage.getBoundingClientRect();
      const width = image.offsetWidth * scale;
      const height = image.offsetHeight * scale;

      return {
        x: Math.max(0, (width - stageRect.width) / 2),
        y: Math.max(0, (height - stageRect.height) / 2),
      };
    }

    function clampPan(bounds = getPanBounds()) {
      x = Math.max(-bounds.x, Math.min(bounds.x, x));
      y = Math.max(-bounds.y, Math.min(bounds.y, y));
      return bounds;
    }

    function updatePanState(bounds = getPanBounds()) {
      stage?.classList.toggle("is-pannable", bounds.x > 1 || bounds.y > 1);
    }

    function renderTransform() {
      fitImageToStage();
      const bounds = clampPan();
      image.style.setProperty("--viewer-scale", String(scale));
      image.style.setProperty("--viewer-x", `${Math.round(x)}px`);
      image.style.setProperty("--viewer-y", `${Math.round(y)}px`);
      updatePanState(bounds);
    }

    function resetTransform() {
      scale = 1;
      x = 0;
      y = 0;
      renderTransform();
    }

    function setScale(nextScale) {
      const clamped = Math.min(5, Math.max(1, nextScale));
      scale = clamped;
      renderTransform();
    }

    function canPan() {
      const bounds = getPanBounds();
      return bounds.x > 1 || bounds.y > 1;
    }

    function openViewer(trigger) {
      const fallbackImage = trigger.querySelector("img");
      const src = trigger.dataset.photoViewerSrc || fallbackImage?.currentSrc || fallbackImage?.src;
      if (!src) return;

      lastFocus = document.activeElement;
      image.src = src;
      image.alt = fallbackImage?.alt || "";
      image.dataset.viewerWidth = trigger.dataset.photoViewerWidth || "";
      image.dataset.viewerHeight = trigger.dataset.photoViewerHeight || "";
      suppressClick = false;
      viewer.hidden = false;
      document.body.classList.add("has-photo-viewer");
      resetTransform();
      closeButton?.focus({ preventScroll: true });
    }

    function closeViewer() {
      viewer.hidden = true;
      document.body.classList.remove("has-photo-viewer");
      stage?.classList.remove("is-dragging", "is-pannable");
      drag = null;
      suppressClick = false;
      if (lastFocus && typeof lastFocus.focus === "function") {
        lastFocus.focus({ preventScroll: true });
      }
    }

    triggers.forEach((trigger) => {
      trigger.addEventListener("click", () => openViewer(trigger));
    });

    closeButton?.addEventListener("click", closeViewer);
    stage?.addEventListener("click", (event) => {
      if (suppressClick) {
        suppressClick = false;
        return;
      }

      if (event.target === image) {
        closeViewer();
        return;
      }

      if (event.target === stage) closeViewer();
    });

    zoomButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.photoViewerZoom;
        if (action === "in") setScale(scale + 0.5);
        if (action === "out") setScale(scale - 0.5);
        if (action === "reset") resetTransform();
      });
    });

    stage?.addEventListener("wheel", (event) => {
      if (viewer.hidden) return;
      event.preventDefault();
      setScale(scale + (event.deltaY < 0 ? 0.22 : -0.22));
    }, { passive: false });

    stage?.addEventListener("pointerdown", (event) => {
      if (event.button > 0 || !canPan()) return;

      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: x,
        originY: y,
        moved: false,
      };
      stage.setPointerCapture(event.pointerId);
      stage.classList.add("is-dragging");
      event.preventDefault();
    });

    stage?.addEventListener("pointermove", (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;

      x = drag.originX + event.clientX - drag.startX;
      y = drag.originY + event.clientY - drag.startY;
      if (Math.abs(event.clientX - drag.startX) > 3 || Math.abs(event.clientY - drag.startY) > 3) {
        drag.moved = true;
        suppressClick = true;
      }
      renderTransform();
    });

    function endDrag(event) {
      if (!drag || drag.pointerId !== event.pointerId) return;
      suppressClick = drag.moved;
      drag = null;
      stage?.classList.remove("is-dragging");
    }

    stage?.addEventListener("pointerup", endDrag);
    stage?.addEventListener("pointercancel", endDrag);
    image.addEventListener("load", () => {
      if (viewer.hidden) return;
      renderTransform();
    });
    window.addEventListener("resize", () => {
      if (viewer.hidden) return;
      renderTransform();
    });

    document.addEventListener("keydown", (event) => {
      if (viewer.hidden) return;

      if (event.key === "Escape") {
        closeViewer();
        return;
      }

      if (event.key === "+" || event.key === "=") {
        setScale(scale + 0.5);
        return;
      }

      if (event.key === "-") {
        setScale(scale - 0.5);
        return;
      }

      if (event.key === "0") {
        resetTransform();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      initPhotoPager();
      initSalonWall();
      initPhotoViewer();
    });
  } else {
    initPhotoPager();
    initSalonWall();
    initPhotoViewer();
  }
})();
