/**
 * ============================================================
 *  escritos_buscador.js — Lógica de la Biblioteca
 * ============================================================
 */
import { loadEscritos } from "./escritos_data.js";

let ESCRITOS = [];
const filters = { query: "", generos: new Set() };  // multi-género

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
  ESCRITOS = ESCRITOS.filter(e => {
    const ap = (e.aprobacion || "").toLowerCase();
    return ap === "aprobado" || ap === "true" || ap === "";
  });
  setupEventListeners();
  render();
  renderRecomendadas();
}

// ═══════════════════════════════════════════════════════
//  CARRUSEL INFINITO — track append-only
//
//  El track NUNCA se resetea al inicio.
//  Cuando el índice llega al penúltimo slide visible,
//  se añaden 6 nuevos slides al final del track y se
//  eliminan los primeros 6 (ya vistos) para evitar
//  que el DOM crezca indefinidamente.
//  Resultado: siempre avanza, como 1→2→3→4→5→6→7→8→...
// ═══════════════════════════════════════════════════════

const CAROUSEL_BATCH = 6;   // cuántos slides se añaden cada vez
const CAROUSEL_TRIM  = 6;   // cuántos slides se eliminan al añadir

let _cPool  = [];            // cola mezclada pendiente de mostrar
let _cShown = new Set();     // ids ya mostrados alguna vez
let _cIndex = 0;             // índice global (crece siempre)
let _cTotal = 0;             // total de slides en el DOM
let _cTimer = null;

/** Devuelve las próximas N obras sin repetir; si se agota el pool lo rellena */
function _cNextItems(n) {
  const result = [];
  while (result.length < n) {
    // Rellenar pool si está vacío o casi vacío
    if (_cPool.length < n) {
      // Todos menos los últimos CAROUSEL_BATCH mostrados para no repetir inmediatamente
      const recent = [..._cShown].slice(-CAROUSEL_BATCH);
      const fresh  = ESCRITOS.filter(o => !recent.includes(o.id))
                              .sort(() => Math.random() - 0.5);
      _cPool.push(...fresh);
    }
    const item = _cPool.shift();
    if (!item) break;
    _cShown.add(item.id);
    result.push(item);
  }
  return result;
}

/** Crea y devuelve un elemento DOM de slide */
function _cMakeSlide(item, globalIndex) {
  const genre = item.generos?.[0] ? `<span class="c-genre">${item.generos[0]}</span>` : "";
  const caps  = `${item.capitulos} cap${item.capitulos !== 1 ? "s" : ""}`;
  const div   = document.createElement("div");
  div.className    = "c-slide";
  div.dataset.gi   = globalIndex;   // índice global para el dot activo
  div.innerHTML    = `
    ${item.cover
      ? `<img src="${item.cover}" alt="${item.titulo}" loading="lazy"
           onerror="this.outerHTML='<div class=\\'c-slide-ph\\'>&#128218;</div>'">`
      : `<div class="c-slide-ph">&#128218;</div>`}
    <div class="c-info">
      <div class="c-title">${item.titulo}</div>
      <div class="c-meta">${genre}<span class="c-caps">${caps}</span></div>
    </div>`;
  div.addEventListener("click", () => openModal(item));
  return div;
}

/** Calcula el ancho de un slide (incluye gap) */
function _cSlideW() {
  const track = document.getElementById("carouselTrack");
  const s     = track?.querySelector(".c-slide");
  return s ? s.offsetWidth + 12 : 0;
}

/** Mueve el track al índice _cIndex */
function _cPos(animate) {
  const track = document.getElementById("carouselTrack");
  if (!track) return;
  const w = _cSlideW();
  if (!w) return;
  if (!animate) {
    track.style.transition = "none";
    track.style.transform  = `translateX(-${_cIndex * w}px)`;
    requestAnimationFrame(() => requestAnimationFrame(() => { track.style.transition = ""; }));
  } else {
    track.style.transition = "";
    track.style.transform  = `translateX(-${_cIndex * w}px)`;
  }
  const dotPos = _cIndex % CAROUSEL_BATCH;
  document.querySelectorAll(".c-dot").forEach((d, i) => d.classList.toggle("active", i === dotPos));
}

// ── Flags de estado del carrusel ─────────────────────────
let _cDragging    = false;  // gesto activo en curso
let _cPendingTrim = false;  // hay slides para limpiar cuando termine el drag
let _cAppending   = false;  // guard para evitar doble append simultáneo

/** Añade CAROUSEL_BATCH slides al final del track */
function _cAppendBatch() {
  if (_cAppending) return;
  _cAppending = true;

  const track = document.getElementById("carouselTrack");
  if (!track) { _cAppending = false; return; }

  const items = _cNextItems(CAROUSEL_BATCH);
  items.forEach((item, i) => track.appendChild(_cMakeSlide(item, _cTotal + i)));
  _cTotal += items.length;

  _cPendingTrim = true;
  _cBuildDots();

  // Solo limpiar si no hay gesto en curso
  if (!_cDragging) setTimeout(_cDoTrim, 500);

  _cAppending = false;
}

/**
 * Elimina slides del inicio del track cuando hay demasiados.
 * Solo se ejecuta cuando NO hay drag activo y siempre con
 * transición desactivada para que el salto de índice sea invisible.
 */
function _cDoTrim() {
  if (_cDragging || !_cPendingTrim) return;

  const track = document.getElementById("carouselTrack");
  if (!track) return;

  const maxSlides = CAROUSEL_BATCH * 4;
  const slides    = Array.from(track.querySelectorAll(".c-slide"));
  if (slides.length <= maxSlides) { _cPendingTrim = false; return; }

  const toRemove = slides.length - maxSlides;
  const w        = _cSlideW();
  if (!w) return;

  // Congelar visualmente sin clase — solo sobreescribimos inline
  track.style.transition = "none";
  track.style.transform  = `translateX(-${_cIndex * w}px)`;

  requestAnimationFrame(() => {
    // Borrar y corregir índice
    for (let i = 0; i < toRemove; i++) slides[i].remove();
    _cIndex = Math.max(0, _cIndex - toRemove);
    track.style.transform = `translateX(-${_cIndex * w}px)`;

    // Devolver control a CSS en el frame siguiente
    requestAnimationFrame(() => {
      track.style.transition = "";
      _cPendingTrim = false;
    });
  });
}

/** Dots */
function _cBuildDots() {
  const dots = document.getElementById("carouselDots");
  if (!dots) return;
  const dotPos = _cIndex % CAROUSEL_BATCH;
  dots.innerHTML = Array.from({ length: CAROUSEL_BATCH }, (_, i) =>
    `<button class="c-dot${i === dotPos ? " active" : ""}"
      onclick="carouselGoTo(${i})" aria-label="Slide ${i+1}"></button>`
  ).join("");
}

/** Avanza un slide — nunca se llama desde dentro de un gesto */
function _cAdvance() {
  if (_cDragging) return;
  const track = document.getElementById("carouselTrack");
  if (!track) return;
  _cIndex++;
  if (_cIndex >= track.querySelectorAll(".c-slide").length - CAROUSEL_BATCH) _cAppendBatch();
  _cPos(true);
  _cAutoReset();
}

/** Retrocede un slide */
function _cBack() {
  if (_cDragging) return;
  if (_cIndex <= 0) return;
  _cIndex--;
  _cPos(true);
  _cAutoReset();
}

window.carouselGoTo = function(dotI) {
  const track = document.getElementById("carouselTrack");
  if (!track) return;
  const slides    = track.querySelectorAll(".c-slide");
  const tandaBase = Math.floor(_cIndex / CAROUSEL_BATCH) * CAROUSEL_BATCH;
  const target    = tandaBase + dotI;
  if (target >= 0 && target < slides.length) {
    _cIndex = target; _cPos(true); _cAutoReset();
  }
};

window.carouselNext = function() { _cAdvance(); };
window.carouselPrev = function() { _cBack(); };

function _cAutoStart() {
  clearInterval(_cTimer);
  _cTimer = setInterval(_cAdvance, 3000);
}
function _cAutoReset() { clearInterval(_cTimer); _cAutoStart(); }

/**
 * Drag — un solo objeto `gesture` por gesto activo.
 * Los listeners de mouse se registran con AbortController
 * para que se limpien solos al terminar cada gesto.
 */
function _cDrag() {
  const outer = document.getElementById("carouselOuter");
  const track = document.getElementById("carouselTrack");
  if (!outer || !track) return;

  // ── Lógica compartida touch/mouse ────────────────────

  function onStart(clientX) {
    if (_cDragging) return;           // ignorar si ya hay un gesto activo
    _cDragging = true;
    clearInterval(_cTimer);
    track.style.transition = "none"; // detener cualquier animación en curso
    return {
      sx:      clientX,
      base:    _cIndex * (_cSlideW() || 0),
      moved:   false,
      done:    false,
    };
  }

  function onMove(g, clientX) {
    if (!g || g.done) return;
    const dx = clientX - g.sx;
    if (Math.abs(dx) > 6) g.moved = true;
    if (!g.moved) return;
    const w   = _cSlideW() || 1;
    const max = (track.querySelectorAll(".c-slide").length - 1) * w;
    const px  = Math.max(0, Math.min(g.base - dx, max));
    track.style.transform = `translateX(-${px}px)`;
  }

  function onEnd(g, clientX) {
    if (!g || g.done) return;
    g.done     = true;
    _cDragging = false;

    // Reactivar transición CSS antes del snap/avance
    track.style.transition = "";

    const dx  = clientX - g.sx;
    const thr = (_cSlideW() || 180) * 0.2;

    if (g.moved) {
      if      (dx < -thr) { _cIndex++; _cPos(true); }   // siguiente
      else if (dx >  thr) { if (_cIndex > 0) _cIndex--; _cPos(true); }  // anterior
      else                  _cPos(true);                  // snap
    } else {
      _cPos(true);  // sin movimiento: snap
    }

    // Comprobar si hay que precargar más después del snap
    const inDOM = track.querySelectorAll(".c-slide").length;
    if (_cIndex >= inDOM - CAROUSEL_BATCH) _cAppendBatch();

    _cAutoStart();
    // Trim siempre después de que termine la animación de snap (~420ms)
    setTimeout(_cDoTrim, 500);
  }

  // ── Touch ────────────────────────────────────────────
  let tGesture = null;

  outer.addEventListener("touchstart", e => {
    tGesture = onStart(e.touches[0].clientX);
  }, { passive: true });

  outer.addEventListener("touchmove", e => {
    onMove(tGesture, e.touches[0].clientX);
  }, { passive: true });

  outer.addEventListener("touchend", e => {
    onEnd(tGesture, e.changedTouches[0].clientX);
    tGesture = null;
  }, { passive: true });

  outer.addEventListener("touchcancel", () => {
    if (!tGesture) return;
    onEnd(tGesture, tGesture.sx);  // snap a posición original
    tGesture = null;
  }, { passive: true });

  // ── Mouse — AbortController limpia los listeners solos ──
  outer.addEventListener("mousedown", e => {
    if (e.button !== 0) return;
    e.preventDefault();

    const mGesture = onStart(e.clientX);
    if (!mGesture) return;

    const ctrl = new AbortController();
    const sig  = { signal: ctrl.signal };

    document.addEventListener("mousemove", ev => {
      onMove(mGesture, ev.clientX);
    }, sig);

    document.addEventListener("mouseup", ev => {
      onEnd(mGesture, ev.clientX);
      ctrl.abort();   // elimina mousemove y este mouseup de una vez
    }, { ...sig, once: true });
  });
}

/** Arranque inicial del carrusel */
function renderRecomendadas() {
  if (!ESCRITOS.length) return;
  const track = document.getElementById("carouselTrack");
  if (!track) return;

  // Reiniciar estado
  _cPool  = [...ESCRITOS].sort(() => Math.random() - 0.5);
  _cShown = new Set();
  _cIndex = 0;
  _cTotal = 0;
  track.innerHTML = "";

  // Precargar 3 tandas desde el inicio:
  // tanda 1 = visible ahora
  // tanda 2 = lista para cuando termine la 1
  // tanda 3 = lista para cuando termine la 2
  // → cuando el usuario llega a la mitad de la tanda 2, ya se carga la 4
  for (let t = 0; t < 3; t++) {
    const batch = _cNextItems(CAROUSEL_BATCH);
    batch.forEach((item, i) => track.appendChild(_cMakeSlide(item, _cTotal + i)));
    _cTotal += batch.length;
  }

  _cBuildDots();
  _cPos(false);
  _cAutoStart();
  _cDrag();
}

/** Botón shuffle — reinicia el carrusel con un orden nuevo */
window.shuffleCarousel = function() {
  const btn = document.querySelector(".btn-shuffle");
  if (btn) {
    btn.style.transform  = "rotate(360deg)";
    btn.style.transition = "transform 0.5s ease";
    setTimeout(() => { btn.style.transform = ""; btn.style.transition = ""; }, 500);
  }
  clearInterval(_cTimer);
  renderRecomendadas();
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
    // Multi-género: la obra debe tener TODOS los géneros seleccionados (AND)
    if (filters.generos.size > 0) {
      const itemGeneros = item.generos.map(g => g.toLowerCase());
      for (const g of filters.generos) {
        if (!itemGeneros.includes(g.toLowerCase())) return false;
      }
    }
    return true;
  });

  while (grid.firstChild && grid.firstChild !== _sentinel) grid.removeChild(grid.firstChild);
  _lazyLoaded = 0;

  count.textContent = `${_lazyItems.length} historia${_lazyItems.length !== 1 ? "s" : ""} encontrada${_lazyItems.length !== 1 ? "s" : ""}`;
  document.getElementById("emptyState").classList.toggle("hidden", _lazyItems.length > 0);

  loadNextBatch();
  initLazyObserver();
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
  const searchInput  = document.getElementById("searchInput");
  const clearBtn     = document.getElementById("clearBtn");
  const genresToggle = document.getElementById("genresToggle");
  const generoFilter = document.getElementById("generoFilter");

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

  generoFilter.addEventListener("click", e => {
    const tag = e.target.closest(".tag");
    if (!tag) return;
    const val = tag.dataset.value;

    if (val === "") {
      // "Todos" → limpiar selección
      filters.generos.clear();
      generoFilter.querySelectorAll(".tag").forEach(t => t.classList.remove("active"));
      tag.classList.add("active");
    } else {
      // Desmarcar "Todos"
      generoFilter.querySelector('.tag[data-value=""]')?.classList.remove("active");

      if (filters.generos.has(val)) {
        filters.generos.delete(val);
        tag.classList.remove("active");
        // Si no queda ninguno activo → volver a "Todos"
        if (filters.generos.size === 0) {
          generoFilter.querySelector('.tag[data-value=""]')?.classList.add("active");
        }
      } else {
        filters.generos.add(val);
        tag.classList.add("active");
      }
    }

    // Actualizar badge de conteo en el label
    _updateGenreCountBadge();
    render();
  });

  function _updateGenreCountBadge() {
    const label = document.querySelector(".filter-label");
    if (!label) return;
    const n = filters.generos.size;
    // Eliminar badge anterior si existe
    label.querySelector(".genre-count-badge")?.remove();
    if (n > 0) {
      const badge = document.createElement("span");
      badge.className = "genre-count-badge";
      badge.textContent = n;
      badge.style.cssText = `
        display:inline-flex;align-items:center;justify-content:center;
        background:var(--accent);color:#fff;font-size:.55rem;font-weight:700;
        width:16px;height:16px;border-radius:50%;margin-left:6px;vertical-align:middle;
      `;
      label.appendChild(badge);
    }
  }

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

  document.getElementById("modalClose").addEventListener("click", closeModal);
  modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

  document.getElementById("resetFilters").addEventListener("click", () => {
    searchInput.value = "";
    filters.query  = "";
    filters.generos.clear();
    clearBtn?.classList.remove("visible");
    generoFilter.querySelectorAll(".tag").forEach((t, i) => t.classList.toggle("active", i === 0));
    generoFilter.classList.remove("genres-expanded");
    generoFilter.classList.add("genres-collapsed");
    genresToggle.innerHTML = "Ver todos &#9662;";
    // Limpiar badge
    document.querySelector(".filter-label .genre-count-badge")?.remove();
    render();
  });
}

// Estilos del enlace de autor
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
