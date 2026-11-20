# Producción y ventas en la app (dejar el Drive)

Fecha: 20-nov-2026 · Estado: **flujo aprobado por el usuario; la parte 1 se publicó en vivo para corregir sobre ella**

Sigue a `2026-11-18-inventario-fase1-design.md` (recepción de contenedores, ya en uso). Junta lo que ahí eran las fases 2 (armado y etapas) y 3 (ventas y dejar el Drive), porque el usuario decidió mudar también el Drive a la app.

## Por qué

- Hoy las ventas llegan por **WhatsApp** y los **encargados de bodega** las suben al Excel ENTREGAS del Drive; Logística lo lee de ahí. Son las mismas personas que ya capturan los contenedores en la app. Capturar todo en un solo lugar, con pantallas guiadas, les es más fácil y más visual que el Excel.
- El jefe ve el avance al momento sin depender de la conexión con Google (que se corta cada 7 días).
- El mismo vehículo se sigue de punta a punta: contenedor → espera de armado → producción (con número de serie) → listo → flete → entregado.

## Lo que decidió el usuario

- **Etapas de producción, en orden:** Armado → **Revisión 1** (piezas faltantes o dañadas) → **Herrería** (solo especiales) → **Forrado** (solo especiales) → **Mecánica** (que encienda, acelerador, frenos…) → **Detallado y pintura** → **Revisión final**. Al pasar la revisión final queda **listo**.
- **Especial:** lo dice la venta (p. ej. garrafonero, caja seca). Un especial **siempre** pasa por herrería y forrado (la herrería es para ponerle el garrafonero, etc.). En un especial no se pone la pieza del hidráulico y esa pieza queda como **sobrante** (acordado el 18-nov).
- **Número de serie** (el del chasis) se captura **al entrar a producción** (acordado el 18-nov).
- Al entrar a producción se pregunta **¿Venta o showroom?** Venta: se liga a su remisión. Showroom: sin remisión; al terminar se queda en bodega y se puede **mandar a una sucursal**.
- No hay venta que se surta desde showroom: si llega una venta a bodega es porque no hay, y se arma desde cero.
- **El faltante desaparece como columna aparte.** Se liga a los defectos: si en la Revisión 1 falta una pieza, el vehículo pasa a **Faltantes**.
- **Esperando piezas** = ya está vendido, pero lo que se va a armar viene en un contenedor que todavía no llega.
- **Un encargado por bodega** mueve los vehículos de etapa.
- Si un vehículo no pasa una revisión, **se queda en esa etapa hasta que se corrija** (acordado el 18-nov).
- **Flujo de una venta** (aprobado el 20-nov): dos pasos separados, *Nueva venta* y *Entrar a producción* (ver abajo). El costo de envío y el fletero se capturan después, en el paso de *Flete*.
- **Paso del Drive a la app: cambio en un solo día** (opción A, 20-nov). Se construye y prueba todo con datos de prueba, un día acordado se cargan una sola vez las ventas del Excel y desde ese día se captura solo en la app y se deja de leer el Drive. Nada de capturar en dos lugares a la vez.

## Metas

- Que el encargado capture una venta en menos de un minuto, sin teclear lo que ya se puede escoger.
- Que en cualquier momento se sepa, por bodega: qué ventas esperan piezas, cuáles están por armar, en qué etapa va cada vehículo, cuáles tienen faltantes, cuáles están listos para el flete y cuáles se entregaron.
- Que Logística (Ventas, Rutas, Cambios, Entregados) siga funcionando igual para el jefe, pero leyendo de la app.

## No metas (por ahora)

- Descontar piezas solas al armar (depende de la lista de piezas, que está **en pausa**). Se diseña el lugar, pero no se activa.
- Préstamos, reparaciones y bajas de piezas.
- Traspasos entre bodegas. Número de motor. Conteo físico.
- Captura desde celular (se piensa para tablet y computadora).

## Anti-metas (sería un fracaso aunque funcione)

- Que el encargado tenga que capturar lo mismo en dos lados, o que una venta quede en el Excel y en la app (o en ninguno).
- Pantallas con filtros regados, `<select>` o mucho texto: debe seguir el estilo de la recepción de contenedores (menús, listas para escoger, botones grandes, − / +).
- Que el jefe pierda algo de lo que hoy ve en Logística.

## Cómo funciona

### Estados de una venta

| Estado | Qué significa | Cómo entra |
|---|---|---|
| Esperando piezas | Vendida, pero en la bodega no hay vehículo de ese modelo en espera de armado | Sola, al darla de alta o cuando se acaban los de ese modelo |
| Por armar | Hay vehículo en espera de armado para ella | Sola, al darla de alta o al revisarse un contenedor que trae ese modelo |
| En producción | Ya tiene número de serie y va en alguna etapa | Al entrar a producción |
| Faltantes | La Revisión 1 encontró piezas faltantes (o un daño que impide seguir) | Al guardar la Revisión 1 con faltantes |
| Lista para enviar | Pasó la revisión final | Al pasar la revisión final |
| En camino | Se le puso flete y salió | En el paso de Flete |
| Entregada | Llegó a su destino | Al marcarla entregada |

Los estados de Logística (Listo para enviar, En proceso, No iniciado, Esperando piezas…) salen de aquí.

### 1. Nueva venta (encargado)

Menú **Nueva venta**, paso a paso:
1. **Remisión** (texto; no se repite, admite partes como 153/1).
2. **Modelo** con sus opciones y **color** (de los catálogos).
3. **¿Es especial?** Sí / No. Si es sí: **qué lleva** (texto corto: garrafonero, caja seca…).
4. **Vendedor**, **fecha de compra** (hoy por omisión) y **destino**.
5. Resumen y guardar.

Al guardar, la app la pone en **Por armar** o **Esperando piezas** según haya o no vehículos de ese modelo, opciones y color en espera de armado en esa bodega.

### 2. Entrar a producción (encargado)

Menú **Producción → Entrar a producción**:
1. **¿Venta o showroom?**
2. **Venta:** escoge la remisión de la lista *Por armar* (muestra modelo, color y si es especial). **Showroom:** escoge modelo, opciones y color de lo que hay en espera de armado.
3. **Número de serie** del chasis (texto; no se repite).
4. Guardar: un vehículo sale de *En espera de armado* y queda en **Armado**. Si es especial, su ruta incluye herrería y forrado.

### 3. Etapas (encargado)

Pantalla **Producción**: los vehículos agrupados por etapa (como columnas o secciones), cada uno con número de serie, modelo, color, remisión o "Showroom", y días en la etapa. Al picar uno se abre su ficha con su avance y un botón grande **"Pasar a <siguiente etapa>"**.

- **Revisión 1:** "✓ Todo bien" o anotar daños (tipo, gravedad, cantidad, igual que en la revisión de contenedores). Si algún daño es **Faltante de pieza**, el vehículo queda en **Faltantes** hasta que se marque "Ya se puso"; luego sigue a la siguiente etapa.
- **Revisión final:** "✓ Pasa" o "No pasa" (con motivo); si no pasa, se queda ahí hasta que se corrija.
- Las demás etapas: solo "Pasar a la siguiente". Herrería y forrado se saltan solas si no es especial.

### 4. Flete y entrega (encargado)

En **Listos para enviar**: costo de envío, si es **liquidado o anticipo**, **fletero** y ETA → queda **En camino**. Luego **"Entregada"** → pasa a Entregados.

### 5. Showroom

Los de showroom que pasan la revisión final quedan en **Showroom** (por bodega). Desde ahí: **Mandar a sucursal** (escoger sucursal) → queda registrado dónde está. *(Fase 4.)*

### Lo que ve Logística

Ventas, Rutas, Cambios y Entregados se arman con los datos de la app en vez de los del Drive. Los 5 pasos del taller (rayitas) se calculan de las etapas nuevas: Armado → AR, Herrería → H, Forrado → F, Detallado y pintura → P, Revisión final → R (Revisión 1 y Mecánica no tienen rayita propia). "Con faltante" sale de **Faltantes**. Rutas sigue igual (lee destino y estado).

### Carga única del Excel (día del cambio)

Un script lee la hoja VENTAS y la hoja ENTREGADO del Excel y las carga en las tablas nuevas:
- cada renglón → una venta con su remisión, vendedor, fecha, destino, tipo de destino, flete, fletero y colores de las celdas;
- los pasos AR/H/F/P/R → la etapa equivalente (la más avanzada en OK);
- sin número de serie: se captura cuando el encargado la toque por primera vez;
- el vehículo en texto libre se guarda tal cual y, si se puede, se reconoce el modelo.

## Orden de construcción

1. Nueva venta, entrar a producción, etapas y faltantes (con datos de prueba).
2. Flete y entregado, y Logística leyendo de la app (con datos de prueba, sin apagar el Drive).
3. Carga única del Excel y apagar el Drive: **el día del cambio**.
4. Showroom y envíos a sucursales.

Cada parte se prueba antes de pasar a la siguiente. Hasta el paso 3, lo nuevo no se muestra a las bodegas en vivo, o se muestra marcado como prueba (ver pendientes).

## Restricciones

- Repo público: nada de datos reales en el código.
- Supabase, esquema `logistica`, tablas nuevas con prefijo `inv_`; todo por funciones `security definer` que revisan rol y bodega (como la fase 1). Bitácora con motivo en cada corrección; nada se borra, se anula.
- Mismo estilo de pantallas que la recepción de contenedores.

## Lo que queda al constructor

Nombres de tablas y funciones, el diseño visual de cada pantalla siguiendo la fase 1, cómo se reconoce el modelo en el texto libre del Excel, y el orden exacto de los pasos dentro de cada captura.

## Decisiones del constructor (para que el usuario las revise)

- **Bodega de la venta:** la venta es de la bodega de quien la captura (reemplaza la columna ACTIVACIÓN). El admin escoge bodega al capturar.
- **Destino y zona:** el destino se escoge de una lista con los destinos que ya existen (para que Rutas lo reconozca), con "Otro" para escribir uno nuevo. Se pregunta el **tipo de destino** (Local, Semi Local, Foráneo, Sucursal, Se recoge en granja), que reemplaza al color de la celda del Excel.
- **Faltantes:** el vehículo se queda en Faltantes (no avanza) hasta que se marque "Ya se puso", igual que la regla de "se queda ahí hasta que se corrija".
- **Quién mueve las etapas, flete y entrega:** el encargado de cada bodega (cuentas `bodega1`/`bodega2`) y el admin. Carlos solo consulta.
- **Antes del día del cambio**, producción y ventas no se muestran a las bodegas: se prueban con datos de prueba (en una copia local o con registros marcados como prueba que se borran antes de la carga).

## Pendiente del usuario

(Se llena con las respuestas a las preguntas de la revisión.)
