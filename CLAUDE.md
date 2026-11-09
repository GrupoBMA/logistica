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

### Reglas confirmadas por el usuario (9-nov-2026)

- **Color en la columna vehículo** = no hay vehículo o piezas para empezar a trabajarlo; hay que esperar a que lleguen. En los datos cuadra: las 73 con color casi no tienen pasos y ninguna tiene los 5 OK. Estado **"Esperando piezas"**.
- **Motoplaza** es un **distribuidor** al que se le vende. Va en la zona "Distribuidores" y lleva la etiqueta "Distribuidor".
- **Activación** = la **bodega** donde se arma. S. Cruz = **Bodega 1, "Granja"**; la otra es Bodega 2. Las dos propuestas tienen un filtro de bodega.
- **Con los 5 pasos en OK** hay que **mandar el flete** a su zona de destino, **con prioridad por fecha de venta** (la más antigua primero). Cada una lleva su número de prioridad.

### Prioridad actual

Ir de poco en poco, empezando por lo más importante: el vehículo, su entrega y que el flujo funcione. La fecha es un dato. La app es **de solo lectura** (no mueve ni edita nada).

### Pendientes por confirmar con el usuario

- Qué significa la **X** en los pasos del taller (hoy se pinta en rojo).
- Mochis, Culiacán, Mazatlán, Vallarta y Lo de Marcos vienen en azul claro (6FA8DC). Hoy van con sucursales.
- El umbral de **45 días** para marcar una unidad como atrasada (`VIEJA`).
- Elegir entre la propuesta A y la B.

## Estado actual (9-nov-2026): dos propuestas

Las dos leen los mismos datos y usan las mismas reglas de **`logica.js`** (compartido). Ese archivo convierte cada renglón del Excel en una unidad con: modelo y detalle cortos (`nombre()`), tipo (`tipo()`, como sunldemexico.com), estado, zona, distribuidor, bodega, días y prioridad del flete.

**Estados del flujo:** Esperando piezas (color en el vehículo) → Por empezar (sin pasos) → En taller (algún paso, menos de 5) → **Mandar flete** (5 OK) → En camino → Entregada. "En camino" y "Entregada" no existen en la hoja VENTAS (*pendiente*: Entregada vendrá de la hoja ENTREGADO).

**Tipos:** Motocarro 150 cc, 200 cc, 300 cc doble rodado, 300 cc cabina cerrada, Mototaxis, ATV, UTV, Minimotos, Areneros. "Motocarro 300 cc" a secas (la pipa), "Motocarro 350 cc" y "Accesorios y otros" (el toldo) son extras, porque la página no los tiene.

- **Propuesta A (`index.html`, puerto 8768): lista + flujo.**
  - Pestaña **Mandar flete** (se abre al entrar): las de 5 OK en una sola columna, por destino o por tipo, ordenadas por fecha y con su número de prioridad.
  - Pestaña **Flujo**: la ruta de 6 etapas con conteos y 3 avisos (listas para flete, esperando piezas, con faltante). Al tocar una etapa salen sus unidades.
  - Ficha lateral con "qué sigue", el recorrido y los datos.
- **Propuesta B (`juego/index.html`, puerto 8769): se usa como un videojuego** (en la forma de usarse, no en el dibujo).
  - Menú fijo con contadores: Mandar flete, En taller, Por empezar, Esperando piezas, Con faltante y Todas.
  - Cada vista tiene un **objetivo** en una frase. En Mandar flete, la prioridad 1 sale destacada como "Siguiente en salir".
  - Las unidades van en **casillas** con un ícono de estado (palomita, llave, play, candado) y un punto si tienen faltante.
  - Categorías por tipo con conteo, **buscador global**, medidor de "listas para salir" y **atajos**: 1–6 cambian de vista, / busca y Esc cierra.
- **Datos de prueba:** `datos/datos.js` (fuera del repo) lo genera `python datos/extraer_excel.py "<ruta del Excel>" datos/datos.js`. En la página publicada no existe, así que se ve vacía. Después vendrán de Supabase con inicio de sesión.
- **Diseño:** el skill `design-taste-frontend` en modo pantalla de app, letra Geist. Hay modo claro y modo oscuro, y las dos funcionan en celular.
- **Probar:** `.claude/launch.json` tiene `logistica` (8768) y `logistica-juego` (8769).

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
