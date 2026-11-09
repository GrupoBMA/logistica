# CLAUDE.md

Guía para Claude Code en la app **Logística** de Grupo BMA. Todo en español (UI, datos, comentarios y nombres de funciones).

**Regla de mantenimiento:** cada cambio significativo se documenta aquí en el mismo commit. Lo que todavía no se sabe se marca como *pendiente* en vez de suponerlo.

## Qué es

Tablero de las entregas de unidades vendidas (motocarros, mototaxis, recreativos) que salen de la granja: en qué paso del taller va cada una, hacia dónde va, quién la lleva y qué le falta. Reemplaza al Excel "ENTREGAS GRANJA SUNL". Debe ser minimalista y fácil de leer.

El Excel tiene las hojas VENTAS, RECREATIVOS, ENTREGADO, SHOWROOM SUCURSALES, FLETEROS y DIST. **Se empezó solo con VENTAS** (9-nov-2026).

### Campos de una entrega (hoja VENTAS)

Vendedor, vehículo (texto libre, p. ej. "1 MC 300 CABINA CERRADA CAJA FOOD TRUCK"), los 5 pasos del taller, fecha de venta, remisión (puede tener partes: 153/1, 153/2), destino, activación (S. Cruz o Bodega 2), costo de envío, fletero, ETA, faltante y quién la prepara (columna sin título en el Excel).

**Pasos del taller:** AR armada, H herrería, F forrado, P pintura, R revisión. Cada uno va "OK", "X" o vacío. No todas las unidades llevan los 5 (hay unidades con H o P vacíos que ya pasaron revisión).

**Colores del destino (zona):** naranja = local cerca; naranja oscuro = local más lejos; amarillo = foránea, necesita tráiler; rojo = se recoge en granja; azul y verde = sucursales (Wash, Américas, AGS, Tepic).

### Pendientes por confirmar con el usuario

- Qué significa la **X** en los pasos del taller (hoy se pinta en rojo, "Marcado con X").
- **Motoplaza** viene en un naranja distinto (ED7D31) al de las colonias de Guadalajara (FFC000). Hoy se trata como local cerca.
- Mochis, Culiacán, Mazatlán, Vallarta y Lo de Marcos vienen en azul claro (6FA8DC). Hoy van con sucursales.
- Qué significan los **colores de la columna vehículo** (parecen ir por modelo: MC 150, MC 200, MC 300 DR con o sin hidráulico).
- "Lista para salir" se tomó como **R = OK**.

## Estado actual (9-nov-2026)

`index.html` es la app: un solo archivo, sin librerías, letra Geist. Por ahora es la **propuesta de diseño** con los datos del Excel cargados en local.

- **Datos de prueba:** `datos/datos.js` (fuera del repo) lo genera `python datos/extraer_excel.py "<ruta del Excel>" datos/datos.js`. En la página publicada no existe, así que se ve vacía ("Todavía no hay entregas cargadas"). Después los datos vendrán de Supabase con inicio de sesión.
- **Pantalla Ventas:**
  - arriba, el avance en 4 etapas (sin entrar a taller, en taller, lista sin flete, con flete asignado), que también sirven de filtro;
  - la frase con lo urgente, calculada de los datos;
  - "Hacia dónde van": barra y botones por zona;
  - la lista agrupada por zona y ordenada por días de espera (de más a menos), con buscador, filtro de vendedor y "Con faltante". Al dar clic en un renglón se abre la ficha.
- **Diseño:** estilo "achromatic ledger" del skill `design-taste-frontend` (pantalla de app). El cromo va sin color; el color solo está en los datos (zonas y pasos). Hay modo claro y modo oscuro.
- **Probar:** `.claude/launch.json` levanta `python -m http.server 8768`.

## Regla estricta: nada con datos reales en el repo

El repo es **público** (GitHub Pages en el plan gratis). Ventas, clientes, remisiones, costos y teléfonos de fleteros **nunca** se suben: `datos/`, los Excel y los CSV están en `.gitignore`. Revisar `git status` antes de cada commit.

## Repositorio y despliegue

- Repo **`GrupoBMA/logistica`** en la organización `GrupoBMA`, hermano de `GrupoBMA/administracion` y `GrupoBMA/catalogo`. Se publica con GitHub Pages desde `main` en <https://grupobma.github.io/logistica/>. **Cada push a `main` sale en vivo.**
- Clon local: `OneDrive\Claude Code\Logistica`.
- Flujo: editar, hacer un commit descriptivo, `git push origin main` y decirle al usuario dónde verlo.

## Datos y seguridad

- **Supabase:** el mismo proyecto que GVF, administración y catálogo (`jlfendrdwptwmttrahre`), con el **esquema propio `logistica`**. Ese esquema no está expuesto en la API y sus tablas tienen RLS sin reglas, así que nadie las lee directo.
- Tablas: `logistica.usuarios` (cuentas con acceso) y `logistica.entregas` (una fila por unidad).
- **Única puerta:** las funciones `public.logistica_datos()` (leer) y `public.logistica_subir(datos)` (reemplazar las pendientes con lo del Excel). Las dos son `security definer` y primero revisan que la sesión esté en `logistica.usuarios`. `anon` no puede llamarlas.
- **Cuentas:** *pendiente*. Se crean en el panel de Supabase (Authentication → Users → Add user, con "Auto Confirm") y luego se agrega su id a `logistica.usuarios`.
- La app todavía **no** está conectada a Supabase (*pendiente*: login y lectura).
