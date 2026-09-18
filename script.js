const toggle = document.querySelector(".nav-toggle");
const nav = document.querySelector("#site-nav");
const backdrop = document.querySelector(".nav-backdrop");
const year = document.querySelector("#year");

if (year) {
  year.textContent = String(new Date().getFullYear());
}

function setNav(open) {
  document.body.classList.toggle("nav-open", open);
  toggle?.setAttribute("aria-expanded", String(open));
  toggle?.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  if (backdrop) {
    backdrop.hidden = !open;
  }
}

toggle?.addEventListener("click", () => {
  setNav(!document.body.classList.contains("nav-open"));
});

backdrop?.addEventListener("click", () => setNav(false));

nav?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => setNav(false));
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setNav(false);
  }
});

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - (Math.pow(-2 * t + 2, 3) / 2);
}

function headerOffset(el) {
  const header = document.querySelector(".site-header");
  const headerH = header ? header.getBoundingClientRect().height : 0;
  const tabs = document.querySelector(".menu-tabs");
  const tabH =
    el.classList.contains("menu-category") && tabs
      ? tabs.getBoundingClientRect().height
      : 0;
  return headerH + tabH + 8;
}

let scrollToken = 0;

function smoothScrollTo(el) {
  const start = window.scrollY;
  const raw = el.getBoundingClientRect().top + start - headerOffset(el);
  const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const end = Math.max(0, Math.min(raw, maxY));
  const distance = end - start;

  if (prefersReducedMotion() || Math.abs(distance) < 2) {
    window.scrollTo(0, end);
    return;
  }

  const duration = Math.min(900, Math.max(480, Math.abs(distance) * 0.45));
  const token = ++scrollToken;
  let startTime = 0;

  function frame(now) {
    if (token !== scrollToken) return;
    if (!startTime) startTime = now;
    const t = Math.min(1, (now - startTime) / duration);
    window.scrollTo(0, start + distance * easeInOutCubic(t));
    if (t < 1) requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    const id = link.getAttribute("href");
    if (!id || id === "#") return;
    const target = document.querySelector(id);
    if (!target) return;
    event.preventDefault();
    history.pushState(null, "", id);
    smoothScrollTo(target);
  });
});
