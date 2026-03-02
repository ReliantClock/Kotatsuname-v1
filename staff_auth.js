/**
 * ============================================================
 *  staff_auth.js — Sistema de dominios y autenticación Staff
 * ============================================================
 *  Dominios válidos:
 *   @gmail.com         → usuario/autor común
 *   @kots-stf-mod.com  → Moderador
 *   @kots-stf-adm.com  → Administrador
 *   @kots-stf-owner.kotatsuname.com → Dueño/Owner
 *
 *  Cualquier otro dominio → inválido
 * ============================================================
 */

export const DOMAINS = {
  user:  "@gmail.com",
  mod:   "@kots-stf-mod.com",
  admin: "@kots-stf-adm.com",
  owner: "@kots-stf-owner.kotatsuname.com",
};

export const ROLES = {
  user:  "usuario",
  mod:   "moderador",
  admin: "administrador",
  owner: "dueño",
};

/**
 * Detecta el rol según el dominio del email.
 * @param {string} email
 * @returns {{ role: string, label: string, valid: boolean }}
 */
export function detectRole(email) {
  if (!email || !email.includes("@")) {
    return { role: null, label: null, valid: false };
  }
  const lower = email.trim().toLowerCase();

  if (lower.endsWith(DOMAINS.owner)) return { role: "owner", label: ROLES.owner, valid: true };
  if (lower.endsWith(DOMAINS.admin)) return { role: "admin", label: ROLES.admin, valid: true };
  if (lower.endsWith(DOMAINS.mod))   return { role: "mod",   label: ROLES.mod,   valid: true };
  if (lower.endsWith(DOMAINS.user))  return { role: "user",  label: ROLES.user,  valid: true };

  return { role: null, label: null, valid: false };
}

/**
 * Redirige al panel correcto según el rol guardado en localStorage.
 * Llama desde cualquier página protegida.
 */
export function redirectByRole() {
  const role = localStorage.getItem("ktt_role");
  const id   = localStorage.getItem("ktt_id");
  if (!id) { window.location.href = "registrarse.html"; return; }

  switch (role) {
    case "owner": window.location.href = "panel_owner.html";  break;
    case "admin": window.location.href = "panel_admin.html";  break;
    case "mod":   window.location.href = "panel_mod.html";    break;
    default:      window.location.href = "panel_autor.html";  break;
  }
}

/**
 * Verifica que el usuario logueado tenga el rol requerido.
 * Si no, redirige al panel correcto.
 * @param {string|string[]} requiredRole
 */
export function requireRole(requiredRole) {
  const id   = localStorage.getItem("ktt_id");
  const role = localStorage.getItem("ktt_role") || "user";

  if (!id) { window.location.href = "registrarse.html"; return false; }

  const allowed = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
  if (!allowed.includes(role)) {
    redirectByRole();
    return false;
  }
  return true;
}

/**
 * Guarda la sesión en localStorage.
 */
export function saveSession(data) {
  localStorage.setItem("ktt_id",    data.idAutor  || data.idStaff || "");
  localStorage.setItem("ktt_user",  data.nombre   || "");
  localStorage.setItem("ktt_foto",  data.foto     || "");
  localStorage.setItem("ktt_role",  data.rol      || "user");
  localStorage.setItem("ktt_email", data.email    || "");
}

export function clearSession() {
  ["ktt_id","ktt_user","ktt_foto","ktt_role","ktt_email"].forEach(k => localStorage.removeItem(k));
}
