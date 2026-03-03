/**
 * ============================================================
 *  escritos_buscador.js — Lógica de la Biblioteca
 * ============================================================
 */
import { loadEscritos } from "./escritos_data.js";

let ESCRITOS = [];
const filters = { query: "", genero: "" };

const grid  = document.getElementById("resultsGrid");
const count = document.getElementById("resultCount");
const modal = document.getElementById("modal");

// ─────────────────────────────────────────────
//  LAZY LOAD — estado global
// ─────────────────────────────────────────────
let _lazyItems    = [];
let _lazyLoaded   = 0;
const LAZY_BATCH  = 12;
let _lazyObserver = null;

// Centinela invisible que activa la carga al aparecer en pantalla
const _sentinel = document.createElement("div");
_sentinel.setAttribute("aria-hidden", "true");
_sentinel.style.cssText = "height:2px;width:100%;pointer-events:none;grid-column:1/-1;";
grid.appendChild(_sentinel);

// ─────────────────────────────────────────────
//  INICIALIZACIÓN
// ─────────────────────────────────────────────
async function init() {
  count.textContent = "Cargando biblioteca...";
  ESCRITOS = await loadEscritos();
  // Solo mostrar obras aprobadas en el catálogo público
  ESCRITOS = ESCRITOS.filter(e => {
    const ap = (e.aprobacion || "").toLowerCase();
    return ap === "aprobado" || ap === "true" || ap === "";
  });
  setupEventListeners();
  render();
  renderRecomendadas();
}

// ═══════════════════════════════════════════════════════
//  CARRUSEL — 6 obras al azar con auto-avance y arrastre
// ═══════════════════════════════════════════════════════

let _cPicks = [];
let _cIndex = 0;
let _cTimer = null;

function _cBuild() {
  const track = document.getElementById("carouselTrack");
  const dots  = document.getElementById("carouselDots");
  if (!track) return;

  if (_cPicks.length === 0) {
    track.innerHTML = `<p style="color:var(--text-muted);padding:40px 20px;text-align:center;">Sin obras disponibles.</p>`;
    return;
  }

  track.innerHTML = _cPicks.map((item, i) => {
    const genre = item.generos[0] ? `<span class="c-genre">${item.generos[0]}</span>` : "";
    const caps  = `${item.capitulos} cap${item.capitulos !== 1 ? "s" : ""}`;
    const cover = item.cover
      ? `<img src="${item.cover}" alt="${item.titulo}" loading="lazy" onerror="this.outerHTML='<div class=\\'c-slide-ph\\'>&#128218;</div>'" />`
      : `<div class="c-slide-ph">&#128218;</div>`;
    return `<div class="c-slide" data-i="${i}">${cover}<div class="c-info"><div class="c-title">${item.titulo}</div><div class="c-meta">${genre}<span class="c-caps">${caps}</span></div></div></div>`;
  }).join("");

  if (dots) {
    dots.innerHTML = _cPicks.map((_, i) =>
      `<button class="c-dot${i === 0 ? " active" : ""}" onclick="carouselGoTo(${i})" aria-label="Slide ${i + 1}"></button>`
    ).join("");
  }

  track.querySelectorAll(".c-slide").forEach(s =>
    s.addEventListener("click", () => { const it = _cPicks[+s.dataset.i]; if (it) openModal(it); })
  );

  _cPos(false);
  _cAutoStart();
  _cDrag();
}

function _cPos(animate) {
  const track = document.getElementById("carouselTrack");
  if (!track) return;
  const slide = track.querySelector(".c-slide");
  if (!slide) return;
  const w = slide.offsetWidth + 12;
  if (!animate) track.classList.add("no-anim");
  track.style.transform = `translateX(-${_cIndex * w}px)`;
  if (!animate) requestAnimationFrame(() => requestAnimationFrame(() => track.classList.remove("no-anim")));
  document.querySelectorAll(".c-dot").forEach((d, i) => d.classList.toggle("active", i === _cIndex));
}

window.carouselGoTo = function (i) {
  _cIndex = Math.max(0, Math.min(i, _cPicks.length - 1));
  _cPos(true); _cAutoReset();
};
window.carouselNext = function () {
  _cIndex = (_cIndex + 1) % _cPicks.length;
  _cPos(true); _cAutoReset();
};
window.carouselPrev = function () {
  _cIndex = (_cIndex - 1 + _cPicks.length) % _cPicks.length;
  _cPos(true); _cAutoReset();
};

function _cAutoStart() {
  clearInterval(_cTimer);
  if (_cPicks.length > 1)
    _cTimer = setInterval(() => { _cIndex = (_cIndex + 1) % _cPicks.length; _cPos(true); }, 4200);
}
function _cAutoReset() { clearInterval(_cTimer); _cAutoStart(); }

function _cDrag() {
  const outer = document.getElementById("carouselOuter");
  const track = document.getElementById("carouselTrack");
  if (!outer || !track) return;
  let sx = 0, base = 0, dragging = false;

  const start = x => {
    dragging = true; sx = x;
    const s = track.querySelector(".c-slide");
    base = s ? _cIndex * (s.offsetWidth + 12) : 0;
    track.classList.add("no-anim");
    clearInterval(_cTimer);
  };
  const move = x => {
    if (!dragging) return;
    track.style.transform = `translateX(-${base - (x - sx)}px)`;
  };
  const end = x => {
    if (!dragging) return;
    dragging = false;
    track.classList.remove("no-anim");
    const s = track.querySelector(".c-slide");
    const thr = s ? s.offsetWidth * 0.28 : 55;
    const dx = x - sx;
    if      (dx < -thr) _cIndex = Math.min(_cIndex + 1, _cPicks.length - 1);
    else if (dx >  thr) _cIndex = Math.max(_cIndex - 1, 0);
    _cPos(true); _cAutoStart();
  };

  outer.addEventListener("touchstart",  e => start(e.touches[0].clientX),     { passive: true });
  outer.addEventListener("touchmove",   e => move(e.touches[0].clientX),       { passive: true });
  outer.addEventListener("touchend",    e => end(e.changedTouches[0].clientX), { passive: true });
  outer.addEventListener("mousedown",   e => { start(e.clientX); e.preventDefault(); });
  window.addEventListener("mousemove",  e => move(e.clientX));
  window.addEventListener("mouseup",    e => end(e.clientX));
}

/** Solo 6 obras aleatorias */
function renderRecomendadas() {
  if (!ESCRITOS.length) return;
  _cIndex = 0;
  _cPicks = [...ESCRITOS].sort(() => Math.random() - 0.5).slice(0, Math.min(6, ESCRITOS.length));
  _cBuild();
}

window.shuffleCarousel = function () {
  const btn = document.querySelector(".btn-shuffle");
  if (btn) {
    btn.style.transform  = "rotate(360deg)";
    btn.style.transition = "transform 0.5s ease";
    setTimeout(() => { btn.style.transform = ""; btn.style.transition = ""; }, 500);
  }
  clearInterval(_cTimer);
  _cIndex = 0;
  _cPicks = [...ESCRITOS].sort(() => Math.random() - 0.5).slice(0, Math.min(6, ESCRITOS.length));
  _cBuild();
};

window.shuffleRecomendadas = window.shuffleCarousel;

// ─────────────────────────────────────────────
//  LAZY LOAD — helpers
// ─────────────────────────────────────────────
function buildCard(item, idx) {
  const card = document.createElement("div");
  card.className = "card";
  card.style.animationDelay = `${(idx % LAZY_BATCH) * 40}ms`;

  const genresHtml = item.generos.slice(0, 3)
    .map(g => `<span class="card-genre">${g}</span>`).join("");

  card.innerHTML = `
    <div class="card-cover">
      ${item.cover
        ? `<img class="card-cover-img" src="${item.cover}" alt="${item.titulo}" loading="lazy" />`
        : `<span></span>`}
    </div>
    <div class="card-body">
      <div class="card-title">${item.titulo}</div>
      <div class="card-meta">${genresHtml}</div>
      <div class="card-seasons">${item.capitulos} cap${item.capitulos !== 1 ? "s" : ""}.</div>
    </div>`;

  card.addEventListener("click", () => openModal(item));
  return card;
}

function loadNextBatch() {
  if (_lazyLoaded >= _lazyItems.length) return;
  const end  = Math.min(_lazyLoaded + LAZY_BATCH, _lazyItems.length);
  const frag = document.createDocumentFragment();
  for (let i = _lazyLoaded; i < end; i++) frag.appendChild(buildCard(_lazyItems[i], i));
  grid.insertBefore(frag, _sentinel);
  _lazyLoaded = end;
  if (_lazyLoaded >= _lazyItems.length && _lazyObserver) {
    _lazyObserver.disconnect();
    _lazyObserver = null;
  }
}

function initLazyObserver() {
  if (_lazyObserver) { _lazyObserver.disconnect(); _lazyObserver = null; }
  _lazyObserver = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) loadNextBatch();
  }, { rootMargin: "300px" });
  _lazyObserver.observe(_sentinel);
}

// ─────────────────────────────────────────────
//  RENDER — con lazy load
// ─────────────────────────────────────────────
function render() {
  _lazyItems = ESCRITOS.filter(item => {
    const q = filters.query.toLowerCase();
    if (q && !item.titulo.toLowerCase().includes(q) && !item.autor.toLowerCase().includes(q)) return false;
    if (filters.genero && !item.generos.map(g => g.toLowerCase()).includes(filters.genero.toLowerCase())) return false;
    return true;
  });

  // Limpiar cards preservando el centinela
  while (grid.firstChild && grid.firstChild !== _sentinel) grid.removeChild(grid.firstChild);
  _lazyLoaded = 0;

  count.textContent = `${_lazyItems.length} historia${_lazyItems.length !== 1 ? "s" : ""} encontrada${_lazyItems.length !== 1 ? "s" : ""}`;
  document.getElementById("emptyState").classList.toggle("hidden", _lazyItems.length > 0);

  loadNextBatch();       // primer lote inmediato
  initLazyObserver();    // el resto al hacer scroll
}

// ─────────────────────────────────────────────
//  MODAL
// ─────────────────────────────────────────────
function openModal(item) {
  document.getElementById("modalTitle").textContent    = item.titulo;
  document.getElementById("modalSinopsis").textContent = item.sinopsis;
  document.getElementById("modalCover").innerHTML      = item.cover
    ? `<img src="${item.cover}" alt="${item.titulo}" />`
    : "";

  const authorId = item.id_autor || "";
  document.getElementById("modalBadge").innerHTML =
    `Autor: <a href="perfil_autor.html?id=${encodeURIComponent(authorId)}" class="author-link">${item.autor}</a>`;

  document.getElementById("modalTags").innerHTML = item.generos
    .map(g => `<span class="modal-tag">${g}</span>`).join("");

  const statusMap = { completado:"✓ Completado", "en pausa":"En Pausa", "en emisión":"En Emisión" };
  const st = (item.estado || "").toLowerCase();
  document.getElementById("modalSeasons").textContent =
    `${item.capitulos} capítulos · ${statusMap[st] || item.estado || ""}`;

  document.getElementById("modalBtns").innerHTML =
    `<a href="escritos_capitulos.html?id=${item.id}" class="modal-btn modal-btn--manga">Ver Capítulos</a>`;

  modal.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  modal.classList.remove("open");
  document.body.style.overflow = "";
}

// ─────────────────────────────────────────────
//  EVENT LISTENERS
// ─────────────────────────────────────────────
function setupEventListeners() {
  const searchInput = document.getElementById("searchInput");
  const clearBtn    = document.getElementById("clearBtn");
  const genresToggle = document.getElementById("genresToggle");
  const generoFilter = document.getElementById("generoFilter");

  // Búsqueda
  searchInput.addEventListener("input", e => {
    filters.query = e.target.value;
    clearBtn?.classList.toggle("visible", !!e.target.value);
    render();
  });

  clearBtn?.addEventListener("click", () => {
    searchInput.value = "";
    filters.query = "";
    clearBtn.classList.remove("visible");
    render();
  });

  // Filtro de géneros
  generoFilter.addEventListener("click", e => {
    const tag = e.target.closest(".tag");
    if (!tag) return;
    generoFilter.querySelectorAll(".tag").forEach(t => t.classList.remove("active"));
    tag.classList.add("active");
    filters.genero = tag.dataset.value;
    render();
  });

  // Toggle "Ver todos / Ver menos"
  genresToggle.addEventListener("click", () => {
    const isExpanded = generoFilter.classList.contains("genres-expanded");
    if (isExpanded) {
      generoFilter.classList.remove("genres-expanded");
      generoFilter.classList.add("genres-collapsed");
      genresToggle.innerHTML = "Ver todos &#9662;";
    } else {
      generoFilter.classList.remove("genres-collapsed");
      generoFilter.classList.add("genres-expanded");
      genresToggle.innerHTML = "Ver menos &#9652;";
    }
  });

  // Cerrar modal de obra
  document.getElementById("modalClose").addEventListener("click", closeModal);
  modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

  // Reset filtros
  document.getElementById("resetFilters").addEventListener("click", () => {
    searchInput.value = "";
    filters.query  = "";
    filters.genero = "";
    clearBtn?.classList.remove("visible");
    generoFilter.querySelectorAll(".tag").forEach((t, i) => t.classList.toggle("active", i === 0));
    generoFilter.classList.remove("genres-expanded");
    generoFilter.classList.add("genres-collapsed");
    genresToggle.innerHTML = "Ver todos &#9662;";
    render();
  });
}

// Estilos del enlace de autor (inyectados una sola vez)
const authorStyle = document.createElement("style");
authorStyle.textContent = `
  .author-link {
    color:var(--accent3);text-decoration:none;font-weight:700;
    border-bottom:1px dashed var(--accent3);transition:0.2s;
  }
  .author-link:hover { color:#fff;border-bottom-color:#fff; }
`;
document.head.appendChild(authorStyle);

init();