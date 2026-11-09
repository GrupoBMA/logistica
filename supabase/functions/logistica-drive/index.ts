// Función de Supabase: lee el Excel "ENTREGAS GRANJA SUNL" directo del Google Drive y lo guarda en logistica.entregas.
// La app la llama cada vez que alguien entra, así siempre se ve lo que hay en el Drive en ese momento.
//
// - Solo la puede llamar una sesión de una cuenta que esté en logistica.usuarios (se revisa con logistica_acceso()).
// - Entra al Drive con la cuenta de Google del usuario, que la conectó desde la app ("Conectar con Google",
//   función logistica-google), con permiso de SOLO LECTURA (drive.readonly). Así no aparece nadie nuevo
//   entre los compartidos del archivo. El permiso (refresh token) vive en logistica.google y solo lo leen
//   las funciones (service_role). El secreto del cliente de Google está en GOOGLE_CLIENT_SECRET.
//   Respaldo opcional: una cuenta de servicio en el secreto GOOGLE_SA_JSON.
// - El archivo se escoge con el secreto LOGISTICA_FILE_ID (si no existe, usa el de abajo).
// - No escribe nada en el Drive.
import * as XLSX from "npm:xlsx@0.18.5";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { leerVentas, leerEntregado, compararVentas } from "./excel.js";

const ARCHIVO = Deno.env.get("LOGISTICA_FILE_ID") || "18c-Xbt9d8ml0QaI1Xh9Du68uAcXGUiNU";
const CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") || "580029556888-pg3prpg2e3cnlqsv6tok69pej6e8n7cq.apps.googleusercontent.com";
class FaltaConectar extends Error {}
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
// Token con la cuenta de Google del usuario (la que conectó en la app)
async function tokenUsuario(admin: ReturnType<typeof createClient>) {
  const t = await admin.rpc("logistica_google_token");
  if (t.error) throw new Error("No se pudo leer la conexión con Google: " + t.error.message);
  if (!t.data) throw new FaltaConectar("Falta conectar con Google");
  const secreto = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!secreto) throw new Error("Falta el secreto GOOGLE_CLIENT_SECRET en Supabase");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: secreto, refresh_token: t.data as string, grant_type: "refresh_token" }),
  });
  const j = await r.json();
  if (!r.ok) {
    // invalid_grant = Google ya no acepta el permiso (en modo prueba vence cada 7 días): pedir conectar de nuevo
    if (j.error === "invalid_grant") { await admin.rpc("logistica_google_olvidar"); throw new FaltaConectar("La conexión con Google venció; hay que volver a conectar"); }
    throw new Error("Google no dio acceso: " + (j.error_description || j.error));
  }
  return j.access_token as string;
}

// Respaldo: cuenta de servicio (robot), solo si existe el secreto GOOGLE_SA_JSON
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
    if (m.status === 404) throw new Error("La cuenta de Google conectada no ve el archivo; conecta la cuenta que tiene acceso");
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

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    let token: string;
    try { token = await tokenUsuario(admin); }
    catch (e) { if (e instanceof FaltaConectar && Deno.env.get("GOOGLE_SA_JSON")) token = await tokenGoogle(); else throw e; }
    const archivo = await bajarExcel(token);
    const wb = XLSX.read(archivo.datos, { type: "array", cellStyles: true, cellDates: true });
    const hoy = new Date();
    const filas = leerVentas(XLSX, wb, hoy);
    const entregado = leerEntregado(XLSX, wb, hoy);

    // Lo que había guardado de Ventas, para saber qué cambió desde la lectura anterior
    const previo = await sb.rpc("logistica_datos");
    const antes = ((previo.data && previo.data.entregas) || []).filter((e: Record<string, unknown>) => (e.hoja || "ventas") === "ventas")
      .map((e: Record<string, string>) => ({ remision: e.remision || "", vehiculo: e.vehiculo || "", destino: e.destino || "", faltante: e.faltante || "",
        color_vehiculo: e.color_vehiculo || null, pasos: [e.armado || "", e.herreria || "", e.forrado || "", e.pintura || "", e.revision || ""] }));
    const cambios = antes.length ? compararVentas(antes, filas) : [];

    // Guarda la copia en Supabase (reemplaza cada hoja) con la misma sesión
    const g = await sb.rpc("logistica_subir", { datos: filas, hoja_excel: "ventas" });
    if (g.error) throw new Error("No se pudo guardar: " + g.error.message);
    const ge = await sb.rpc("logistica_subir", { datos: entregado, hoja_excel: "entregado" });
    if (ge.error) throw new Error("No se pudo guardar Entregado: " + ge.error.message);
    if (cambios.length) {
      const gc = await sb.rpc("logistica_cambios_guardar", { cambios });
      if (gc.error) throw new Error("No se pudieron guardar los cambios: " + gc.error.message);
    }

    return responder({ filas: g.data, entregados: ge.data, cambios: cambios.length, archivo: archivo.nombre, modificado: archivo.modificado, leido: hoy.toISOString() });
  } catch (e) {
    // Responde 200 con el error para que la app pueda leer el mensaje (con otro código, la app no ve el cuerpo)
    return responder({ error: e instanceof Error ? e.message : String(e), conectar: e instanceof FaltaConectar });
  }
});
