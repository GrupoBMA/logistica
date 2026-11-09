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
  return String(v).replace(/\s+/g, " ").replace(/�/g, "Ñ").trim();
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
function celda(ws, fila, col) { return ws[String.fromCharCode(64 + col) + fila]; }

export function leerVentas(XLSX, wb, hoy = new Date()) { return leerHoja(XLSX, wb, "VENTAS", 4, hoy); }
export function leerEntregado(XLSX, wb, hoy = new Date()) { return wb.Sheets["ENTREGADO"] ? leerHoja(XLSX, wb, "ENTREGADO", 2, hoy) : []; }

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

function leerHoja(XLSX, wb, nombre, desde, hoy) {
  const ws = wb.Sheets[nombre];
  if (!ws) throw new Error("El Excel no tiene la hoja " + nombre);
  const ultima = XLSX.utils.decode_range(ws["!ref"]).e.r + 1;
  const rows = [];
  for (let r = desde; r <= ultima; r++) {
    const a = []; for (let c = 1; c <= 16; c++) { const x = celda(ws, r, c); a.push(x ? x.v : null); }
    if (!txt(a[1])) continue; // sin vehículo: renglón vacío o que todavía están capturando
    const rem = a[8] instanceof Date ? a[8].getUTCDate() + "/" + (a[8].getUTCMonth() + 1) : txt(a[8]);
    const cDest = colorDe(celda(ws, r, 10));
    rows.push({
      vendedor: titulo(txt(a[0])), vehiculo: txt(a[1]).replace(/[*\s]+$/, ""),
      pasos: a.slice(2, 7).map(paso), fecha_txt: txt(a[7]), fecha: fecha(a[7], hoy),
      remision: rem, destino: txt(a[9]).replace(/[*\s]+$/, ""), zona: ZONA[cDest] || "sin",
      activacion: titulo(txt(a[10])), costo: typeof a[11] === "number" ? a[11] : null,
      fletero: titulo(txt(a[12])), eta: txt(a[13]), faltante: capital(txt(a[14])), prepara: titulo(txt(a[15])),
      color_vehiculo: colorDe(celda(ws, r, 2)), color_destino: hexColor(cDest),
    });
  }
  return rows;
}
