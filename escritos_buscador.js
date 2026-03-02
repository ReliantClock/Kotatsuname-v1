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

// ─────────────────────────────────────────────
//  RECOMENDADAS AL AZAR
// ─────────────────────────────────────────────
function renderRecomendadas() {
  const grid = document.getElementById("recGrid");
  if (!grid) return;

  if (ESCRITOS.length === 0) {
    grid.innerHTML = `<p style="color:var(--text-muted);grid-column:1/-1;text-align:center;padding:20px;">No hay obras disponibles.</p>`;
    return;
  }

  const shuffled = [...ESCRITOS].sort(() => Math.random() - 0.5);
  const picks    = shuffled.slice(0, Math.min(6, ESCRITOS.length));

  grid.innerHTML = picks.map((item, i) => {
    const genresHtml = item.generos.slice(0, 2).map(g => `<span class="card-genre">${g}</span>`).join("");
    return `
      <div class="card" style="animation-delay:${i*60}ms" data-id="${item.id}">
        <div class="card-cover">
          ${item.cover
            ? `<img class="card-cover-img" src="${item.cover}" alt="${item.titulo}" loading="lazy" />`
            : `<span></span>`}
        </div>
        <div class="card-body">
          <div class="card-title">${item.titulo}</div>
          <div class="card-meta">${genresHtml}</div>
          <div class="card-seasons">${item.capitulos} cap${item.capitulos !== 1 ? "s" : ""}.</div>
        </div>
      </div>`;
  }).join("");

  // Click en card recomendada
  grid.querySelectorAll(".card").forEach(card => {
    card.addEventListener("click", () => {
      const item = ESCRITOS.find(e => String(e.id) === card.dataset.id);
      if (item) openModal(item);
    });
  });
}

window.shuffleRecomendadas = function() {
  const btn = document.querySelector(".rec-refresh");
  if (btn) {
    btn.style.transform = "rotate(360deg)";
    btn.style.transition = "transform 0.4s ease";
    setTimeout(() => { btn.style.transform = ""; }, 400);
  }
  renderRecomendadas();
};

// ─────────────────────────────────────────────
//  RENDER — cards de la biblioteca
// ─────────────────────────────────────────────
function render() {
  const filtered = ESCRITOS.filter(item => {
    const q = filters.query.toLowerCase();
    if (q && !item.titulo.toLowerCase().includes(q) && !item.autor.toLowerCase().includes(q)) return false;
    if (filters.genero && !item.generos.map(g => g.toLowerCase()).includes(filters.genero.toLowerCase())) return false;
    return true;
  });

  grid.innerHTML = "";
  count.textContent = `${filtered.length} historia${filtered.length !== 1 ? "s" : ""} encontrada${filtered.length !== 1 ? "s" : ""}`;
  document.getElementById("emptyState").classList.toggle("hidden", filtered.length > 0);

  filtered.forEach((item, i) => {
    const card = document.createElement("div");
    card.className = "card";
    card.style.animationDelay = `${i * 40}ms`;

    const genresHtml = item.generos.slice(0, 3)
      .map(g => `<span class="card-genre">${g}</span>`).join("");

    card.innerHTML = `
      <div class="card-cover">
        ${item.cover
          ? `<img class="card-cover-img" src="${item.cover}" alt="${item.titulo}" loading="lazy" />`
          : `<span>📖</span>`}
      </div>
      <div class="card-body">
        <div class="card-title">${item.titulo}</div>
        <div class="card-meta">${genresHtml}</div>
        <div class="card-seasons"> ${item.capitulos} cap${item.capitulos !== 1 ? "s" : ""}.</div>
      </div>
    `;
    card.addEventListener("click", () => openModal(item));
    grid.appendChild(card);
  });
}

// ─────────────────────────────────────────────
//  MODAL — ficha del escrito
// ─────────────────────────────────────────────
function openModal(item) {
  document.getElementById("modalTitle").textContent    = item.titulo;
  document.getElementById("modalSinopsis").textContent = item.sinopsis;
  document.getElementById("modalCover").innerHTML      = item.cover
    ? `<img src="${item.cover}" alt="${item.titulo}" />`
    : "";

  // Badge con enlace al autor
  const authorId = item.id_autor || "";
  document.getElementById("modalBadge").innerHTML =
    `Autor: <a href="perfil_autor.html?id=${encodeURIComponent(authorId)}" class="author-link">${item.autor}</a>`;

  // Tags de géneros
  document.getElementById("modalTags").innerHTML = item.generos
    .map(g => `<span class="modal-tag">${g}</span>`).join("");

  // Info de capítulos y estado
  const statusMap = { completado:"Completado", "en pausa":"En Pausa", "en emisión":"En Emisión" };
  const st = (item.estado || "").toLowerCase();
  document.getElementById("modalSeasons").textContent =
    `${item.capitulos} capítulos · ${statusMap[st] || item.estado || ""}`;

  // Botón
  const btns = document.getElementById("modalBtns");
  btns.innerHTML = `<a href="escritos_capitulos.html?id=${item.id}" class="modal-btn modal-btn--manga">Ver Capítulos</a>`;

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
  // Búsqueda
  document.getElementById("searchInput").addEventListener("input", e => {
    filters.query = e.target.value;
    const clearBtn = document.getElementById("clearBtn");
    if (clearBtn) clearBtn.classList.toggle("visible", !!e.target.value);
    render();
  });

  // Clear
  document.getElementById("clearBtn").addEventListener("click", () => {
    const inp = document.getElementById("searchInput");
    inp.value = "";
    filters.query = "";
    document.getElementById("clearBtn").classList.remove("visible");
    render();
  });

  // Géneros
  document.getElementById("generoFilter").addEventListener("click", e => {
    const tag = e.target.closest(".tag");
    if (!tag) return;
    document.querySelectorAll("#generoFilter .tag").forEach(t => t.classList.remove("active"));
    tag.classList.add("active");
    filters.genero = tag.dataset.value;
    render();
  });

  // Toggle géneros
  const genresToggle = document.getElementById("genresToggle");
  const generoFilter = document.getElementById("generoFilter");
  if (genresToggle && generoFilter) {
    genresToggle.addEventListener("click", () => {
      const isExpanded = generoFilter.classList.toggle("genres-expanded");
      generoFilter.classList.toggle("genres-collapsed", !isExpanded);
      genresToggle.textContent = isExpanded ? "Ver menos ▴" : "Ver todos ▾";
    });
  }

  // Cerrar modal
  document.getElementById("modalClose").addEventListener("click", closeModal);
  modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

  // Reset
  document.getElementById("resetFilters").addEventListener("click", () => {
    document.getElementById("searchInput").value = "";
    filters.query  = "";
    filters.genero = "";
    document.getElementById("clearBtn")?.classList.remove("visible");
    document.querySelectorAll("#generoFilter .tag").forEach((t, i) =>
      t.classList.toggle("active", i === 0));
    render();
  });
}

// Estilo para el enlace del autor en el modal
const style = document.createElement("style");
style.textContent = `
  .author-link {
    color: var(--accent3); text-decoration: none; font-weight: 700;
    border-bottom: 1px dashed var(--accent3); transition: 0.2s;
  }
  .author-link:hover { color: #fff; border-bottom-color: #fff; }
`;
document.head.appendChild(style);

init();
