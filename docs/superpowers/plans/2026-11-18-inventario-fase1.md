# Inventario Fase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dentro de Logística, las bodegas registran contenedores y su revisión de recepción, y todos ven el inventario de piezas y de vehículos en espera de armado; el admin maneja catálogos, ve los cambios y autoriza anulaciones.

**Architecture:** Datos en Supabase (esquema `logistica`, tablas `inv_*`), solo a través de funciones `public.inv_*` `security definer` que revisan rol y bodega. Reglas puras (cálculo de piezas esperadas, diferencias) en `inventario-logica.js`, probadas con `node --test`. Pantallas en `inventario.js` + `inventario.css`; `index.html` solo decide qué ve cada rol y carga esos archivos.

**Tech Stack:** HTML/CSS/JS sin librerías ni build (como Logística), `@supabase/supabase-js@2.45.4` (ya cargado), Postgres de Supabase (proyecto `jlfendrdwptwmttrahre`), `node:test` para las reglas.

**Spec:** `docs/superpowers/specs/2026-11-18-inventario-fase1-design.md`

## Global Constraints

- Todo en español: UI, nombres de funciones, comentarios y datos.
- Repo **público**: ningún dato real en el código. Los catálogos se cargan en Supabase, no en el JS.
- Nadie lee tablas `inv_*` directo; RLS activo sin reglas; solo funciones `public.inv_*` (`security definer`, `set search_path to ''`), revocadas para `anon`.
- Roles: `admin` todo; `lectura` (carlos) solo funciones de lectura, todas las bodegas; `bodega` lee y escribe **solo su bodega** (`logistica.usuarios.bodega`), nunca catálogos.
- Nada se borra: se anula. Anular lo **pide** la bodega y lo **autoriza** el admin.
- Toda edición pide **motivo** obligatorio y queda en `logistica.inv_bitacora` (quién, cuándo, antes, después, motivo, visto).
- Pantallas para **tablet y computadora**; que no se rompan en celular, pero no se optimizan para él.
- **Diseño (pedido del usuario, 18-nov-2026): lo más limpio e intuitivo posible, para gente a la que no se le da la tecnología.**
  - **Cero `<select>` nativos.** Toda elección abre la **lista para escoger** (`hoja`) copiada de Catálogo (`Catalogo Proveedores/index.html`: `.hoja*`, `.h-op`, `.h-grupo`, `abrirHoja`/`cerrarHoja`): al centro en tablet/computadora, desde abajo en celular, renglones grandes, agrupados con título, la opción elegida resaltada, ✕ y fondo para cerrar, y "atrás" del navegador la cierra.
  - **Sin filtros regados.** Se navega con el **menú** de la izquierda (mismo estilo que el menú de Logística). Lo que no se usa siempre va dentro de un menú, no a la vista.
  - Captura **paso a paso**: una pregunta clara por bloque, botón grande "Siguiente"/"Guardar", resumen antes de guardar.
  - Cantidades con botones **− / +** grandes además del número.
  - Botones y renglones de al menos 48 px de alto; letra base 16 px; textos cortos en palabras de la bodega ("Contenedor", "¿Qué trae?", "Llegaron", "Dañadas"), sin términos técnicos.
  - Mismo estilo de Logística: letra Geist, sus tokens de color y modo oscuro.
- `index.html` carga los JS con `?v=AAAAMMDD-x`; cambiar el número cada vez que cambie el archivo.
- Cada cambio significativo se documenta en `CLAUDE.md` en el mismo commit. **No hacer push** sin el OK del usuario (cada push a `main` sale en vivo).

## Review Focus

1. **Bodega pidiendo datos de otra bodega** (pasando `p_bodega` ajeno a una función): Supabase debe ignorarlo y usar la suya → prueba SQL en Task 1.
2. **Número de contenedor repetido** (mismo número, mismo o distinta bodega, con espacios o minúsculas): se rechaza con aviso claro → prueba SQL en Task 1 y validación en Task 2.
3. **Revisar un contenedor cuyo modelo no tiene lista de materiales** (hoy ninguno la tiene): la revisión muestra "Este modelo todavía no tiene su lista de piezas" y deja guardar el conteo por color sin piezas → prueba en Task 2.
4. **Dañadas mayor que llegadas, o cantidades negativas**: se rechaza en la pantalla y en Supabase → pruebas en Task 1 y Task 2.
5. **Editar un contenedor ya revisado o anulado**: revisado se puede editar con motivo y recalcula; anulado no se puede tocar ni cuenta en el inventario → prueba SQL en Task 1.

---

### Task 1: Base de datos y funciones

**Files:**
- Create: `supabase/sql/2026-11-18-inventario-fase1.sql` (copia de lo aplicado, como referencia; el repo no usa CLI de Supabase)
- Create: `tests/inventario.sql` (pruebas en `begin … rollback`)
- Aplicar con la herramienta `apply_migration` (nombre `inventario_fase1`).

**Interfaces — Produces** (todas `returns jsonb` salvo que se diga):
- Tablas `logistica.inv_modelos(id, nombre, orden, activo)`, `inv_caracteristicas(id, nombre, orden)`, `inv_opciones(id, caracteristica_id, nombre, orden)`, `inv_modelo_opciones(modelo_id, opcion_id)`, `inv_colores(id, nombre, orden, activo)`, `inv_defectos(id, nombre, orden, activo)`, `inv_piezas(id, nombre, lleva_color bool, con_serie bool, activo)`, `inv_materiales(id, modelo_id, opcion_id, pieza_id, cantidad int)` (exactamente uno de `modelo_id`/`opcion_id`; `cantidad` negativa = quita), `inv_contenedores(id, bodega, numero, llegada date, observaciones, estado in ('recibido','revisado','anulado'), creado, creado_por, revisado, revisado_por)` con único `upper(btrim(numero))`, `inv_renglones(id, contenedor_id, modelo_id, opciones int[], color_id, cantidad, contados)`, `inv_revision_piezas(contenedor_id, pieza_id, color_id, esperadas, llegaron, danadas)` con check `danadas <= llegaron`, `inv_revision_defectos(id, contenedor_id, pieza_id, defecto_id, gravedad in ('leve','media','grave'), cantidad > 0)`, `inv_bitacora(id, fecha, user_id, bodega, accion, tabla, registro, antes, despues, motivo, visto)`, `inv_anulaciones(id, contenedor_id, motivo, pedida_por, pedida, estado in ('pendiente','autorizada','rechazada'), resuelta_por, resuelta)`.
- `inv_sesion()` → `{rol, bodega}`.
- `inv_catalogo()` → `{modelos, caracteristicas:[{id,nombre,opciones:[…]}], modelo_opciones, colores, defectos, gravedades:['leve','media','grave'], piezas, materiales}`.
- `inv_catalogo_guardar(p_tabla text, p_fila jsonb)` → `inv_catalogo()`; solo admin; `p_tabla` en lista blanca (`modelos, opciones, modelo_opciones, colores, defectos, piezas, materiales`); con `id` actualiza, sin `id` inserta; desactivar = `activo:false`.
- `inv_contenedores(p_bodega text default null)` → lista con `{id, bodega, numero, llegada, estado, vehiculos, anulacion_pendiente}`. Bodega: siempre la suya.
- `inv_contenedor(p_id bigint)` → `{contenedor, renglones, piezas, defectos}`.
- `inv_contenedor_guardar(p jsonb, p_motivo text default null)` → `{id}`; `p = {id?, bodega?, numero, llegada, observaciones, renglones:[{modelo_id, opciones, color_id, cantidad}]}`. Con `id` exige motivo. Bodega ignora `p.bodega`. Admin debe mandarla. Lectura: rechazo `42501`.
- `inv_revision_guardar(p_id bigint, p jsonb, p_motivo text default null)` → `{id}`; `p = {contados:[{renglon_id, contados}], piezas:[{pieza_id, color_id, esperadas, llegaron, danadas}], defectos:[{pieza_id, defecto_id, gravedad, cantidad}]}`; reemplaza la revisión, pone `estado='revisado'`; si ya estaba revisado exige motivo.
- `inv_inventario(p_bodega text default null)` → `{piezas:[{pieza, color, disponibles, danadas}], espera:[{modelo, opciones, color, cantidad}]}`; solo contenedores `revisado`; disponibles = Σ(llegaron − dañadas).
- `inv_anulacion_pedir(p_contenedor bigint, p_motivo text)`; `inv_anulacion_resolver(p_id bigint, p_autorizar bool)` (solo admin; autorizar → contenedor `anulado`).
- `inv_bitacora(p_pendientes bool default true)` y `inv_bitacora_visto(p_ids bigint[])` (solo admin).
- Datos iniciales: modelos **MC 150, MC 200, MC 300**; colores **Blanco, Azul, Rojo, Tinto, Plata, Negro, Rosa, Verde, Naranja, Amarillo**; características **Hidráulico** (Con, Sin) y **Rodado** (Sencillo, Doble), todas permitidas en los 3 modelos (*pendiente* que el usuario confirme combinaciones); los 17 defectos del spec. Sin piezas ni materiales (*pendiente* del usuario).

- [ ] **Step 1: Escribir `tests/inventario.sql`.** Cada caso suplanta una cuenta con `set_config('request.jwt.claims', …)` + `set local role authenticated` (patrón ya usado en esta sesión) y termina en `rollback`. Casos:
  - `bodega1` guarda un contenedor con `bodega:'bodega2'` → queda en `bodega1`.
  - `bodega1` llama `inv_contenedores('bodega2')` → solo ve los de `bodega1`.
  - número `' abc-1 '` y luego `'ABC-1'` → el segundo falla con mensaje "Ese contenedor ya está registrado".
  - `carlos` llama `inv_contenedor_guardar` → error `42501`; `inv_inventario()` → responde.
  - `bodega1` llama `inv_catalogo_guardar` → error `42501`.
  - editar sin motivo → error "Escribe el motivo del cambio"; con motivo → 1 renglón nuevo en `inv_bitacora`.
  - revisión con `danadas > llegaron` → error.
  - contenedor revisado: `inv_inventario` lo cuenta; tras pedir y autorizar anulación → ya no lo cuenta, y `inv_contenedor_guardar` sobre él falla "Este contenedor está anulado".
- [ ] **Step 2: Correrlo** con `execute_sql` → falla (las funciones no existen).
- [ ] **Step 3: Escribir y aplicar `supabase/sql/2026-11-18-inventario-fase1.sql`** (tablas, RLS activo sin reglas, funciones, `revoke … from anon`, datos iniciales). Helper `logistica.inv_yo()` → fila de `logistica.usuarios` de la sesión, o excepción `42501` "Sin acceso a logística".
- [ ] **Step 4: Correr `tests/inventario.sql`** → todos los casos dan lo esperado. Correr `get_advisors` (security) → sin avisos nuevos de las tablas `inv_*`.
- [ ] **Step 5: Commit** `supabase/sql/…` y `tests/inventario.sql`: "Inventario fase 1: tablas y funciones en Supabase".

### Task 2: Reglas puras

**Files:**
- Create: `inventario-logica.js` (expone `window.Inventario` y `module.exports`, como patrón UMD mínimo)
- Test: `tests/inventario-logica.test.js`

**Interfaces — Produces:**
- `piezasEsperadas(renglones, catalogo) → [{pieza_id, nombre, color_id|null, color|null, esperadas}]`: por renglón, materiales del modelo + de cada opción × `cantidad`; si la pieza `lleva_color`, se agrupa por el color del renglón; si no, `color_id:null`; suma iguales; quita las que den ≤ 0; orden por nombre.
- `sinListaDePiezas(renglones, catalogo) → [nombre de modelo]` (modelos de los renglones sin ningún material).
- `diferencia(esperadas, llegaron) → {faltan, sobran}` (enteros ≥ 0).
- `validarContenedor(datos, existentes) → [mensaje]` (número vacío, repetido sin importar mayúsculas/espacios, fecha vacía, sin renglones, cantidad < 1).
- `validarPieza({esperadas, llegaron, danadas}) → [mensaje]` (negativos, dañadas > llegaron).
- `nombreVehiculo(renglon, catalogo) → 'MC 150 · Sin hidráulico · Sencillo · Azul'`.

- [ ] **Step 1: Escribir las pruebas.** Catálogo de prueba inventado en el archivo (MC 150 base: Chasis×1, Llanta×4, Carrocería×1 con color; opción Con hidráulico: Hidráulico×1; Doble rodado: Llanta×2). Aserciones:
  - 2 renglones `MC150 Con hidráulico Sencillo Azul ×2` y `MC150 Sin Sencillo Rojo ×3` → Chasis 5, Llanta 20, Hidráulico 2, Carrocería Azul 2, Carrocería Roja 3.
  - Doble rodado ×1 → Llanta 6.
  - `sinListaDePiezas` con un MC 300 sin materiales → `['MC 300']`.
  - `diferencia(10, 8)` → `{faltan:2, sobran:0}`; `diferencia(10, 12)` → `{faltan:0, sobran:2}`.
  - `validarContenedor({numero:' abc-1 '}, ['ABC-1'])` incluye "Ese contenedor ya está registrado".
  - `validarPieza({esperadas:4, llegaron:3, danadas:4})` incluye "No puede haber más dañadas que las que llegaron".
- [ ] **Step 2:** `node --test tests/` → FAIL (no existe el módulo).
- [ ] **Step 3: Implementar `inventario-logica.js`.**
- [ ] **Step 4:** `node --test tests/` → PASS.
- [ ] **Step 5: Commit** "Inventario: reglas de piezas esperadas y validaciones".

### Task 3: Entrada por rol y esqueleto de Inventario

**Files:**
- Modify: `index.html` (arranque de sesión ~1160-1215: `signInWithPassword`, `getSession`; pestañas ~494; `<script>` ~521)
- Create: `inventario.js`, `inventario.css`

**Interfaces:**
- Consumes: `inv_sesion()` (Task 1), `window.Inventario` (Task 2).
- Produces: `window.InventarioApp.iniciar({sb, rol, bodega, contenedor})` que dibuja dentro de `contenedor`; `InventarioApp.abrirLista({titulo, ayuda, grupos:[{titulo, opciones:[{valor, nombre, detalle?, n?}]}], elegido}) → Promise<valor|null>` (la `hoja` de Catálogo como promesa; la usan Tasks 4-6).

- [ ] **Step 1: `entrar()` en `index.html`** reemplaza a las llamadas directas a `leerDrive()` tras iniciar sesión: pide `inv_sesion()`; si `rol==='bodega'` pone `body.modo-bodega`, **no** llama a `leerDrive` ni a `logistica_datos`, y arranca `InventarioApp.iniciar` a pantalla completa (sin menú de Ventas, pestañas, buscador, campana ni botones del Drive; "Salir" sigue). Si es `admin` o `lectura`, todo como hoy más una pestaña **Inventario** al final de las pestañas; al elegirla se esconden menú/toolbar de Logística y se dibuja Inventario en `main`.
- [ ] **Step 2: `inventario.js`** con el menú propio (estilo del menú de Logística): bodega → **Recibir contenedor**, **Contenedores**, **Inventario**; admin → lo mismo + **Catálogos** y **Cambios** (con número de pendientes), y arriba un selector de bodega hecho con `abrirLista` (Bodega 1 / Bodega 2 / Las dos). Lectura → **Contenedores** e **Inventario**, sin botones de guardar. `abrirLista` + estilos `.hoja*` copiados de Catálogo.
- [ ] **Step 3: Verificar** en el panel del navegador (`preview_start` "logistica", puerto 8768): el usuario entra como `bodega1` (Claude no escribe contraseñas) → solo se ve el menú de Inventario, sin nada de Logística, y en la pestaña Red no hay llamada a `logistica-drive`. Luego como `admin` → Logística igual que antes + pestaña Inventario. Revisar que la consola no tenga errores.
- [ ] **Step 4: Commit** "Inventario: cada cuenta ve lo suyo; bodegas sin Logística".

### Task 4: Recibir contenedor y lista de contenedores

**Files:** Modify `inventario.js`, `inventario.css`

**Interfaces — Consumes:** `inv_catalogo`, `inv_contenedor_guardar`, `inv_contenedores`, `inv_contenedor`, `inv_anulacion_pedir`; `validarContenedor`, `nombreVehiculo`; `abrirLista`.

- [ ] **Step 1: "Recibir contenedor" en 3 pasos** con barra de avance arriba ("1 Contenedor · 2 ¿Qué trae? · 3 Revisar y guardar"):
  1. Número de contenedor (campo grande) y fecha de llegada (hoy por omisión).
  2. **¿Qué trae?**: botón grande "+ Agregar vehículos" → `abrirLista` en cadena: Modelo → cada característica permitida del modelo (Hidráulico, Rodado) → Color → cantidad con − / +. Cada renglón queda como tarjeta "40 · MC 150 · Sin hidráulico · Sencillo · Azul" con "Cambiar" y "Quitar". Observaciones opcionales, escondidas tras "Agregar una nota".
  3. Resumen en palabras ("Contenedor ABC-1, llegó el 18 de noviembre, trae 100 vehículos") y botón **Guardar**. Errores de `validarContenedor` junto al paso que corresponde.
- [ ] **Step 2: "Contenedores"**: lista con número, fecha, vehículos y estado en etiqueta ("Por revisar" / "Revisado" / "Anulado" / "Anulación pedida"). Al picar uno se abre su ficha (el panel lateral `insp` de Logística) con lo que trae, y botones según rol y estado: **Revisar** (Task 5), **Corregir** (abre los mismos 3 pasos llenos + pide motivo), **Pedir anulación** (pide motivo).
- [ ] **Step 3: Verificar** con el usuario en el panel: registrar un contenedor de prueba con 2 renglones, corregirlo con motivo, pedir su anulación. Revisar en Supabase que la bitácora tenga alta, edición y anulación pedida. Probar a 1024×768 (tablet) y a 1440 de ancho.
- [ ] **Step 4: Commit** "Inventario: recibir contenedor y lista de contenedores".

### Task 5: Revisión de recepción

**Files:** Modify `inventario.js`, `inventario.css`

**Interfaces — Consumes:** `inv_contenedor`, `inv_revision_guardar`, `inv_catalogo`; `piezasEsperadas`, `sinListaDePiezas`, `diferencia`, `validarPieza`; `abrirLista`.

- [ ] **Step 1: Pantalla en 3 pasos** ("1 Vehículos · 2 Piezas · 3 Guardar"):
  1. **Vehículos**: un renglón por cada renglón del contenedor con lo declarado y botón grande **✓ Coincide**; si no, − / + para lo contado y la diferencia en rojo.
  2. **Piezas**: lista de `piezasEsperadas`, cada una con **✓ Coincide** grande. "No coincide" abre una caja con **Llegaron** (− / +) y **Dañadas** (− / +); la app escribe "Faltan 2" o "Sobran 1". Si hay dañadas, "+ Agregar daño" → `abrirLista` Tipo de defecto → `abrirLista` Gravedad (Leve, Media, Grave) → cantidad. Si `sinListaDePiezas` no está vacío, aviso amable: "El MC 300 todavía no tiene su lista de piezas. Puedes guardar el conteo de vehículos; las piezas se revisan cuando esté la lista." Contador arriba: "Faltan 12 de 40 piezas por revisar".
  3. Resumen (faltantes, sobrantes, dañadas) y **Guardar revisión**. Si el contenedor ya estaba revisado, pide motivo.
- [ ] **Step 2: Verificar** con el usuario en el panel con el contenedor de prueba (y, si para entonces hay lista de materiales, con piezas): marcar coincide, una pieza con faltante y una con daño. Revisar en Supabase `inv_revision_*` y la bitácora.
- [ ] **Step 3: Commit** "Inventario: revisión de recepción".

### Task 6: Inventario, catálogos y cambios

**Files:** Modify `inventario.js`, `inventario.css`, `CLAUDE.md`

**Interfaces — Consumes:** `inv_inventario`, `inv_catalogo`, `inv_catalogo_guardar`, `inv_bitacora`, `inv_bitacora_visto`, `inv_anulacion_resolver`; `abrirLista`.

- [ ] **Step 1: "Inventario"**: dos bloques grandes con su título, **Piezas** (nombre, color, disponibles y dañadas; dañadas en rojo si > 0) y **En espera de armado** (vehículos por modelo, características y color, con total arriba). Sin filtros a la vista; si hace falta, un solo botón "Ver por…" que abre `abrirLista`.
- [ ] **Step 2: "Catálogos" (solo admin)**: menú interno Modelos · Colores · Características · Defectos · Piezas · Lista de piezas. Cada uno es una lista con "+ Agregar", renombrar y desactivar (no se borra). **Lista de piezas**: escoger modelo u opción con `abrirLista` → renglones pieza + cantidad (− / +), y en piezas la casilla "Lleva el color del vehículo".
- [ ] **Step 3: "Cambios" (solo admin)**: arriba **Anulaciones por autorizar** (Autorizar / Rechazar); abajo los cambios sin ver, en palabras ("Bodega 1 corrigió el contenedor ABC-1: cantidad de 40 a 38 · Motivo: error al contar"), con "Marcar como visto" y "Marcar todos".
- [ ] **Step 4: Verificar** con el usuario en el panel: cargar una lista de piezas de prueba para MC 150, ver que la revisión del contenedor de prueba la usa, autorizar la anulación pendiente y ver que el inventario deja de contarlo. Luego borrar los datos de prueba con el usuario de acuerdo.
- [ ] **Step 5: Documentar en `CLAUDE.md`** (sección nueva "Inventario de bodegas": roles, tablas, funciones, pantallas y reglas de diseño) y **commit** "Inventario: consulta, catálogos y cambios".
- [ ] **Step 6: Pedir al usuario el OK para `git push origin main`** (sale en vivo, con el cambio de solo lectura pendiente de antes).
