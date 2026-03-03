/**
 * ============================================================
 * escritos_buscador.js — Optimizado: Carrusel 6 & Lazy Load
 * ============================================================
 */
import { loadEscritos } from "./escritos_data.js";

let ESCRITOS = [];
let filteredEscritos = []; 
const filters = { query: "", genero: "" };

// Configuración de Lazy Load
let itemsToShow = 12; 
const increment = 10; // Cuántos cargar al hacer scroll

const grid  = document.getElementById("resultsGrid");
const count = document.getElementById("resultCount");
const modal = document.getElementById("modal");

// ─────────────────────────────────────────────
//  INICIALIZACIÓN
// ─────────────────────────────────────────────
async function init() {
  count.textContent = "Cargando biblioteca...";
  const data = await loadEscritos();
  
  // Solo mostrar obras aprobadas
  ESCRITOS = data.filter(e => {
    const ap = (e.aprobacion || "").toLowerCase();
    return ap === "aprobado" || ap === "true" || ap === "";
  });

  setupEventListeners();
  applyFiltersAndRender(); 
  renderRecomendadas();
  setupLazyLoad(); 

  // Inyectar estilos para el efecto de "luces" (secuencial)
  const style = document.createElement("style");
  style.textContent = `
    .card {
      opacity: 0;
      transform: translateY(20px);
      transition: opacity 0.6s ease, transform 0.6s ease;
    }
    .card.visible {
      opacity: 1;
      transform: translateY(0);
    }
    .author-link {
      color: var(--accent3); text-decoration: none; font-weight: 700;
      border-bottom: 1px dashed var(--accent3); transition: 0.2s;
    }
    .author-link:hover { color: #fff; border-bottom-color: #fff; }
    #lazy-sentinel { height: 50px; width: 100%; margin-top: 20px; }
  `;
  document.head.appendChild(style);
}

// ═══════════════════════════════════════════════════════
//  CARRUSEL (LIMITADO A 6 PARA EVITAR LAG)
// ═══════════════════════════════════════════════════════
let _cPicks  = [];   
let _cIndex  = 0;    
let _cTimer  = null; 

function renderRecomendadas() {
  if (!ESCRITOS.length) return;
  _cIndex = 0;
  // Solo escogemos 6 para mayor fluidez
  _cPicks = [...ESCRITOS].sort(() => Math.random() - 0.5).slice(0, 6);
  _cBuild();
}

function _cBuild() {
  const track = document.getElementById("carouselTrack");
  const dots  = document.getElementById("carouselDots");
  if (!track) return;

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
      `<button class="c-dot${i === 0 ? " active" : ""}" onclick="carouselGoTo(${i})" aria-label="Slide ${i+1}"></button>`
    ).join("");
  }

  track.querySelectorAll(".c-slide").forEach(s =>
    s.addEventListener("click", () => { const item = _cPicks[+s.dataset.i]; if (item) openModal(item); })
  );

  _cPos(false);
  _cAutoStart();
  _cDrag();
}

window.carouselGoTo = function(i) {
  _cIndex = Math.max(0, Math.min(i, _cPicks.length - 1));
  _cPos(true); _cAutoReset();
};
window.carouselNext = function() {
  _cIndex = (_cIndex + 1) % _cPicks.length;
  _cPos(true); _cAutoReset();
};
window.carouselPrev = function() {
  _cIndex = (_cIndex - 1 + _cPicks.length) % _cPicks.length;
  _cPos(true); _cAutoReset();
};

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
    if (dx < -thr) _cIndex = Math.min(_cIndex + 1, _cPicks.length - 1);
    else if (dx > thr) _cIndex = Math.max(_cIndex - 1, 0);
    _cPos(true); _cAutoStart();
  };

  outer.addEventListener("touchstart", e => start(e.touches[0].clientX), { passive: true });
  outer.addEventListener("touchmove", e => move(e.touches[0].clientX), { passive: true });
  outer.addEventListener("touchend", e => end(e.changedTouches[0].clientX), { passive: true });
  outer.addEventListener("mousedown", e => { start(e.clientX); e.preventDefault(); });
  window.addEventListener("mousemove", e => move(e.clientX));
  window.addEventListener("mouseup", e => end(e.clientX));
}

window.shuffleCarousel = function() {
  const btn = document.querySelector(".btn-shuffle");
  if (btn) {
    btn.style.transform = "rotate(360deg)";
    btn.style.transition = "transform 0.5s ease";
    setTimeout(() => { btn.style.transform = ""; btn.style.transition = ""; }, 500);
  }
  clearInterval(_cTimer);
  _cIndex = 0;
  _cPicks = [...ESCRITOS].sort(() => Math.random() - 0.5).slice(0, 6);
  _cBuild();
};

// ─────────────────────────────────────────────
//  LAZY LOAD Y EFECTO DE APARICIÓN SECUENCIAL
// ─────────────────────────────────────────────

function applyFiltersAndRender() {
  filteredEscritos = ESCRITOS.filter(item => {
    const q = filters.query.toLowerCase();
    if (q && !item.titulo.toLowerCase().includes(q) && !item.autor.toLowerCase().includes(q)) return false;
    if (filters.genero && !item.generos.map(g => g.toLowerCase()).includes(filters.genero.toLowerCase())) return false;
    return true;
  });

  grid.innerHTML = "";
  count.textContent = `${filteredEscritos.length} historia${filteredEscritos.length !== 1 ? "s" : ""} encontrada${filteredEscritos.length !== 1 ? "s" : ""}`;
  document.getElementById("emptyState").classList.toggle("hidden", filteredEscritos.length > 0);

  renderNextBlock();
}

function renderNextBlock() {
  const start = grid.querySelectorAll(".card").length;
  const end = Math.min(start + increment, filteredEscritos.length);
  const chunk = filteredEscritos.slice(start, end);

  chunk.forEach((item, i) => {
    const card = document.createElement("div");
    card.className = "card";

    const genresHtml = item.generos.slice(0, 3)
      .map(g => `<span class="card-genre">${g}</span>`).join("");

    card.innerHTML = `
      <div class="card-cover">
        ${item.cover ? `<img class="card-cover-img" src="${item.cover}" alt="${item.titulo}" loading="lazy" />` : `<span></span>`}
      </div>
      <div class="card-body">
        <div class="card-title">${item.titulo}</div>
        <div class="card-meta">${genresHtml}</div>
        <div class="card-seasons"> ${item.capitulos} cap${item.capitulos !== 1 ? "s" : ""}.</div>
      </div>
    `;
    
    card.addEventListener("click", () => openModal(item));
    grid.appendChild(card);

    // EFECTO "ENCENDER LUCES": Delay progresivo para cada tarjeta del bloque
    setTimeout(() => {
      card.classList.add("visible");
    }, i * 100); // 100ms de diferencia entre cada una
  });
}

function setupLazyLoad() {
  // Crear centinela si no existe
  let sentinel = document.getElementById("lazy-sentinel");
  if (!sentinel) {
    sentinel = document.createElement("div");
    sentinel.id = "lazy-sentinel";
    grid.after(sentinel);
  }

  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && filteredEscritos.length > grid.querySelectorAll(".card").length) {
      renderNextBlock();
    }
  }, { rootMargin: "150px" });

  observer.observe(sentinel);
}

// ─────────────────────────────────────────────
//  MODAL Y EVENTOS
// ─────────────────────────────────────────────
function openModal(item) {
  document.getElementById("modalTitle").textContent    = item.titulo;
  document.getElementById("modalSinopsis").textContent = item.sinopsis;
  document.getElementById("modalCover").innerHTML      = item.cover ? `<img src="${item.cover}" alt="${item.titulo}" />` : "";
  const authorId = item.id_autor || "";
  document.getElementById("modalBadge").innerHTML = `Autor: <a href="perfil_autor.html?id=${encodeURIComponent(authorId)}" class="author-link">${item.autor}</a>`;
  document.getElementById("modalTags").innerHTML = item.generos.map(g => `<span class="modal-tag">${g}</span>`).join("");
  const statusMap = { completado:"✓ Completado", "en pausa":"En Pausa", "en emisión":"En Emisión" };
  document.getElementById("modalSeasons").textContent = `${item.capitulos} capítulos · ${statusMap[item.estado.toLowerCase()] || item.estado}`;
  document.getElementById("modalBtns").innerHTML = `<a href="escritos_capitulos.html?id=${item.id}" class="modal-btn modal-btn--manga">Ver Capítulos</a>`;

  modal.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  modal.classList.remove("open");
  document.body.style.overflow = "";
}

function setupEventListeners() {
  document.getElementById("searchInput").addEventListener("input", e => {
    filters.query = e.target.value;
    document.getElementById("clearBtn")?.classList.toggle("visible", !!e.target.value);
    applyFiltersAndRender();
  });

  document.getElementById("clearBtn")?.addEventListener("click", () => {
    document.getElementById("searchInput").value = "";
    filters.query = "";
    applyFiltersAndRender();
  });

  document.getElementById("generoFilter").addEventListener("click", e => {
    const tag = e.target.closest(".tag");
    if (!tag) return;
    document.querySelectorAll("#generoFilter .tag").forEach(t => t.classList.remove("active"));
    tag.classList.add("active");
    filters.genero = tag.dataset.value;
    applyFiltersAndRender();
  });

  const genresToggle = document.getElementById("genresToggle");
  if (genresToggle) {
    genresToggle.addEventListener("click", () => {
      const isExpanded = document.getElementById("generoFilter").classList.toggle("genres-expanded");
      document.getElementById("generoFilter").classList.toggle("genres-collapsed", !isExpanded);
      genresToggle.textContent = isExpanded ? "Ver menos ▴" : "Ver todos ▾";
    });
  }

  document.getElementById("modalClose").addEventListener("click", closeModal);
  modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
  document.getElementById("resetFilters").addEventListener("click", () => {
    location.reload(); // Forma más limpia de resetear todo el estado
  });
}

init();
