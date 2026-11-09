// Función de Supabase: recibe la respuesta de Google cuando el usuario da "Conectar con Google" en la app.
// Google redirige aquí con un código; se cambia por un permiso permanente (refresh token) de SOLO LECTURA
// del Drive y se guarda en logistica.google, donde solo las funciones de Supabase lo pueden leer.
// Al terminar, regresa a la app (?google=ok o ?google=error&msg=...), que muestra el resultado
// (Supabase no deja que sus funciones muestren páginas HTML).
//
// - No pide sesión de Supabase (Google llega sin ella): la seguridad la da el "state", un código de un solo uso
//   que la app pidió con su sesión (logistica_google_inicio) y que vence en 15 minutos.
// - El secreto del cliente de Google vive en el secreto GOOGLE_CLIENT_SECRET de Supabase; nunca en el repo.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") || "580029556888-pg3prpg2e3cnlqsv6tok69pej6e8n7cq.apps.googleusercontent.com";
const REDIRECT = Deno.env.get("SUPABASE_URL") + "/functions/v1/logistica-google";
const APP = "https://grupobma.github.io/logistica/";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") || "";
  const error = url.searchParams.get("error");
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  // A dónde regresar (la app que pidió conectar; solo se aceptan la publicada o la local)
  let vuelta = APP;
  if (state) { const v = await admin.rpc("logistica_google_vuelta", { p_nonce: state }); if (v.data) vuelta = v.data as string; }
  const regresar = (ok: boolean, msg = "") => {
    const u = new URL(vuelta);
    u.searchParams.set("google", ok ? "ok" : "error");
    if (msg) u.searchParams.set("msg", msg);
    return new Response(null, { status: 302, headers: { Location: u.toString() } });
  };

  if (error) return regresar(false, "Google respondió: " + error);
  if (!code || !state) return regresar(false, "Faltan datos; intenta de nuevo");
  const secreto = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!secreto) return regresar(false, "Falta el secreto GOOGLE_CLIENT_SECRET en Supabase");

  // Cambiar el código por el permiso permanente
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: CLIENT_ID, client_secret: secreto, redirect_uri: REDIRECT, grant_type: "authorization_code" }),
  });
  const j = await r.json();
  if (!r.ok || !j.refresh_token) return regresar(false, "Google no entregó el permiso (" + (j.error_description || j.error || "sin permiso permanente") + ")");

  // Correo de la cuenta conectada (viene en el id_token)
  let cuenta = "";
  try { cuenta = JSON.parse(atob(j.id_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).email || ""; } catch { /* sin correo */ }

  const g = await admin.rpc("logistica_google_guardar", { p_nonce: state, p_refresh: j.refresh_token, p_cuenta: cuenta });
  if (g.error || !g.data) return regresar(false, "El enlace ya venció; vuelve a dar Conectar con Google");
  return regresar(true);
});
