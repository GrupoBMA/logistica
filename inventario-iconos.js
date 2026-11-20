/* Íconos de piezas y de tipos de daño (pedido del usuario, 21-nov-2026).
   Se escogen por palabras del nombre, así una pieza o un daño nuevo del catálogo toma su ícono solo.
   Dibujos de línea, como el resto de la app (stroke = currentColor). */
(function(){
  var H = window.InventarioApp._h;
  function svg(d){ return '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+d+'</svg>' }
  var D = {
    llanta:   '<circle cx="10" cy="10" r="7"/><circle cx="10" cy="10" r="2.6"/><path d="M10 3v4.4M10 12.6V17M3 10h4.4M12.6 10H17"/>',
    freno:    '<circle cx="10" cy="10" r="6.5"/><circle cx="10" cy="10" r="1.6"/><path d="M14.5 5.5c1.5 1.3 2.3 2.8 2.5 4.5"/>',
    luz:      '<path d="M7 14h6M8 17h4"/><path d="M10 3a4.5 4.5 0 0 0-2.8 8c.6.5.8 1.2.8 2h4c0-.8.2-1.5.8-2A4.5 4.5 0 0 0 10 3z"/>',
    bateria:  '<rect x="3" y="6" width="14" height="10" rx="1.5"/><path d="M6 6V4.5M14 6V4.5M6.5 11h2M12 10v2M11 11h2"/>',
    espejo:   '<ellipse cx="10" cy="7.5" rx="5" ry="4"/><path d="M10 11.5V17M7.5 17h5"/>',
    asiento:  '<path d="M6 3.5h5a1.5 1.5 0 0 1 1.5 1.5v6H7.5L6 3.5z"/><path d="M5 11h10v2.5H5zM7 13.5V17M13 13.5V17"/>',
    varilla:  '<path d="M3.5 16.5 16.5 3.5"/><circle cx="4" cy="16" r="1.4"/><circle cx="16" cy="4" r="1.4"/>',
    chicote:  '<path d="M3 15c3 0 3-10 7-10s4 10 7 10"/><circle cx="3" cy="15" r="1.2"/><circle cx="17" cy="15" r="1.2"/>',
    resorte:  '<path d="M6 3h8M6 17h8"/><path d="M7 3l6 2.3-6 2.3 6 2.4-6 2.3 6 2.4-6 2.3"/>',
    buje:     '<circle cx="10" cy="10" r="6.5"/><circle cx="10" cy="10" r="3"/>',
    tornillo: '<path d="M7 3h6l1 2.5H6L7 3z"/><path d="M8.5 5.5v11h3v-11M8.5 9l3-1M8.5 12l3-1M8.5 15l3-1"/>',
    escape:   '<path d="M3 12h9a3 3 0 0 0 3-3V6"/><path d="M3 15h9a6 6 0 0 0 6-6V6"/><path d="M13.5 6h3"/>',
    manubrio: '<path d="M3 7c2 0 3 1.5 4 3h6c1-1.5 2-3 4-3"/><path d="M10 10v7"/>',
    tablero:  '<path d="M3.5 14a6.5 6.5 0 1 1 13 0"/><path d="M10 14l3-4"/><path d="M3.5 14h13"/>',
    claxon:   '<path d="M4 8v4h3l5 4V4L7 8H4z"/><path d="M14.5 7.5a3.5 3.5 0 0 1 0 5"/>',
    engrane:  '<circle cx="10" cy="10" r="3"/><path d="M10 2.5v2.5M10 15v2.5M2.5 10H5M15 10h2.5M4.7 4.7l1.8 1.8M13.5 13.5l1.8 1.8M4.7 15.3l1.8-1.8M13.5 6.5l1.8-1.8"/>',
    ventilador: '<circle cx="10" cy="10" r="1.5"/><path d="M10 8.5C9 5 10.5 3 13 3.5s1 4-3 5zM11.5 10c3.5-1 5.5.5 5 3s-4 1-5-3zM10 11.5c1 3.5-.5 5.5-3 5s-1-4 3-5zM8.5 10c-3.5 1-5.5-.5-5-3s4-1 5 3z"/>',
    gasolina: '<path d="M4 17V4.5A1.5 1.5 0 0 1 5.5 3h5A1.5 1.5 0 0 1 12 4.5V17M3 17h10M5.5 7h5"/><path d="M12 9h1.5a1.5 1.5 0 0 1 1.5 1.5V14a1 1 0 0 0 2 0V7l-2-2"/>',
    carroceria: '<path d="M3 13c0-3 2.5-6 7-6s7 3 7 6"/><path d="M2.5 13h15v2h-15z"/>',
    tijera:   '<path d="M10 3v14M6 6l4 3 4-3M7 17h6"/>',
    caja:     '<path d="M3 7.5 10 4l7 3.5v7L10 18l-7-3.5z"/><path d="M3 7.5 10 11l7-3.5M10 11v7"/>',
    goma:     '<rect x="4" y="6" width="12" height="8" rx="4"/>',
    pieza:    '<rect x="4" y="4" width="12" height="12" rx="2.5"/><path d="M8 10h4"/>',
    // Daños
    golpe:    '<path d="M10 2.5 11.8 7l4.7-.8-3 3.6 3 3.7-4.7-.8L10 17.5 8.2 13l-4.7.8 3-3.7-3-3.6 4.7.8z"/>',
    rayon:    '<path d="M4 15 15 4M6.5 16 16 6.5M3.5 11.5 11.5 3.5"/>',
    pintura:  '<path d="M4 4h10v4H4z"/><path d="M14 6h2v4l-6 1.5V13"/><path d="M9 13h2v4H9z"/>',
    faltante: '<rect x="4" y="4" width="12" height="12" rx="2.5" stroke-dasharray="2.2 2"/><path d="M8 10h4"/>',
    electrico: '<path d="M11 2.5 5 11h4.5L8.5 17.5 15 9h-4.5z"/>',
    motor:    '<path d="M4 7h3V5h5v2h2l2 2v5h-2v2H8l-2-2H4z"/><path d="M2 9v3"/>',
    oxido:    '<circle cx="7" cy="8" r="2.5"/><circle cx="13" cy="12" r="3"/><circle cx="7.5" cy="14.5" r="1.5"/>',
    cristal:  '<path d="M4 4h12v12H4z"/><path d="M8 4l2 4-3 3 4 5M10 8l4-1"/>',
    documento: '<path d="M5 2.5h7l3 3v12H5z"/><path d="M12 2.5v3h3M7.5 10h5M7.5 13h5"/>',
    llave:    '<circle cx="7" cy="10" r="3.5"/><path d="M10.5 10H17M14 10v2.5M16 10v2"/>',
    gota:     '<path d="M10 3c2.5 3.5 4.5 6 4.5 8.5a4.5 4.5 0 0 1-9 0C5.5 9 7.5 6.5 10 3z"/>',
    error:    '<circle cx="10" cy="10" r="7"/><path d="M10 6v5M10 13.5v.5"/>'
  };
  // Palabras → ícono, en orden (la primera que coincide gana)
  var PIEZAS = [
    [/llanta|rin/, 'llanta'], [/balata|freno|sensor/, 'freno'], [/faro|direccional|reflejante|luz/, 'luz'], [/bater/, 'bateria'],
    [/espejo/, 'espejo'], [/asiento|respaldo|coder/, 'asiento'], [/chicote/, 'chicote'], [/varilla|palanca|leva|pata|pedal|barra/, 'varilla'],
    [/muelle|resorte/, 'resorte'], [/buje|balero|abrazadera|tap[oó]n/, 'buje'], [/tornill/, 'tornillo'], [/escape/, 'escape'],
    [/manubrio/, 'manubrio'], [/tablero|veloc/, 'tablero'], [/claxon/, 'claxon'], [/diferencial|flecha|krank|krack|motor/, 'engrane'],
    [/ventilador/, 'ventilador'], [/gasolina|bomba/, 'gasolina'], [/salpicadera|carrocer|cofre/, 'carroceria'], [/tijera/, 'tijera'],
    [/caja|tapadera/, 'caja'], [/goma/, 'goma']
  ];
  var DANOS = [
    [/faltante/, 'faltante'], [/golpe|abollad/, 'golpe'], [/ray/, 'rayon'], [/chorread/, 'gota'], [/pintura/, 'pintura'],
    [/el[eé]ctric|bater/, 'electrico'], [/motor|transmisi|clutch/, 'motor'], [/freno/, 'freno'], [/llanta|rin/, 'llanta'],
    [/[oó]xido|corrosi/, 'oxido'], [/cristal|espejo|faro/, 'cristal'], [/asiento|vestidura/, 'asiento'], [/documento|llave/, 'documento'],
    [/armado/, 'llave'], [/chasis/, 'carroceria']
  ];
  function buscar(lista, nombre, porOmision){
    var n = String(nombre||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    for(var i=0; i<lista.length; i++){ if(lista[i][0].test(n)) return lista[i][1]; }
    return porOmision;
  }
  H.icoPieza = function(nombre){ return svg(D[buscar(PIEZAS, nombre, 'pieza')]) };
  H.icoDano = function(nombre){ return svg(D[buscar(DANOS, nombre, 'error')]) };
})();
