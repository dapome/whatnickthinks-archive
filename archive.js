// The archive's two bits of behaviour, both layered on plain HTML:
// the tape transport that plays through the years, and the lightbox.
// Entries live in index.html; nothing here needs editing to add one.

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

// Briefly roll tape noise through an element. Only ever after the reader acts.
function track(element) {
  if (!element || reduceMotion.matches) return;
  element.classList.add("tracking");
  element.classList.remove("is-tracking");
  void element.offsetWidth;
  element.classList.add("is-tracking");
  element.addEventListener("animationend", () => element.classList.remove("is-tracking"), { once: true });
}

// Calls `done` once the page has stopped scrolling (works where `scrollend` doesn't).
function afterScroll(done) {
  let timer;
  const finish = () => {
    window.removeEventListener("scroll", onScroll);
    done();
  };
  const onScroll = () => {
    clearTimeout(timer);
    timer = setTimeout(finish, 140);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  timer = setTimeout(finish, 140);
}

function isTyping(target) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

/* The transport */

function setUpTransport() {
  const transport = document.querySelector(".transport");
  const years = [...document.querySelectorAll(".year")].map((el) => ({
    el,
    year: el.id,
    era: el.closest(".era")?.dataset.era ?? "",
    kind: el.querySelector(".year__artifacts > :not(.lost)")
      ? "artifact"
      : el.querySelector(".year__body > p:not(.lost)")
        ? "event"
        : "quiet",
  }));
  if (!transport || years.length === 0) return null;

  const screen = transport.querySelector(".transport__screen");
  const readout = transport.querySelector(".transport__readout");
  const mode = transport.querySelector(".transport__mode");
  const yearText = transport.querySelector(".transport__year");
  const eraText = transport.querySelector(".transport__era");
  const range = transport.querySelector(".transport__range");
  const ticks = transport.querySelector(".transport__ticks");
  const ends = transport.querySelectorAll(".transport__ends span");
  const [prev, next] = transport.querySelectorAll("[data-step]");
  const announce = transport.querySelector("[data-announce]");
  const last = years.length - 1;

  range.max = String(last);
  ends[0].textContent = years[0].year;
  ends[1].textContent = years[last].year;
  ticks.append(
    ...years.map((entry, i) => {
      const tick = document.createElement("span");
      tick.className = `tick tick--${entry.kind}`;
      tick.style.setProperty("--p", String(last ? i / last : 0));
      return tick;
    }),
  );
  transport.hidden = false;

  // Keep the year headings clear of the pinned transport, and unpin it when
  // large text makes it take too much of the screen.
  const measure = () => {
    transport.classList.remove("is-loose");
    const loose = transport.offsetHeight > window.innerHeight * 0.3;
    transport.classList.toggle("is-loose", loose);
    document.documentElement.style.setProperty("--transport-h", loose ? "0px" : `${transport.offsetHeight}px`);
  };
  new ResizeObserver(measure).observe(screen);
  window.addEventListener("resize", measure);

  let current = -1;
  let jumping = false;
  let jumpId = 0;
  let scrubbing = false;

  const MODES = { play: "▶ PLAY", ff: "▶▶ FF", rew: "◀◀ REW" };
  const setMode = (name) => {
    mode.textContent = MODES[name];
  };

  function show(i) {
    if (i === current) return;
    years[current]?.el.classList.remove("is-current");
    current = i;
    const entry = years[i];
    entry.el.classList.add("is-current");
    yearText.textContent = entry.year;
    eraText.textContent = entry.era;
    range.value = String(i);
    range.setAttribute("aria-valuetext", `${entry.year}, ${entry.era}`);
    ticks.style.setProperty("--progress", String(last ? i / last : 0));
    prev.disabled = i === 0;
    next.disabled = i === last;
  }

  // Jump to a year because the reader asked to.
  function go(i, { instant = false } = {}) {
    i = Math.max(0, Math.min(last, i));
    const direction = Math.sign(i - current);
    const smooth = !instant && !reduceMotion.matches;
    const id = ++jumpId;
    show(i);
    jumping = true;
    if (direction) setMode(direction > 0 ? "ff" : "rew");
    years[i].el.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
    history.replaceState(null, "", `#${years[i].year}`);
    announce.textContent = `${years[i].year}, ${years[i].era}`;
    afterScroll(() => {
      if (id !== jumpId) return;
      jumping = false;
      setMode("play");
      track(readout);
      track(years[i].el.querySelector(".year__label"));
    });
  }

  // Follow the reader's own scrolling, quietly.
  function follow() {
    if (jumping) return;
    const top = Math.max(0, transport.getBoundingClientRect().bottom);
    const line = top + (window.innerHeight - top) * 0.3;
    let i = 0;
    years.forEach((entry, k) => {
      if (entry.el.getBoundingClientRect().top <= line) i = k;
    });
    const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    if (atBottom && years[last].el.getBoundingClientRect().top < window.innerHeight) i = last;
    show(i);
  }

  let queued = false;
  window.addEventListener(
    "scroll",
    () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        follow();
      });
    },
    { passive: true },
  );

  prev.addEventListener("click", () => go(current - 1));
  next.addEventListener("click", () => go(current + 1));

  // Dragging the playhead scrubs: the page follows at once, like a jog wheel.
  range.addEventListener("pointerdown", () => {
    scrubbing = true;
  });
  window.addEventListener("pointerup", () => {
    scrubbing = false;
  });
  window.addEventListener("pointercancel", () => {
    scrubbing = false;
  });
  range.addEventListener("input", () => go(Number(range.value), { instant: scrubbing }));

  measure();
  const start = years.findIndex((entry) => `#${entry.year}` === decodeURIComponent(location.hash));
  show(Math.max(0, start));
  follow();

  return {
    step(delta) {
      go(current + delta);
    },
  };
}

/* The lightbox */

function setUpLightbox() {
  const dialog = document.querySelector(".lightbox");
  const links = [...document.querySelectorAll(".artifact__open")];
  if (!dialog || links.length === 0) return null;

  const img = dialog.querySelector(".lightbox__img");
  const stamp = dialog.querySelector(".lightbox__stamp");
  const caption = dialog.querySelector(".lightbox__caption");
  const count = dialog.querySelector(".lightbox__count");
  const [back, forward] = dialog.querySelectorAll("[data-move]");
  const nav = dialog.querySelector(".lightbox__nav");
  let shown = -1;

  nav.hidden = links.length < 2;

  function show(i) {
    shown = (i + links.length) % links.length;
    const link = links[shown];
    const thumb = link.querySelector("img");
    const figure = link.closest("figure");

    // Show the thumbnail straight away, then swap in the full picture once it has loaded.
    img.src = thumb.currentSrc || thumb.src;
    img.alt = thumb.alt;
    if (link.href !== img.src) {
      const full = new Image();
      const wanted = shown;
      full.src = link.href;
      full
        .decode()
        .then(() => {
          if (wanted !== shown) return;
          img.src = full.src;
        })
        .catch(() => {});
    }

    stamp.textContent = link.querySelector(".artifact__stamp")?.textContent ?? "";
    caption.replaceChildren(...figure.querySelector("figcaption").cloneNode(true).childNodes);
    dialog.setAttribute("aria-label", figure.querySelector(".artifact__title")?.textContent ?? "Artifact");
    count.textContent = `${shown + 1} / ${links.length}`;
  }

  links.forEach((link, i) => {
    link.addEventListener("click", (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      event.preventDefault();
      show(i);
      dialog.showModal();
    });
  });

  dialog.querySelector("[data-close]").addEventListener("click", () => dialog.close());
  back.addEventListener("click", () => show(shown - 1));
  forward.addEventListener("click", () => show(shown + 1));

  // A click anywhere that isn't the picture, its label or a button closes it.
  dialog.addEventListener("click", (event) => {
    if (!event.target.closest("img, figcaption, button")) dialog.close();
  });

  return {
    get open() {
      return dialog.open;
    },
    step(delta) {
      if (links.length > 1) show(shown + delta);
    },
  };
}

const transport = setUpTransport();
const lightbox = setUpLightbox();

// Left and right arrows step through the years, or through the pictures when one is open.
document.addEventListener("keydown", (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  const delta = event.key === "ArrowLeft" ? -1 : 1;
  if (lightbox?.open) {
    event.preventDefault();
    lightbox.step(delta);
    return;
  }
  if (!transport || isTyping(event.target)) return;
  event.preventDefault();
  transport.step(delta);
});
