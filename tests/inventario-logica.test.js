// Pruebas de las reglas del inventario. Correr: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../inventario-logica.js');

// Catálogo inventado (no son datos reales): MC 150 con su lista; MC 300 sin lista
const CAT = {
  modelos: [{id: 1, nombre: 'MC 150', activo: true}, {id: 3, nombre: 'MC 300', activo: true}],
  caracteristicas: [
    {id: 1, nombre: 'Hidráulico', orden: 1, opciones: [{id: 11, nombre: 'Con'}, {id: 12, nombre: 'Sin'}]},
    {id: 2, nombre: 'Rodado', orden: 2, opciones: [{id: 21, nombre: 'Sencillo'}, {id: 22, nombre: 'Doble'}]}
  ],
  colores: [{id: 2, nombre: 'Azul'}, {id: 3, nombre: 'Rojo'}],
  piezas: [
    {id: 100, nombre: 'Chasis', lleva_color: false},
    {id: 101, nombre: 'Llanta', lleva_color: false},
    {id: 102, nombre: 'Carrocería', lleva_color: true},
    {id: 103, nombre: 'Hidráulico', lleva_color: false}
  ],
  materiales: [
    {modelo_id: 1, opcion_id: null, pieza_id: 100, cantidad: 1},
    {modelo_id: 1, opcion_id: null, pieza_id: 101, cantidad: 4},
    {modelo_id: 1, opcion_id: null, pieza_id: 102, cantidad: 1},
    {modelo_id: null, opcion_id: 11, pieza_id: 103, cantidad: 1},
    {modelo_id: null, opcion_id: 22, pieza_id: 101, cantidad: 2}
  ]
};
const buscar = (lista, nombre, color) => lista.find(p => p.nombre === nombre && (color === undefined || p.color === color));

test('piezas esperadas: base del modelo más lo que agrega cada opción, por color cuando la pieza lleva color', () => {
  const r = I.piezasEsperadas([
    {modelo_id: 1, opciones: [11, 21], color_id: 2, cantidad: 2},
    {modelo_id: 1, opciones: [12, 21], color_id: 3, cantidad: 3}
  ], CAT);
  assert.equal(buscar(r, 'Chasis').esperadas, 5);
  assert.equal(buscar(r, 'Chasis').color_id, null);
  assert.equal(buscar(r, 'Llanta').esperadas, 20);
  assert.equal(buscar(r, 'Hidráulico').esperadas, 2);
  assert.equal(buscar(r, 'Carrocería', 'Azul').esperadas, 2);
  assert.equal(buscar(r, 'Carrocería', 'Rojo').esperadas, 3);
  assert.equal(r.length, 5);
});

test('piezas esperadas: doble rodado agrega llantas', () => {
  const r = I.piezasEsperadas([{modelo_id: 1, opciones: [12, 22], color_id: 2, cantidad: 1}], CAT);
  assert.equal(buscar(r, 'Llanta').esperadas, 6);
});

test('piezas esperadas: lo que se quita (cantidad negativa) no deja piezas en cero o menos', () => {
  const cat = Object.assign({}, CAT, {materiales: CAT.materiales.concat([{modelo_id: null, opcion_id: 12, pieza_id: 100, cantidad: -1}])});
  const r = I.piezasEsperadas([{modelo_id: 1, opciones: [12, 21], color_id: 2, cantidad: 1}], cat);
  assert.equal(buscar(r, 'Chasis'), undefined);
});

test('modelos sin lista de piezas', () => {
  assert.deepEqual(I.sinListaDePiezas([
    {modelo_id: 1, opciones: [], color_id: 2, cantidad: 1},
    {modelo_id: 3, opciones: [], color_id: 2, cantidad: 1},
    {modelo_id: 3, opciones: [], color_id: 3, cantidad: 1}
  ], CAT), ['MC 300']);
});

test('diferencia: faltan o sobran', () => {
  assert.deepEqual(I.diferencia(10, 8), {faltan: 2, sobran: 0});
  assert.deepEqual(I.diferencia(10, 12), {faltan: 0, sobran: 2});
  assert.deepEqual(I.diferencia(10, 10), {faltan: 0, sobran: 0});
});

test('validar contenedor: número repetido sin importar espacios ni mayúsculas', () => {
  const datos = {numero: ' abc-1 ', llegada: '2026-11-18', renglones: [{modelo_id: 1, opciones: [], colores: [2], cantidad: 1}]};
  assert.ok(I.validarContenedor(datos, ['ABC-1']).includes('Ese contenedor ya está registrado'));
  assert.deepEqual(I.validarContenedor(datos, ['ABC-2']), []);
});

test('validar contenedor: campos que faltan y cantidades', () => {
  const e = I.validarContenedor({numero: '  ', llegada: '', renglones: []}, []);
  assert.ok(e.includes('Escribe el número de contenedor'));
  assert.ok(e.includes('Escribe la fecha de llegada'));
  assert.ok(e.includes('Agrega al menos un vehículo'));
  const e2 = I.validarContenedor({numero: 'X', llegada: '2026-11-18', renglones: [{modelo_id: 1, opciones: [], colores: [2], cantidad: 0}]}, []);
  assert.ok(e2.includes('La cantidad debe ser 1 o más'));
});

test('validar pieza: dañadas y negativos', () => {
  assert.ok(I.validarPieza({esperadas: 4, llegaron: 3, danadas: 4}).includes('No puede haber más dañadas que las que llegaron'));
  assert.ok(I.validarPieza({esperadas: 4, llegaron: -1, danadas: 0}).includes('Las cantidades no pueden ser negativas'));
  assert.deepEqual(I.validarPieza({esperadas: 4, llegaron: 4, danadas: 1}), []);
});

test('resumen de la revisión: suma faltantes, sobrantes, dañadas y lo que falta por revisar', () => {
  const r = I.resumenRevision([
    {esperadas: 10, llegaron: 8, danadas: 1, revisada: true},
    {esperadas: 4, llegaron: 5, danadas: 0, revisada: true},
    {esperadas: 2, llegaron: 2, danadas: 0, revisada: true},
    {esperadas: 6, llegaron: null, danadas: 0, revisada: false}
  ]);
  assert.deepEqual(r, {faltan: 2, sobran: 1, danadas: 1, pendientes: 1, total: 4});
});

test('nombre del vehículo en palabras', () => {
  assert.equal(I.nombreVehiculo({modelo_id: 1, opciones: [12, 21], color_id: 2}, CAT), 'MC 150 · Sin hidráulico · Rodado sencillo · Azul');
  assert.equal(I.nombreVehiculo({modelo_id: 1, opciones: [11, 22], color_id: 3}, CAT), 'MC 150 · Con hidráulico · Rodado doble · Rojo');
  assert.equal(I.nombreOpcion('Hidráulico', 'Con'), 'Con hidráulico');
  assert.equal(I.nombreOpcion('Rodado', 'Doble'), 'Rodado doble');
});

test('piezas con color: se reparten según lo contado de cada color', () => {
  const r = I.piezasEsperadas([
    {modelo_id: 1, opciones: [12, 21], colores: [2, 3], cantidad: 5, conteo: [{color_id: 2, contados: 2}, {color_id: 3, contados: 3}]}
  ], CAT);
  assert.equal(buscar(r, 'Carrocería', 'Azul').esperadas, 2);
  assert.equal(buscar(r, 'Carrocería', 'Rojo').esperadas, 3);
  assert.equal(buscar(r, 'Chasis').esperadas, 5);
});

test('piezas con color: un solo color en la hoja y sin conteo, todas de ese color', () => {
  const r = I.piezasEsperadas([{modelo_id: 1, opciones: [12, 21], colores: [3], cantidad: 4}], CAT);
  assert.equal(buscar(r, 'Carrocería', 'Rojo').esperadas, 4);
});

test('validar contenedor: cada vehículo necesita al menos un color', () => {
  const e = I.validarContenedor({numero: 'X', llegada: '2026-11-18', renglones: [{modelo_id: 1, opciones: [], colores: [], cantidad: 2}]}, []);
  assert.ok(e.includes('Escoge al menos un color'));
});

test('nombre con varios colores y suma del conteo', () => {
  assert.equal(I.nombreVehiculo({modelo_id: 1, opciones: [11, 21], colores: [3, 2]}, CAT), 'MC 150 · Con hidráulico · Rodado sencillo · Azul y Rojo');
  assert.equal(I.nombreModelo({modelo_id: 1, opciones: [11]}, CAT), 'MC 150 · Con hidráulico');
  assert.equal(I.nombreColores([2], CAT), 'Azul');
  assert.equal(I.sumaConteo([{color_id: 2, contados: 2}, {color_id: 3, contados: 4}]), 6);
});
