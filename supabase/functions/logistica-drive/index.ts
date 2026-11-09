// Función de Supabase: lee el Excel "ENTREGAS GRANJA SUNL" directo del Google Drive y lo guarda en logistica.entregas.
// La app la llama cada vez que alguien entra, así siempre se ve lo que hay en el Drive en ese momento.
//
// - Solo la puede llamar una sesión de una cuenta que esté en logistica.usuarios (se revisa con logistica_acceso()).
// - Entra al Drive con una cuenta de servicio de Google (robot) con permiso de SOLO LECTURA (drive.readonly).
//   Su llave vive en el secreto GOOGLE_SA_JSON de Supabase; nunca en el código ni en el repo.
// - El archivo se escoge con el secreto LOGISTICA_FILE_ID (si no existe, usa el de abajo).
// - No escribe nada en el Drive.
import * as XLSX from "npm:xlsx@0.18.5";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { leerVentas } from "./excel.js";

const ARCHIVO = Deno.env.get("LOGISTICA_FILE_ID") || "18c-Xbt9d8ml0QaI1Xh9Du68uAcXGUiNU";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function responder(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// ---------- Google: token de la cuenta de servicio (JWT firmado con RS256) ----------
function b64url(datos: ArrayBuffer | Uint8Array | string) {
  const bytes = typeof datos === "string" ? new TextEncoder().encode(datos) : new Uint8Array(datos);
  let s = ""; bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function tokenGoogle() {
  const crudo = Deno.env.get("GOOGLE_SA_JSON");
  if (!crudo) throw new Error("Falta el secreto GOOGLE_SA_JSON en Supabase");
  const sa = JSON.parse(crudo);
  const ahora = Math.floor(Date.now() / 1000);
  const cabeza = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const cuerpo = b64url(JSON.stringify({
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/drive.readonly",
    aud: "https://oauth2.googleapis.com/token", iat: ahora, exp: ahora + 3600,
  }));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const llave = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const firma = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", llave, new TextEncoder().encode(cabeza + "." + cuerpo));
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: cabeza + "." + cuerpo + "." + b64url(firma) }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error("Google no dio acceso a la cuenta de servicio: " + (j.error_description || j.error));
  return j.access_token as string;
}

// ---------- Drive: bajar el archivo (solo lectura) ----------
async function bajarExcel(token: string) {
  const h = { Authorization: "Bearer " + token };
  const base = "https://www.googleapis.com/drive/v3/files/" + ARCHIVO;
  const m = await fetch(base + "?fields=name,mimeType,modifiedTime&supportsAllDrives=true", { headers: h });
  if (!m.ok) {
    if (m.status === 404) throw new Error("El robot no ve el archivo: compártelo con su correo como Lector");
    throw new Error("Drive respondió " + m.status + " al buscar el archivo");
  }
  const meta = await m.json();
  const url = meta.mimeType === "application/vnd.google-apps.spreadsheet"
    ? base + "/export?mimeType=" + encodeURIComponent("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    : base + "?alt=media&supportsAllDrives=true";
  const a = await fetch(url, { headers: h });
  if (!a.ok) throw new Error("Drive respondió " + a.status + " al bajar el archivo");
  return { datos: new Uint8Array(await a.arrayBuffer()), nombre: meta.name, modificado: meta.modifiedTime };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    // La sesión de quien llama (la app manda su token)
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
      auth: { persistSession: false },
    });
    const acceso = await sb.rpc("logistica_acceso");
    if (acceso.error || !acceso.data) return responder({ error: "Esta cuenta no tiene acceso a Logística" }, 403);

    const archivo = await bajarExcel(await tokenGoogle());
    const wb = XLSX.read(archivo.datos, { type: "array", cellStyles: true, cellDates: true });
    const filas = leerVentas(XLSX, wb, new Date());

    // Guarda la copia en Supabase (reemplaza las pendientes de la hoja Ventas) con la misma sesión
    const g = await sb.rpc("logistica_subir", { datos: filas });
    if (g.error) throw new Error("No se pudo guardar: " + g.error.message);

    return responder({ filas: g.data, archivo: archivo.nombre, modificado: archivo.modificado, leido: new Date().toISOString() });
  } catch (e) {
    return responder({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
