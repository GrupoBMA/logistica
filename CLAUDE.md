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
- ~~Elegir entre la propuesta A y la B~~: **el usuario eligió la B** (9-nov-2026). Lo que le gustó es que se usa como un videojuego, es intuitiva y es fácil encontrar todo. Ojo: no quiere gráficos de videojuego; una versión pixel-art se descartó. Las siguientes mejoras siguen esa línea.

## Estado actual (9-nov-2026)

`index.html` es la app, que se usa como un videojuego (era la "propuesta B"; la propuesta A, de lista y flujo, se quitó cuando el usuario eligió esta). Es un solo archivo sin librerías, con letra Geist. Las reglas viven en **`logica.js`**, que convierte cada renglón del Excel en una unidad con: modelo y detalle cortos (`nombre()`), tipo (`tipo()`, como sunldemexico.com), estado, zona, distribuidor, bodega, días y prioridad del flete.

**Estados:** Esperando piezas (color en el vehículo) → Por empezar (sin pasos) → En taller (algún paso, menos de 5) → **Completo** (5 OK; toca mandar el flete) → En camino → Entregada. "En camino" y "Entregada" no existen en la hoja VENTAS (*pendiente*: Entregada vendrá de la hoja ENTREGADO).

**Tipos:** Motocarro 150 cc, 200 cc, 300 cc doble rodado, 300 cc cabina cerrada, Mototaxis, ATV, UTV, Minimotos, Areneros. "Motocarro 300 cc" a secas (la pipa), "Motocarro 350 cc" y "Accesorios y otros" (el toldo) son extras, porque la página no los tiene.

**Cómo se usa:**
- **Menú fijo** a la izquierda (en celular, una fila que se desliza) con contadores: **Completo** (5 pasos en OK; antes se llamaba "Mandar flete"), En taller, Por empezar, Esperando piezas, Con faltante y Todas. Abajo, el medidor "Listas para salir".
- Cada vista tiene un **objetivo** en una frase. En Completo, la prioridad 1 sale destacada como "Siguiente en salir" y las demás van por número de prioridad (fecha de venta).
- Las unidades van en **casillas**. Arriba de cada una va la **remisión** en grande, junto al ícono de estado (palomita = completo, llave = en taller, play = por empezar, candado = esperando piezas). Si tiene faltante, sale una línea amarilla "Falta: …". En taller llevan una barra de 5.
- **Filtro por tipo** en un desplegable ("Filtrar por tipo de vehículo", con el conteo de cada tipo y "Quitar filtro"); antes eran botones, que distraían, **buscador global** (busca en todas las vistas), selector de **bodega** (Todas, Granja, Bodega 2) y **atajos**: 1–6 cambian de vista, / busca y Esc cierra.
- **Ficha** lateral: qué sigue con esa unidad, sus 5 pasos y sus datos (destino, zona, bodega, tipo, fecha, vendedor, remisión, faltante).
- **Datos de prueba:** el Excel guarda algunas remisiones como fecha ("16/1" queda como 16 de enero); el extractor las regresa a "día/mes". `datos/datos.js` (fuera del repo) lo genera `python datos/extraer_excel.py "<ruta del Excel>" datos/datos.js`. En la página publicada no existe, así que se ve vacía. Después vendrán de Supabase con inicio de sesión.
- **Diseño:** el skill `design-taste-frontend` en modo pantalla de app. Hay modo claro y modo oscuro, y funciona en celular.
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
