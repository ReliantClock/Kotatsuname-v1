/**
 * ============================================================
 *  escritos_data.js — Base de datos pública de escritos
 * ============================================================
 *  Columnas del Sheet (fila 1 = encabezados):
 *
 *  id | id_autor | titulo | autor | estado | generos |
 *  capitulos | cover | sinopsis | aprobacion |
 *  cap1 | cap2 | ... | cap50
 *
 *  Cada celda capN: "nombre del capítulo|link del doc"
 *
 *  aprobacion puede ser:
 *    "aprobado" / "true"  → visible en catálogo público
 *    "pendiente"          → solo visible para el autor y staff
 *    "suspension"         → oculta, suspendida por staff
 *    "rechazado"          → oculta, rechazada
 * ============================================================
 */

const SHEET_PUBHTML =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSTyCRzS3YkbgjczP4VwnO1dK-ApKII0dNAG-hXpEHtirhiDnFR5xhRcpkrafO4ufKn5Hscu2ANIJX0/pubhtml";

const SHEET_ID  = SHEET_PUBHTML.match(/\/d\/e\/([^/]+)/)?.[1] ?? "";
const SHEET_URL = `https://docs.google.com/spreadsheets/d/e/${SHEET_ID}/pub?output=csv`;

export const MAX_CAPS = 50;

// ─────────────────────────────────────────────
//  Normaliza un header del Sheet a clave limpia
//  "Id Autor" → "id_autor"
// ─────────────────────────────────────────────
function normalizeHeader(h) {
  return h
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

// ─────────────────────────────────────────────
//  Drive → URL de imagen visible
// ─────────────────────────────────────────────
export function fixCoverUrl(cover) {
  if (!cover) return "";
  if (!cover.startsWith("http")) {
    const direct = `https://drive.google.com/uc?export=view&id=${cover}`;
    return `https://wsrv.nl/?url=${encodeURIComponent(direct)}&w=400&output=webp`;
  }
  const m = cover.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m) {
    const direct = `https://drive.google.com/uc?export=view&id=${m[1]}`;
    return `https://wsrv.nl/?url=${encodeURIComponent(direct)}&w=400&output=webp`;
  }
  // Si ya es un link de uc?export=view o similar, envolverlo en wsrv igual
  if (cover.includes("drive.google.com")) {
    return `https://wsrv.nl/?url=${encodeURIComponent(cover)}&w=400&output=webp`;
  }
  return cover;
}

// ─────────────────────────────────────────────
//  Google Doc link → URL de texto exportable
// ─────────────────────────────────────────────
export function docLinkToTextUrl(link) {
  if (!link || !link.trim()) return null;
  link = link.trim();
  const m  = link.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  const id = m ? m[1] : link;
  if (!id) return null;
  return `https://docs.google.com/document/d/${id}/export?format=txt`;
}

// ─────────────────────────────────────────────
//  Parser CSV — respeta comas dentro de "..."
// ─────────────────────────────────────────────
function parseCSVLine(line) {
  const result = [];
  let current  = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// ─────────────────────────────────────────────
//  Convierte fila CSV → objeto de escrito
// ─────────────────────────────────────────────
function parseRow(headers, values) {
  const row = {};
  headers.forEach((h, i) => {
    const key = normalizeHeader(h);
    row[key]  = (values[i] ?? "").trim();
  });

  const splitList = val =>
    val ? val.split(",").map(s => s.trim()).filter(Boolean) : [];

  // ── Capítulos cap1..cap50 ──
  const capitulos = [];
  for (let i = 1; i <= MAX_CAPS; i++) {
    const raw = row[`cap${i}`] || "";
    if (!raw) continue;

    const pipeIdx = raw.indexOf("|");
    const nombre  = pipeIdx >= 0 ? raw.slice(0, pipeIdx).trim() : `Capítulo ${i}`;
    const link    = pipeIdx >= 0 ? raw.slice(pipeIdx + 1).trim() : raw.trim();

    capitulos.push({
      numero  : i,
      nombre,
      urlTexto: docLinkToTextUrl(link),
      rawLink : link,
    });
  }

  const capCount    = Number(row.capitulos) || capitulos.length || 0;
  const idAutorRaw  = row["id_autor"] || "";
  const aprobacion  = (row.aprobacion || "pendiente").trim().toLowerCase();

  return {
    id          : Number(row.id) || 0,
    id_autor    : String(idAutorRaw),
    titulo      : row.titulo    || "Sin título",
    autor       : row.autor     || "Anónimo",
    estado      : row.estado    || "en emisión",
    generos     : splitList(row.generos),
    capitulos   : capCount,
    cover       : fixCoverUrl(row.cover || ""),
    raw_cover   : row.cover     || "",
    sinopsis    : row.sinopsis  || "Sin sinopsis.",
    aprobacion,
    caps        : capitulos,
  };
}

// ─────────────────────────────────────────────
//  Cache en memoria (evita múltiples fetches
//  durante la misma sesión de página)
// ─────────────────────────────────────────────
let _cache     = null;
let _cacheTime = 0;
const CACHE_TTL = 60_000; // 1 minuto

// ─────────────────────────────────────────────
//  Carga desde Google Sheets
//  @param {boolean} soloAprobadas  — si true filtra obras no aprobadas
//                                    (útil para catálogo público)
//                                    si false devuelve todo (útil para staff/panel)
// ─────────────────────────────────────────────
export async function loadEscritos({ soloAprobadas = false } = {}) {
  try {
    const now = Date.now();

    // Usar caché si es reciente
    if (_cache && (now - _cacheTime) < CACHE_TTL) {
      return soloAprobadas ? _filterAprobadas(_cache) : _cache;
    }

    const url = `${SHEET_URL}&_t=${now}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const text  = await res.text();
    const lines = text.trim().split("\n").filter(l => l.trim());
    if (lines.length < 2) throw new Error("Sheet vacío");

    const headers = parseCSVLine(lines[0]);
    const todos   = lines
      .slice(1)
      .map(line => parseRow(headers, parseCSVLine(line)))
      .filter(item => item.id > 0);

    _cache     = todos;
    _cacheTime = now;

    return soloAprobadas ? _filterAprobadas(todos) : todos;

  } catch (err) {
    console.error("Error cargando escritos:", err.message);
    return [];
  }
}

// ─────────────────────────────────────────────
//  Filtra solo obras visibles en el catálogo
//  público (aprobado o sin estado definido)
// ─────────────────────────────────────────────
function _filterAprobadas(lista) {
  return lista.filter(item => {
    const ap = item.aprobacion;
   // return ap === "aprobado" || ap === "true" || ap === "" || ap === "pendiente";
    // "pendiente" se mantiene visible hasta que el staff la suspenda explícitamente
    // Si quieres que solo las "aprobado" aparezcan, cambia la línea a:
    return ap === "aprobado" || ap === "true";
  });
}

// ─────────────────────────────────────────────
//  Limpia el caché (útil tras guardar cambios)
// ─────────────────────────────────────────────
export function clearCache() {
  _cache     = null;
  _cacheTime = 0;
}
