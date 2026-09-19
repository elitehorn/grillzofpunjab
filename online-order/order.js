const WHATSAPP_NUMBER = "916395366055";
const FREE_DELIVERY_ABOVE = 499;
const DELIVERY_CHARGE = 30;
const MAX_DELIVERY_KM = 2;
const RESTAURANT = { lat: 29.3105182, lng: 78.5063213 };
const ORDER_OPEN_MIN = 12 * 60;
const ORDER_CLOSE_MIN = 23 * 60;

const menuStatus = document.querySelector("#menu-status");
const menuRoot = document.querySelector("#menu-root");
const catTabs = document.querySelector("#cat-tabs");
const locChip = document.querySelector("#loc-chip");
const sheetLocStatus = document.querySelector("#sheet-loc-status");
const barCount = document.querySelector("#bar-count");
const barTotal = document.querySelector("#bar-total");
const orderNow = document.querySelector("#order-now");
const sheet = document.querySelector("#checkout-sheet");
const backdrop = document.querySelector("#sheet-backdrop");
const form = document.querySelector("#checkout-form");
const formError = document.querySelector("#form-error");
const retryLocation = document.querySelector("#retry-location");
const locGate = document.querySelector("#loc-gate");
const locGateBtn = document.querySelector("#loc-gate-btn");

const DEFAULT_CITY = "Dhampur";
const cart = new Map();
const selectedVariant = new Map();
let menu = { categories: [], items: [] };
let geo = null;
let filledCity = DEFAULT_CITY;
let lockY = 0;
let lang = "en";
let locView = { code: "finding", place: "", kind: "" };

function t(key, params) {
  const table = window.I18N?.[lang] || window.I18N?.en || {};
  let text = table[key] || window.I18N?.en?.[key] || key;
  if (params) {
    Object.entries(params).forEach(([name, value]) => {
      text = text.replaceAll(`{${name}}`, value);
    });
  }
  return text;
}

function mt(text) {
  if (!text) return "";
  if (lang !== "hi") return text;
  return window.MENU_HI?.[text] || text;
}

function applyStaticI18n() {
  document.documentElement.lang = lang === "hi" ? "hi-IN" : "en-IN";
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.getAttribute("data-i18n"));
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
  });
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria")));
  });
  const toggle = document.querySelector("#lang-toggle");
  if (toggle) {
    toggle.setAttribute("aria-pressed", String(lang === "hi"));
    toggle.textContent = t("langBtn");
    toggle.setAttribute("aria-label", t("langAria"));
  }
  paintLocation();
  renderBar();
}

function setLang(next) {
  lang = next === "hi" ? "hi" : "en";
  applyStaticI18n();
  if (menu.items.length) renderMenu();
}

function money(n) {
  return `₹${n}`;
}

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function activeVariants(item) {
  return (item.variants || []).filter((variant) => variant.active !== false);
}

function linePrice(item, variant) {
  return item.base_price + (variant?.price_delta || 0);
}

function lineKey(itemId, variantId) {
  return `${itemId}::${variantId || "base"}`;
}

function cartQty(itemId, variantId) {
  return cart.get(lineKey(itemId, variantId))?.qty || 0;
}

function cartSummary() {
  let items = 0;
  let subtotal = 0;
  for (const line of cart.values()) {
    items += line.qty;
    subtotal += line.price * line.qty;
  }
  const delivery = items > 0 && subtotal < FREE_DELIVERY_ABOVE ? DELIVERY_CHARGE : 0;
  return { items, subtotal, delivery, total: subtotal + delivery };
}

function setLocationStatus(text, kind) {
  locChip.textContent = text;
  locChip.classList.toggle("is-warn", kind === "warn");
  locChip.classList.toggle("is-err", kind === "err");
  if (sheetLocStatus) sheetLocStatus.textContent = text;
  syncStickyOffset();
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function distanceKm(lat, lng) {
  const dLat = toRad(lat - RESTAURANT.lat);
  const dLng = toRad(lng - RESTAURANT.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(RESTAURANT.lat)) * Math.cos(toRad(lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

function inDeliveryRange() {
  return Boolean(geo && Number.isFinite(geo.km) && geo.km <= MAX_DELIVERY_KM);
}

function istMinutes() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);
  return hour * 60 + minute;
}

function isOrderingOpen() {
  const mins = istMinutes();
  return mins >= ORDER_OPEN_MIN && mins < ORDER_CLOSE_MIN;
}

function canOrder() {
  return isOrderingOpen() && inDeliveryRange();
}

function formatKm(km) {
  return km < 0.1 ? t("kmUnder") : t("kmValue", { n: km.toFixed(1) });
}

function paintLocation() {
  if (!isOrderingOpen()) {
    setLocationStatus(t("hoursClosed"), "err");
    return;
  }
  const place = locView.place || t("locYourArea");
  const km = geo && Number.isFinite(geo.km) ? formatKm(geo.km) : "";
  const messages = {
    finding: t("locFinding"),
    inRange: t("locInRange", { place, km }),
    tooFar: t("locTooFar", { place, km }),
    noGps: t("locNoGps"),
    blocked: t("locBlocked"),
    need: t("locNeed"),
  };
  setLocationStatus(messages[locView.code] || t("locFinding"), locView.kind);
}

function locationOff() {
  return locView.code === "noGps" || locView.code === "blocked" || locView.code === "need";
}

function syncLocGate() {
  if (!locGate) return;
  const off = isOrderingOpen() && locationOff();
  locGate.hidden = !off;
  document.body.classList.toggle("loc-gated", off);
  if ((off || !isOrderingOpen()) && document.body.classList.contains("sheet-open")) closeSheet();
}

function syncOrderingHours() {
  paintLocation();
  renderBar();
  refreshItemControls();
  syncLocGate();
}

function applyLocationResult(code, place, kind) {
  locView = { code, place: place || "", kind: kind || "" };
  if (code === "tooFar") locView.kind = "err";
  if ((code === "noGps" || code === "blocked" || code === "need") && !kind) locView.kind = "warn";
  paintLocation();
  renderBar();
  refreshItemControls();
  syncLocGate();
}

function uniqueParts(parts) {
  return [...new Set(parts.filter(Boolean))];
}

function addressField() {
  return document.querySelector("#customer-address");
}

function prefillCity(city) {
  const field = addressField();
  if (!field) return;
  const next = city || DEFAULT_CITY;
  const current = field.value.trim();
  if (!current || current === filledCity || current === DEFAULT_CITY) {
    field.value = next;
  }
  filledCity = next;
}

async function reverseGeocode(lat, lng) {
  const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("lookup failed");
  const data = await res.json();
  const city = data.city || data.locality || DEFAULT_CITY;
  const label = uniqueParts([data.locality, data.city, data.principalSubdivision]).join(", ") || city;
  return { city, label };
}

function requestLocation() {
  if (!navigator.geolocation) {
    geo = null;
    applyLocationResult("noGps", "", "warn");
    prefillCity(DEFAULT_CITY);
    return;
  }

  locView = { code: "finding", place: "", kind: "" };
  paintLocation();
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      geo = {
        lat: lat.toFixed(6),
        lng: lng.toFixed(6),
        km: distanceKm(lat, lng),
        label: "",
        city: DEFAULT_CITY,
      };
      try {
        const place = await reverseGeocode(lat, lng);
        geo.label = place.label;
        geo.city = place.city;
        applyLocationResult(geo.km > MAX_DELIVERY_KM ? "tooFar" : "inRange", place.label);
        prefillCity(place.city);
      } catch {
        geo.label = DEFAULT_CITY;
        applyLocationResult(geo.km > MAX_DELIVERY_KM ? "tooFar" : "inRange", DEFAULT_CITY, "warn");
        prefillCity(DEFAULT_CITY);
      }
    },
    (error) => {
      geo = null;
      const code = error?.code === 2 ? "noGps" : error?.code === 3 ? "need" : "blocked";
      applyLocationResult(code, "", "warn");
      prefillCity(DEFAULT_CITY);
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
  );
}

function syncStickyOffset() {
  const top = document.querySelector("#order-top");
  if (!top) return;
  document.documentElement.style.setProperty("--sticky-top", `${top.offsetHeight}px`);
}

function stickyOffset() {
  return document.querySelector("#order-top")?.offsetHeight || 0;
}

function scrollTabIntoView(tab) {
  if (!tab || !catTabs) return;
  const left = tab.offsetLeft - 16;
  catTabs.scrollTo({ left, behavior: "smooth" });
}

let activeCatId = "";
let stopWatchTabs = () => {};

function setActiveTab(id) {
  if (!id) return;
  const changed = activeCatId !== id;
  activeCatId = id;
  const tabs = [...catTabs.querySelectorAll("a")];
  let current = null;
  tabs.forEach((tab) => {
    const on = tab.getAttribute("href") === `#${id}`;
    tab.classList.toggle("is-active", on);
    if (on) current = tab;
  });
  if (changed && current) scrollTabIntoView(current);
}

function activeCatFromScroll() {
  const line = stickyOffset() + 12;
  const blocks = [...menuRoot.querySelectorAll(".cat-block")];
  let current = blocks[0];
  for (const block of blocks) {
    if (block.getBoundingClientRect().top <= line) current = block;
    else break;
  }
  return current?.id || "";
}

function chosenVariant(item) {
  const variants = activeVariants(item);
  if (!variants.length) return null;
  const current = selectedVariant.get(item.id);
  return variants.find((variant) => variant.id === current) || variants[0];
}

function refreshItemControls() {
  menu.items.forEach((item) => renderItemControls(item));
}

function setQty(item, variant, qty) {
  const current = cartQty(item.id, variant?.id);
  if (qty > current && !canOrder()) return;
  const key = lineKey(item.id, variant?.id);
  if (qty <= 0) {
    cart.delete(key);
  } else {
    cart.set(key, {
      name: item.name,
      variant: variant?.name || "",
      qty,
      price: linePrice(item, variant),
    });
  }
  renderItemControls(item);
  renderBar();
}

function renderBar() {
  const { items, delivery, total } = cartSummary();
  barCount.textContent = items === 1 ? t("itemOne") : t("itemMany", { n: items });
  barTotal.textContent = delivery
    ? t("withDelivery", { total: money(total), fee: money(delivery) })
    : items
      ? t("freeDelivery", { total: money(total) })
      : money(0);
  orderNow.disabled = items === 0 || !canOrder();
}

function renderItemControls(item) {
  const card = menuRoot.querySelector(`[data-item="${item.id}"]`);
  if (!card) return;
  const variant = chosenVariant(item);
  const priceEl = card.querySelector("[data-price]");
  const controls = card.querySelector("[data-controls]");
  if (priceEl) priceEl.textContent = money(linePrice(item, variant));
  if (!controls) return;

  const qty = cartQty(item.id, variant?.id);
  const allowed = canOrder();
  if (qty === 0) {
    controls.innerHTML = "";
    const add = document.createElement("button");
    add.type = "button";
    add.className = "add-btn";
    add.textContent = t("add");
    add.disabled = !allowed;
    add.addEventListener("click", () => setQty(item, variant, 1));
    controls.append(add);
    return;
  }

  controls.innerHTML = "";
  const stepper = document.createElement("div");
  stepper.className = "stepper";
  const minus = document.createElement("button");
  minus.type = "button";
  minus.setAttribute("aria-label", "Decrease quantity");
  minus.textContent = "−";
  minus.addEventListener("click", () => setQty(item, variant, qty - 1));
  const count = document.createElement("span");
  count.textContent = String(qty);
  const plus = document.createElement("button");
  plus.type = "button";
  plus.setAttribute("aria-label", "Increase quantity");
  plus.textContent = "+";
  plus.disabled = !allowed;
  plus.addEventListener("click", () => setQty(item, variant, qty + 1));
  stepper.append(minus, count, plus);
  controls.append(stepper);
}

function renderMenu() {
  const categories = [...menu.categories]
    .filter((category) => category.active !== false)
    .sort((a, b) => a.sort_order - b.sort_order);
  const items = menu.items.filter((item) => item.active !== false && item.available !== false);

  catTabs.innerHTML = "";
  menuRoot.innerHTML = "";
  menuStatus.hidden = true;

  categories.forEach((category) => {
    const catItems = items
      .filter((item) => item.category_id === category.id)
      .sort((a, b) => a.sort_order - b.sort_order);
    if (!catItems.length) return;

    const id = `cat-${slug(category.name)}`;
    const tab = document.createElement("a");
    tab.href = `#${id}`;
    tab.textContent = mt(category.name);
    tab.addEventListener("click", (event) => {
      event.preventDefault();
      const target = document.getElementById(id);
      if (!target) return;
      setActiveTab(id);
      const top = target.getBoundingClientRect().top + window.scrollY - stickyOffset() - 4;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    });
    catTabs.append(tab);

    const block = document.createElement("section");
    block.className = "cat-block";
    block.id = id;
    const heading = document.createElement("h2");
    heading.textContent = mt(category.name);
    block.append(heading);

    catItems.forEach((item) => {
      const variants = activeVariants(item);
      if (variants.length) selectedVariant.set(item.id, variants[0].id);

      const card = document.createElement("article");
      card.className = "item-card";
      card.dataset.item = item.id;

      const copy = document.createElement("div");
      copy.className = "item-copy";
      const title = document.createElement("h3");
      title.textContent = mt(item.name);
      copy.append(title);
      if (item.description) {
        const desc = document.createElement("p");
        desc.textContent = mt(item.description);
        copy.append(desc);
      }
      const price = document.createElement("div");
      price.className = "item-price";
      price.dataset.price = "";
      price.textContent = money(linePrice(item, chosenVariant(item)));
      copy.append(price);

      const side = document.createElement("div");
      side.className = "item-side";
      if (variants.length) {
        const group = document.createElement("div");
        group.className = "variants";
        variants.forEach((variant) => {
          const chip = document.createElement("button");
          chip.type = "button";
          chip.textContent = mt(variant.name);
          chip.classList.toggle("is-on", chosenVariant(item)?.id === variant.id);
          chip.addEventListener("click", () => {
            selectedVariant.set(item.id, variant.id);
            group.querySelectorAll("button").forEach((btn) => btn.classList.remove("is-on"));
            chip.classList.add("is-on");
            renderItemControls(item);
          });
          group.append(chip);
        });
        side.append(group);
      }
      const controls = document.createElement("div");
      controls.dataset.controls = "";
      side.append(controls);

      card.append(copy, side);
      block.append(card);
    });

    menuRoot.append(block);
    catItems.forEach((item) => renderItemControls(item));
  });

  watchTabs();
  syncStickyOffset();
}

function watchTabs() {
  stopWatchTabs();
  if (!catTabs.querySelector("a")) return;
  const sync = () => setActiveTab(activeCatFromScroll());
  window.addEventListener("scroll", sync, { passive: true });
  stopWatchTabs = () => window.removeEventListener("scroll", sync);
  if (activeCatId && document.getElementById(activeCatId)) setActiveTab(activeCatId);
  else sync();
}

function openSheet() {
  if (!isOrderingOpen()) {
    paintLocation();
    return;
  }
  if (!inDeliveryRange()) {
    applyLocationResult(geo ? "tooFar" : "need", geo?.label || t("locYourArea"));
    return;
  }
  lockY = window.scrollY;
  document.body.classList.add("sheet-open");
  document.body.style.top = `-${lockY}px`;
  sheet.hidden = false;
  backdrop.hidden = false;
  if (!geo) requestLocation();
  if (!addressField()?.value.trim()) prefillCity(geo?.city || DEFAULT_CITY);
  document.querySelector("#customer-name")?.focus();
}

function closeSheet() {
  sheet.hidden = true;
  backdrop.hidden = true;
  document.body.classList.remove("sheet-open");
  document.body.style.top = "";
  window.scrollTo(0, lockY);
}

function showError(message) {
  formError.hidden = !message;
  formError.textContent = message || "";
}

function buildWhatsAppUrl() {
  const name = document.querySelector("#customer-name").value.trim();
  const phone = document.querySelector("#customer-phone").value.replace(/\D/g, "");
  const address = addressField()?.value.trim() || "";
  const notes = document.querySelector("#customer-notes")?.value.trim() || "";
  const { items, subtotal, delivery, total } = cartSummary();
  const city = geo?.city || filledCity || DEFAULT_CITY;
  const detail = address.replace(new RegExp(city, "ig"), "").replace(/[,.\s]/g, "");

  if (!isOrderingOpen()) return { error: t("errHours") };
  if (!items) return { error: t("errItems") };
  if (name.length < 2) return { error: t("errName") };
  if (!/^[6-9]\d{9}$/.test(phone)) return { error: t("errPhone") };
  if (!inDeliveryRange()) {
    return { error: t("errRange") };
  }
  if (detail.length < 4) return { error: t("errAddress") };

  const lines = [
    t("waTitle"),
    "",
    `${t("waName")}: ${name}`,
    `${t("waMobile")}: ${phone}`,
  ];

  if (geo?.label) {
    lines.push(`${t("waArea")}: ${geo.label}`);
  }
  lines.push(`${t("waAddress")}: ${address}`);
  if (notes) {
    lines.push(`${t("waNotes")}: ${notes}`);
  }
  if (geo) {
    lines.push(`${t("waDistance")}: ${formatKm(geo.km)} (${t("waWithin")})`);
    lines.push(`Map: https://maps.google.com/?q=${geo.lat},${geo.lng}`);
  }

  lines.push("", `${t("waItems")}:`);
  for (const line of cart.values()) {
    const itemName = mt(line.name);
    const variantName = line.variant ? mt(line.variant) : "";
    const label = variantName ? `${itemName} (${variantName})` : itemName;
    lines.push(`• ${label} × ${line.qty} — ${money(line.price * line.qty)}`);
  }

  lines.push("", `${t("waSubtotal")}: ${money(subtotal)}`);
  if (delivery) {
    lines.push(`${t("waDelivery")}: ${money(delivery)}`);
  } else {
    lines.push(`${t("waDelivery")}: ${t("waDeliveryFree")}`);
  }
  lines.push(`${t("waTotal")}: ${money(total)}`);

  const text = encodeURIComponent(lines.join("\n"));
  return { url: `https://wa.me/${WHATSAPP_NUMBER}?text=${text}` };
}

orderNow.addEventListener("click", () => {
  if (cartSummary().items === 0) return;
  openSheet();
});

backdrop.addEventListener("click", closeSheet);
backdrop.addEventListener("touchmove", (event) => event.preventDefault(), { passive: false });
sheet.addEventListener("touchmove", (event) => event.stopPropagation(), { passive: true });

retryLocation.addEventListener("click", requestLocation);
locGateBtn?.addEventListener("click", requestLocation);

document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  syncOrderingHours();
  if (isOrderingOpen() && !geo) requestLocation();
});

setInterval(syncOrderingHours, 30000);

if (navigator.permissions?.query) {
  navigator.permissions.query({ name: "geolocation" }).then((status) => {
    status.onchange = () => {
      if (status.state === "granted") requestLocation();
      else if (status.state === "denied") applyLocationResult("blocked", "", "warn");
    };
  }).catch(() => {});
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const result = buildWhatsAppUrl();
  if (result.error) {
    showError(result.error);
    return;
  }
  showError("");
  window.location.href = result.url;
});

document.querySelector("#customer-phone")?.addEventListener("input", (event) => {
  event.target.value = event.target.value.replace(/\D/g, "").slice(0, 10);
});

function toggleLang(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  setLang(lang === "hi" ? "en" : "hi");
}

window.grillzSetLang = setLang;
window.grillzToggleLang = toggleLang;
document.querySelector("#lang-toggle")?.addEventListener("click", toggleLang);

async function loadMenuData() {
  if (window.MENU_DATA?.categories && window.MENU_DATA?.items) {
    return window.MENU_DATA;
  }

  const urls = ["/menu.json", "../menu.json", new URL("../menu.json", window.location.href).href];
  let lastError = "Could not load menu";
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        lastError = `Menu request failed (${res.status})`;
        continue;
      }
      const data = await res.json();
      if (data?.categories && data?.items) return data;
      lastError = "Menu file is missing categories";
    } catch (error) {
      lastError = error.message || lastError;
    }
  }
  throw new Error(lastError);
}

async function init() {
  applyStaticI18n();
  renderBar();
  prefillCity(DEFAULT_CITY);
  syncStickyOffset();
  window.addEventListener("resize", syncStickyOffset);
  syncOrderingHours();
  if (isOrderingOpen()) requestLocation();
  try {
    menu = await loadMenuData();
    renderMenu();
  } catch {
    menuStatus.hidden = false;
    menuStatus.textContent = t("loadFail");
  }
}

init();
