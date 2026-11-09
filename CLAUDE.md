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

### Prioridad actual (9-nov-2026)

Ir de poco en poco, empezando por lo más importante: **el vehículo y su entrega, y que el flujo funcione**. La fecha importa, pero solo como dato. Por ahora el usuario pidió **ignorar los colores (zonas) y los fletes**: las dudas de abajo sobre esos temas esperan.

### Pendientes por confirmar con el usuario

- Qué significa la **X** en los pasos del taller (hoy se pinta en rojo, "Marcado con X").
- **Motoplaza** viene en un naranja distinto (ED7D31) al de las colonias de Guadalajara (FFC000). Hoy se trata como local cerca.
- Mochis, Culiacán, Mazatlán, Vallarta y Lo de Marcos vienen en azul claro (6FA8DC). Hoy van con sucursales.
- Qué significan los **colores de la columna vehículo** (parecen ir por modelo: MC 150, MC 200, MC 300 DR con o sin hidráulico).
- "Lista para salir" se tomó como **R = OK**.

## Estado actual (9-nov-2026)

`index.html` es la app: un solo archivo, sin librerías, letra Geist. Es la **segunda propuesta de diseño** (la primera, tipo tabla, se descartó porque se veía igual al Excel). El usuario pidió que al entrar se vea limpio, muy sencillo de entender y fácil de leer, y que funcione como un sistema con un flujo.

- **Datos de prueba:** `datos/datos.js` (fuera del repo) lo genera `python datos/extraer_excel.py "<ruta del Excel>" datos/datos.js`. En la página publicada no existe, así que se ve vacía ("Todavía no hay entregas cargadas"). Después los datos vendrán de Supabase con inicio de sesión.
- **Pestañas:** arriba están **Listas** (la primera, se abre al entrar) y **Flujo**.
- **Pestaña Listas** (pedido del usuario, 9-nov-2026): solo las unidades con **las 5 casillas en OK** (armado, herrería, forrado, pintura y revisión). Van en tarjetas, la más antigua primero, con buscador. No es lo mismo que la parada "Lista" del flujo, que toma R = OK sin fletero.
- **El flujo (la ruta):** cada unidad pasa por 6 paradas: Vendida → Taller → Lista → Con flete → En camino → Entregada. La parada inicial sale del Excel así:
  - **Vendida:** ningún paso del taller marcado;
  - **Taller:** algún paso marcado, pero la R no está en OK;
  - **Lista:** R en OK y sin fletero;
  - **Con flete:** R en OK y con fletero.

  "En camino" y "Entregada" no existen en la hoja VENTAS (*pendiente*: Entregada vendrá de la hoja ENTREGADO).
- **Inicio:** solo la ruta con el conteo de cada parada y, abajo, hasta 3 avisos de "Necesita atención":
  - listas sin flete;
  - con faltante;
  - más de 45 días desde la venta (el umbral está en `VIEJA` y está *por confirmar*).
- **Al tocar una parada:** la ruta se hace compacta arriba y abajo salen las tarjetas de esa parada, agrupadas por zona y con la más antigua primero. Hay filtro por zona y buscador. Cada tarjeta muestra:
  - el modelo corto y el detalle, sacados del texto del vehículo con la función `nombre()`;
  - el destino y los días;
  - el faltante;
  - el avance del taller (n de 5) o la fecha de venta.
- **Ficha:** el recorrido de la unidad por las 6 paradas (con los 5 pasos del taller, el vendedor, la remisión y el fletero) .
- **Solo lectura** (pedido del usuario, 9-nov-2026): la app no mueve ni edita nada. No hay botones de avanzar: la parada de cada unidad sale de los datos.
- **Diseño:** el skill `design-taste-frontend` en modo pantalla de app. El cromo va sin color; el color solo está en los datos (zonas, avisos y pasos con X). Hay modo claro y modo oscuro. En celular la ruta se pone en vertical.
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
