/**
 * ktt_storage.js — Almacenamiento persistente para Kotatsu
 * =========================================================
 * Capa principal : IndexedDB  (persiste entre recargas, navegaciones,
 *                               y vueltas desde otros paneles)
 * Capa fallback  : localStorage (por si el navegador bloquea IDB)
 *
 * API pública:
 *   await KttStorage.init()
 *   await KttStorage.get(key)           → valor | null
 *   await KttStorage.set(key, value)    → void
 *   await KttStorage.remove(key)        → void
 *   await KttStorage.getAccounts()      → Array
 *   await KttStorage.saveAccounts(arr)  → void
 *   await KttStorage.addAccount(obj)    → void   (upsert, max 15)
 *   await KttStorage.isRegistered()     → bool
 *   await KttStorage.setRegistered()    → void
 *   KttStorage.getSessionSync()         → { id, role, name, foto, email } | null
 *   KttStorage.saveSessionSync(obj)     → void
 *   KttStorage.clearSessionSync()       → void
 */

const KttStorage = (() => {
  const DB_NAME    = "kotatsu_db";
  const DB_VERSION = 1;
  const STORE      = "kv";           // object store genérico key-value
  const MAX_ACCS   = 15;

  // Claves canónicas
  const K = {
    REGISTERED : "ktt_device_registered",
    ACCOUNTS   : "ktt_device_accounts",
    SESSION_ID  : "ktt_id",
    SESSION_ROLE: "ktt_role",
    SESSION_USER: "ktt_user",
    SESSION_FOTO: "ktt_foto",
    SESSION_MAIL: "ktt_email",
  };

  let _db = null;          // instancia de IDBDatabase
  let _useIDB = true;      // false si IDB no está disponible

  // ─── Abrir / crear DB ───────────────────────────────────
  function _openDB() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) { _useIDB = false; resolve(null); return; }

      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "k" });
        }
      };

      req.onsuccess = e => { _db = e.target.result; resolve(_db); };

      req.onerror = () => {
        console.warn("[KttStorage] IndexedDB no disponible, usando localStorage.");
        _useIDB = false;
        resolve(null);
      };

      // Algunos browsers en modo privado lanzan esto en lugar de onerror
      req.onblocked = () => { _useIDB = false; resolve(null); };
    });
  }

  // ─── IDB helpers ────────────────────────────────────────
  function _idbGet(key) {
    return new Promise((resolve) => {
      try {
        const tx  = _db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).get(key);
        req.onsuccess = () => resolve(req.result ? req.result.v : null);
        req.onerror   = () => resolve(null);
      } catch { resolve(null); }
    });
  }

  function _idbSet(key, value) {
    return new Promise((resolve) => {
      try {
        const tx  = _db.transaction(STORE, "readwrite");
        const req = tx.objectStore(STORE).put({ k: key, v: value });
        req.onsuccess = () => resolve();
        req.onerror   = () => { _lsSet(key, value); resolve(); };
        tx.onerror    = () => { _lsSet(key, value); resolve(); };
      } catch { _lsSet(key, value); resolve(); }
    });
  }

  function _idbRemove(key) {
    return new Promise((resolve) => {
      try {
        const tx  = _db.transaction(STORE, "readwrite");
        const req = tx.objectStore(STORE).delete(key);
        req.onsuccess = () => resolve();
        req.onerror   = () => resolve();
      } catch { resolve(); }
    });
  }

  // ─── localStorage helpers ───────────────────────────────
  function _lsGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  function _lsSet(key, value) {
    try { localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value)); } catch {}
  }
  function _lsRemove(key) {
    try { localStorage.removeItem(key); } catch {}
  }

  // ─── Serialización ──────────────────────────────────────
  function _serialize(value) {
    if (typeof value === "string") return value;
    return JSON.stringify(value);
  }
  function _deserialize(raw) {
    if (raw === null || raw === undefined) return null;
    try { return JSON.parse(raw); } catch { return raw; }
  }

  // ═══════════════════════════════════════════════════════
  //  API PÚBLICA
  // ═══════════════════════════════════════════════════════

  /**
   * Inicializa la DB. Llama esto UNA vez al arrancar la app.
   * También migra datos antiguos de localStorage → IDB.
   */
  async function init() {
    await _openDB();
    if (_useIDB && _db) {
      await _migrateFromLS();
    }
  }

  /** Migración one-shot: copia claves antiguas de LS → IDB */
  async function _migrateFromLS() {
    const migrated = await _idbGet("__migrated__");
    if (migrated) return;   // ya migrado

    const keysToMigrate = [K.REGISTERED, K.ACCOUNTS, K.SESSION_ID, K.SESSION_ROLE, K.SESSION_USER, K.SESSION_FOTO, K.SESSION_MAIL];
    for (const key of keysToMigrate) {
      const lsVal = _lsGet(key);
      if (lsVal !== null) {
        await _idbSet(key, lsVal);
      }
    }
    await _idbSet("__migrated__", "1");
  }

  /** Lee un valor crudo (string o parsed JSON) */
  async function get(key) {
    if (_useIDB && _db) {
      const raw = await _idbGet(key);
      return _deserialize(raw);
    }
    return _deserialize(_lsGet(key));
  }

  /** Guarda un valor. Si es objeto/array, lo serializa. */
  async function set(key, value) {
    const serial = _serialize(value);
    if (_useIDB && _db) {
      await _idbSet(key, serial);
    }
    // Siempre también en LS como backup de la sesión activa
    _lsSet(key, serial);
  }

  /** Elimina una clave */
  async function remove(key) {
    if (_useIDB && _db) await _idbRemove(key);
    _lsRemove(key);
  }

  // ─── Cuentas del dispositivo ────────────────────────────

  /** Devuelve el array de cuentas guardadas */
  async function getAccounts() {
    const raw = await get(K.ACCOUNTS);
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string") {
      try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
    }
    return [];
  }

  /** Sobreescribe el array completo de cuentas */
  async function saveAccounts(arr) {
    if (!Array.isArray(arr)) arr = [];
    await set(K.ACCOUNTS, JSON.stringify(arr));
  }

  /**
   * Upsert de una cuenta. Si ya existe el email → actualiza.
   * Si está lleno → descarta el más antiguo (FIFO).
   */
  async function addAccount({ nombre, email, foto, rol }) {
    const accounts = await getAccounts();
    const idx = accounts.findIndex(a => a.email === email);
    if (idx >= 0) {
      Object.assign(accounts[idx], { nombre, foto: foto || "", rol: rol || "user" });
    } else {
      if (accounts.length >= MAX_ACCS) accounts.shift();
      accounts.push({ nombre, email, foto: foto || "", rol: rol || "user" });
    }
    await saveAccounts(accounts);
    return accounts;
  }

  /** ¿Ya se registró una cuenta en este dispositivo? */
  async function isRegistered() {
    const val = await get(K.REGISTERED);
    return val === "true" || val === true;
  }

  /** Marca el dispositivo como ya registrado */
  async function setRegistered() {
    await set(K.REGISTERED, "true");
  }

  // ─── Sesión activa (síncrono vía LS para rapidez) ───────
  // La sesión debe leerse de forma síncrona al cargar cada panel
  // para evitar flickers. IDB es async, así que la sesión
  // también se mantiene siempre en localStorage como caché rápido.

  function getSessionSync() {
    const id = _lsGet(K.SESSION_ID);
    if (!id) return null;
    return {
      id   : id,
      role : _lsGet(K.SESSION_ROLE) || "user",
      name : _lsGet(K.SESSION_USER) || "",
      foto : _lsGet(K.SESSION_FOTO) || "",
      email: _lsGet(K.SESSION_MAIL) || "",
    };
  }

  function saveSessionSync({ idAutor, nombre, foto, rol, email }) {
    _lsSet(K.SESSION_ID,   idAutor  || "");
    _lsSet(K.SESSION_ROLE, rol      || "user");
    _lsSet(K.SESSION_USER, nombre   || "");
    _lsSet(K.SESSION_FOTO, foto     || "");
    _lsSet(K.SESSION_MAIL, email    || "");
    // También en IDB (async, no bloqueante)
    if (_useIDB && _db) {
      _idbSet(K.SESSION_ID,   idAutor  || "");
      _idbSet(K.SESSION_ROLE, rol      || "user");
      _idbSet(K.SESSION_USER, nombre   || "");
      _idbSet(K.SESSION_FOTO, foto     || "");
      _idbSet(K.SESSION_MAIL, email    || "");
    }
  }

  function clearSessionSync() {
    [K.SESSION_ID, K.SESSION_ROLE, K.SESSION_USER, K.SESSION_FOTO, K.SESSION_MAIL].forEach(k => {
      _lsRemove(k);
      if (_useIDB && _db) _idbRemove(k);
    });
  }

  // ─── Exponer ────────────────────────────────────────────
  return {
    init,
    get, set, remove,
    getAccounts, saveAccounts, addAccount,
    isRegistered, setRegistered,
    getSessionSync, saveSessionSync, clearSessionSync,
    MAX_ACCS,
  };
})();

// Exportar para uso como módulo ES y también como global
if (typeof module !== "undefined") module.exports = KttStorage;
export default KttStorage;
export { KttStorage };
