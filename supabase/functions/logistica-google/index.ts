// Función de Supabase: recibe la respuesta de Google cuando el usuario da "Conectar con Google" en la app.
// Google redirige aquí con un código; se cambia por un permiso permanente (refresh token) de SOLO LECTURA
// del Drive y se guarda en logistica.google, donde solo las funciones de Supabase lo pueden leer.
//
// - No pide sesión de Supabase (Google llega sin ella): la seguridad la da el "state", un código de un solo uso
//   que la app pidió con su sesión (logistica_google_inicio) y que vence en 15 minutos.
// - El secreto del cliente de Google vive en el secreto GOOGLE_CLIENT_SECRET de Supabase; nunca en el repo.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") || "580029556888-pg3prpg2e3cnlqsv6tok69pej6e8n7cq.apps.googleusercontent.com";
const REDIRECT = Deno.env.get("SUPABASE_URL") + "/functions/v1/logistica-google";

function pagina(ok: boolean, mensaje: string) {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>BMA Logística</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/24px system-ui,sans-serif;background:#f4f4f1;color:#121310}
@media (prefers-color-scheme:dark){body{background:#0d0e0c;color:#f3f4f0}}main{max-width:420px;padding:24px}h1{font-size:24px;margin:0 0 8px}p{margin:0;opacity:.8}</style></head>
<body><main><h1>${ok ? "Listo, ya está conectado" : "No se pudo conectar"}</h1><p>${mensaje}</p></main>
<script>try{ window.opener && window.opener.postMessage({logisticaGoogle:${ok ? "true" : "false"}}, "*") }catch(e){} ${ok ? "setTimeout(function(){ window.close() }, 1500);" : ""}</script></body></html>`;
  return new Response(html, { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  if (error) return pagina(false, "Google respondió: " + error + ". Cierra esta ventana e intenta de nuevo desde la app.");
  if (!code || !state) return pagina(false, "Faltan datos. Cierra esta ventana e intenta de nuevo desde la app.");

  const secreto = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!secreto) return pagina(false, "Falta el secreto GOOGLE_CLIENT_SECRET en Supabase.");

  // Cambiar el código por el permiso permanente
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: CLIENT_ID, client_secret: secreto, redirect_uri: REDIRECT, grant_type: "authorization_code" }),
  });
  const j = await r.json();
  if (!r.ok || !j.refresh_token) {
    return pagina(false, "Google no entregó el permiso (" + (j.error_description || j.error || "sin permiso permanente") + "). Intenta de nuevo.");
  }
  // Correo de la cuenta conectada (viene en el id_token)
  let cuenta = "";
  try { cuenta = JSON.parse(atob(j.id_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).email || ""; } catch { /* sin correo */ }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const g = await admin.rpc("logistica_google_guardar", { p_nonce: state, p_refresh: j.refresh_token, p_cuenta: cuenta });
  if (g.error || !g.data) return pagina(false, "El enlace ya venció o no es válido. Vuelve a dar \"Conectar con Google\" en la app.");

  return pagina(true, "La app ya puede leer el Excel del Drive" + (cuenta ? " con la cuenta " + cuenta : "") + ". Esta ventana se cierra sola.");
});
