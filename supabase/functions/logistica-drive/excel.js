// Lee la hoja VENTAS del Excel "ENTREGAS GRANJA SUNL" y la convierte en renglones para la app.
// Es la misma lógica que datos/extraer_excel.py (que se usa en la computadora); si cambia una, cambiar la otra.
// Recibe el libro ya abierto con SheetJS (XLSX.read(..., {cellStyles:true, cellDates:true})).

// Colores del tema de Office usados en el Excel (theme0 = blanco = sin color)
const TEMA = { theme4: "5B9BD5", theme5: "ED7D31", theme6: "A5A5A5", theme7: "FFC000", theme8: "4472C4", theme9: "70AD47" };
// Color de la celda de destino -> zona
const ZONA = {
  theme7: "cerca", FFBF9000: "lejos", FFFFFF00: "foranea", FFFF0000: "granja",
  theme8: "sucursal", FF3C78D8: "sucursal", theme4: "sucursal", theme9: "sucursal", FFA8D08D: "sucursal",
  FF6FA8DC: "sucursal", theme5: "cerca", // motoplaza y ruta Pacífico: por confirmar
};
const MES = { ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6, JUL: 7, AGO: 8, SEP: 9, OCT: 10, NOV: 11, DIC: 12 };

function colorDe(celda) {
  const s = celda && celda.s;
  if (!s || !s.patternType || s.patternType === "none" || !s.fgColor) return null;
  if (typeof s.fgColor.theme === "number") return "theme" + s.fgColor.theme;
  if (s.fgColor.rgb) return "FF" + String(s.fgColor.rgb).slice(-6).toUpperCase();
  return null;
}
function hexColor(c) {
  if (!c || c === "theme0") return null;
  if (c.startsWith("theme")) return TEMA[c] ? "#" + TEMA[c] : null;
  return "#" + c.slice(-6);
}
function txt(v) {
  if (v === undefined || v === null) return "";
  if (typeof v === "number" && Number.isInteger(v)) v = String(v);
  return String(v).replace(/\s+/g, " ").replace(/\uFFFD/g, "Ñ").trim();
}
function titulo(s) { return s.toLowerCase().replace(/(^|[^\p{L}])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()); }
function capital(s) { s = s.toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); }
function iso(y, m, d) { return y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0"); }

// "10-AGOSTO." -> 2026-08-10. El Excel no trae año: se toma el año de hoy, o el anterior si la fecha quedaría en el futuro.
function fecha(v, hoy) {
  if (v instanceof Date) return iso(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  const m = /^\s*(\d{1,2})\s*-\s*([A-Z]+)/.exec(String(v || "").toUpperCase().replace("0CT", "OCT"));
  if (!m || !MES[m[2].slice(0, 3)]) return null;
  const mes = MES[m[2].slice(0, 3)], dia = +m[1];
  let anio = hoy.getUTCFullYear();
  if (Date.UTC(anio, mes - 1, dia) > hoy.getTime() + 7 * 864e5) anio -= 1;
  return iso(anio, mes, dia);
}
function paso(v) { const s = txt(v).toUpperCase(); return s === "OK" ? "ok" : s === "X" ? "x" : ""; }
let XL; // SheetJS, para encode_cell
function celda(ws, fila, col) { return ws[XL.utils.encode_cell({ r: fila - 1, c: col - 1 })]; }

// Las columnas se buscan por su título (así no se rompe si agregan o mueven columnas en el Excel).
// "prepara" no tiene título: es la columna que sigue de FALTANTE.
const TITULOS = {
  vendedor: "VENDEDOR", vehiculo: "VEHICULO", ar: "AR", h: "H", f: "F", p: "P", r: "R", fecha: "FECHA",
  remision: "REMISION", destino: "DESTINO", activacion: "ACTIVACION", costo: "COSTO", fletero: "FLETERO", eta: "ETA", faltante: "FALTANTE",
};
// ENTREGADO no tiene renglón de títulos: ahí se usan las posiciones de siempre (A, B, C…)
const FIJAS = { vendedor: 1, vehiculo: 2, ar: 3, h: 4, f: 5, p: 6, r: 7, fecha: 8, remision: 9, destino: 10, activacion: 11, costo: 12, fletero: 13, eta: 14, faltante: 15, prepara: 16 };
function norma(v) { return txt(v).toUpperCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^A-Z]/g, ""); }

function columnas(ws, nombre, ultimaCol) {
  for (let fila = 1; fila <= 6; fila++) {
    const t = {}; for (let c = 1; c <= ultimaCol; c++) { const x = celda(ws, fila, c); t[c] = norma(x && x.v); }
    const vals = Object.values(t);
    if (!vals.includes("VEHICULO") || !vals.includes("DESTINO")) continue;
    const col = {}, faltan = [];
    for (const [clave, tit] of Object.entries(TITULOS)) {
      const c = Object.keys(t).find((k) => clave === "costo" ? t[k].startsWith(tit) : t[k] === tit);
      if (c) col[clave] = +c; else faltan.push(tit);
    }
    if (faltan.length) throw new Error("En la hoja " + nombre + " no encuentro la columna " + faltan.join(", ") + " (revisa los títulos del Excel)");
    col.prepara = col.faltante + 1;
    return { col, desde: fila + 1 };
  }
  if (nombre === "ENTREGADO") return { col: FIJAS, desde: 2 };
  throw new Error("En la hoja " + nombre + " no encuentro el renglón de títulos (VEHICULO, DESTINO…)");
}

export function leerVentas(XLSX, wb, hoy = new Date()) { return leerHoja(XLSX, wb, "VENTAS", hoy); }
export function leerEntregado(XLSX, wb, hoy = new Date()) { return wb.Sheets["ENTREGADO"] ? leerHoja(XLSX, wb, "ENTREGADO", hoy) : []; }

// Estado de una unidad (la misma regla que logica.js de la app)
export function estado(r) {
  const ok = r.pasos.filter((x) => x === "ok").length;
  if (ok === 5) return "flete";
  if (r.color_vehiculo && r.color_vehiculo !== "theme0") return "piezas";
  if (ok > 0 || r.pasos.includes("x")) return "taller";
  return "empezar";
}

// Compara la hoja Ventas anterior con la nueva y regresa los cambios (por remisión + vehículo)
export function compararVentas(antes, ahora) {
  const foto = (r) => ({ estado: estado(r), pasos: r.pasos, faltante: r.faltante || "" });
  const clave = (r) => r.remision + "|" + r.vehiculo;
  const pendientes = new Map();
  antes.forEach((r) => { const k = clave(r); if (!pendientes.has(k)) pendientes.set(k, []); pendientes.get(k).push(r); });
  const cambios = [];
  ahora.forEach((r) => {
    const lista = pendientes.get(clave(r));
    const a = lista && lista.shift();
    if (!a) { cambios.push({ tipo: "nueva", remision: r.remision, vehiculo: r.vehiculo, destino: r.destino, antes: null, despues: foto(r) }); return; }
    const fa = foto(a), fn = foto(r);
    if (fa.estado !== fn.estado || fa.pasos.join("|") !== fn.pasos.join("|") || fa.faltante !== fn.faltante) {
      cambios.push({ tipo: "cambio", remision: r.remision, vehiculo: r.vehiculo, destino: r.destino, antes: fa, despues: fn });
    }
  });
  pendientes.forEach((lista) => lista.forEach((a) =>
    cambios.push({ tipo: "salio", remision: a.remision, vehiculo: a.vehiculo, destino: a.destino, antes: foto(a), despues: null })));
  return cambios;
}

function leerHoja(XLSX, wb, nombre, hoy) {
  XL = XLSX;
  const ws = wb.Sheets[nombre];
  if (!ws) throw new Error("El Excel no tiene la hoja " + nombre);
  const rango = XLSX.utils.decode_range(ws["!ref"]);
  const ultima = rango.e.r + 1;
  const { col, desde } = columnas(ws, nombre, rango.e.c + 1);
  const rows = [];
  for (let r = desde; r <= ultima; r++) {
    const v = (k) => { const x = celda(ws, r, col[k]); return x ? x.v : null; };
    if (!txt(v("vehiculo"))) continue; // sin vehículo: renglón vacío o que todavía están capturando
    const rem = v("remision") instanceof Date ? v("remision").getUTCDate() + "/" + (v("remision").getUTCMonth() + 1) : txt(v("remision"));
    const cDest = colorDe(celda(ws, r, col.destino));
    const costo = v("costo");
    rows.push({
      vendedor: titulo(txt(v("vendedor"))), vehiculo: txt(v("vehiculo")).replace(/[*\s]+$/, ""),
      pasos: ["ar", "h", "f", "p", "r"].map((k) => paso(v(k))), fecha_txt: txt(v("fecha")), fecha: fecha(v("fecha"), hoy),
      remision: rem, destino: txt(v("destino")).replace(/[*\s]+$/, ""), zona: ZONA[cDest] || "sin",
      activacion: titulo(txt(v("activacion"))), costo: typeof costo === "number" ? costo : null,
      fletero: titulo(txt(v("fletero"))), eta: txt(v("eta")), faltante: capital(txt(v("faltante"))), prepara: titulo(txt(v("prepara"))),
      color_vehiculo: colorDe(celda(ws, r, col.vehiculo)), color_destino: hexColor(cDest),
    });
  }
  return rows;
}
