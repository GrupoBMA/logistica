/* Showrooms contra Odoo (27-nov-2026, pedido del usuario): lo que pidió cada sucursal para su showroom,
   comparado con lo que tiene hoy en Odoo y lo que vendió en 30 días. Pestaña propia después de Entregados,
   solo para la cuenta con logistica.usuarios.ve_showrooms (hoy admin).
   Datos: public.inv_showrooms() (lee la copia nocturna de Odoo del esquema bma). Regla: Inventario.nivelShowroom.
   Íconos de vehículo: siluetas.js (los mismos de Administración). */
(function(){
  var NIVEL = {
    sospechoso: {nombre: 'Sospechoso', etq: 'rojo'},
    revisar:    {nombre: 'Revisar',    etq: 'pend'},
    bien:       {nombre: 'Va bien',    etq: 'ok'},
    noexiste:   {nombre: 'No hay en Odoo', etq: 'anul'}
  };
  var ORDEN = {sospechoso: 0, revisar: 1, noexiste: 2, bien: 3};
  // Siglas de cada sucursal (las claves de Administración); en Odoo Guadalajara es el almacén "Washington"
  var SIGLAS = {'S-WAS': 'GDL', 'S-MOR': 'MLM'};
  var NOMBRE = {'S-WAS': 'Guadalajara'};
  var vista = null, ultimo = null, raiz = null;

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return '&#' + c.charCodeAt(0) + ';' }) }
  function num(n){ n = Math.round((+n || 0) * 10) / 10; return Number.isInteger(n) ? String(n) : n.toFixed(1) }
  function siglas(alm){ return SIGLAS[alm] || String(alm).replace(/^S-/, '') }
  function nombreSuc(datos, alm){ return NOMBRE[alm] || ((datos.almacenes || {})[alm] || alm).split(' - ')[0] }
  function cuadro(alm){ return '<span class="suc-sig" aria-hidden="true">' + esc(siglas(alm)) + '</span>' }

  function punto(color){
    var c = window.Siluetas ? Siluetas.muestraColor(color) : [];
    var fondo = !c.length ? '' : c.length === 1 ? c[0] : 'linear-gradient(90deg,' + c[0] + ' 50%,' + c[1] + ' 50%)';
    return '<span class="sr-pt' + (c.length ? '' : ' sin') + '"' + (fondo ? ' style="background:' + fondo + '"' : '') + '></span>';
  }

  /* Una fila por color: el número a la izquierda, junto a su círculo, y todos los números en la misma columna */
  function listaColores(cols){
    if(!cols || !cols.length) return '';
    return '<ul class="sr-colores">' + cols.map(function(c){
      return '<li><b>' + num(c.n) + '</b>' + punto(c.color) + '<span>' + esc(c.color) + '</span></li>';
    }).join('') + '</ul>';
  }
  function lado(cant, titulo, sub, cols, extra){
    return '<div class="sr-lado"><div class="sr-arr"><span class="cant">' + cant + '</span>' +
      '<span class="txt">' + (titulo ? '<b>' + titulo + '</b>' : '') + (sub ? '<small>' + sub + '</small>' : '') + '</span>' +
      (extra || '') + '</div>' + listaColores(cols) + '</div>';
  }

  /* Tres columnas por renglón (pedido del usuario, 27-nov-2026): lo que pidió, lo que tiene la sucursal en Odoo
     y lo que hay en las bodegas; cada una con sus colores, uno por fila */
  function renglon(p, conSuc){
    var nv = NIVEL[p.nivel], rollos = p.rollo ? 'Rollos' : '';
    var fig = window.Siluetas ? Siluetas.imagen(Siluetas.figura(p.texto + ' ' + (p.odoo || ''))) : '';
    // Si ya trae los colores aparte, el texto va sin el paréntesis de colores
    var texto = (p.pide_colores || []).length ? p.texto.replace(/\s*\([^()]*\)\s*$/, '') : p.texto;
    var pidio = '<div class="sr-lado sr-pidio">' + (conSuc ? cuadro(p.almacen) : '') + fig +
      '<div class="sr-pidio-c">' + lado(p.cantidad == null ? '–' : esc(p.cantidad), esc(texto),
        [conSuc ? esc(p.suc) : '', p.cantidad == null ? 'No dijo cuántas' : ''].filter(Boolean).join(' · '), p.pide_colores) + '</div></div>';
    var suc = p.existe
      ? lado(num(p.hay), esc(p.odoo), [rollos, 'Vendió ' + num(p.vendio) + ' en 30 días'].filter(Boolean).join(' · '), p.colores,
          '<span class="etq ' + nv.etq + '">' + nv.nombre + '</span>')
      : lado('–', '', 'No está en Odoo', null, '<span class="etq ' + nv.etq + '">' + nv.nombre + '</span>');
    var bod = p.existe
      ? lado(num(p.bodega), '', [rollos, 'Bodega 1: ' + num(p.bodega1), 'Bodega 2: ' + num(p.bodega2)].filter(Boolean).join(' · '), p.bodega_colores)
      : lado('–', '', 'No está en Odoo');
    return '<div class="tarjeta sr-fila sr-' + p.nivel + '">' + pidio + suc + bod + '</div>';
  }
  /* Separado por marca (pedido del usuario, 27-nov-2026): SUNL, Pastito, Alzator, Melamina y lo que no tiene marca en Odoo.
     La marca es la primera parte de la categoría de Odoo de los productos que cuentan (inv_showrooms la regresa). */
  var MARCAS = [['SUNL', 'SUNL'], ['PASTITO', 'Pastito'], ['ALZATOR', 'Alzator'], ['MELAMINA', 'Melamina'], ['', 'Otros']];
  function marcaDe(p){
    var m = String(p.marca || '').toUpperCase();
    // La melamina es su propio negocio (pedido del usuario, 27-nov-2026); en Odoo no trae categoría
    if(!m && /melamin/i.test(p.texto + ' ' + (p.odoo || ''))) m = 'MELAMINA';
    return MARCAS.some(function(x){ return x[0] === m }) ? m : '';
  }
  function tabla(lista, conSuc){
    var cab = '<div class="sr-cols"><span>Lo que pidió</span><span>Inventario de la sucursal en Odoo</span><span>Inventario en bodega</span></div>';
    return MARCAS.map(function(mk){
      var suyos = lista.filter(function(p){ return marcaDe(p) === mk[0] });
      if(!suyos.length) return '';
      return '<section class="sr-marca"><h2 class="sr-marca-t">' + esc(mk[1]) + '<span>' + suyos.length + '</span></h2>' + cab +
        '<div class="tarjetas">' + suyos.map(function(p){ return renglon(p, conSuc) }).join('') + '</div></section>';
    }).join('');
  }

  function pintar(){
    var datos = ultimo, m = raiz;
    var pedidos = (datos.pedidos || []).map(function(p){
      p.nivel = Inventario.nivelShowroom(p); p.suc = nombreSuc(datos, p.almacen); return p;
    });
    var sucs = [];
    pedidos.forEach(function(p){ if(sucs.indexOf(p.almacen) < 0) sucs.push(p.almacen) });
    sucs.sort(function(a, b){ return nombreSuc(datos, a).localeCompare(nombreSuc(datos, b), 'es') });
    function cuenta(l){ return l.filter(function(p){ return p.nivel === 'sospechoso' }).length }
    var top = pedidos.filter(function(p){ return p.nivel === 'sospechoso' })
      .sort(function(a, b){ return (b.hay - b.vendio) - (a.hay - a.vendio) });
    // Primero las sucursales y al final "Lo más sospechoso" (pedido del usuario, 27-nov-2026)
    var lista = sucs.map(function(alm){
      var suyos = pedidos.filter(function(p){ return p.almacen === alm })
        .sort(function(a, b){ return ORDEN[a.nivel] - ORDEN[b.nivel] });
      return {id: alm, nombre: nombreSuc(datos, alm), ico: cuadro(alm), n: cuenta(suyos), contenido: function(){ return tabla(suyos, false) }};
    }).concat([{id: 'top', nombre: 'Lo más sospechoso', ico: '<span class="suc-sig alerta" aria-hidden="true">!</span>', n: top.length, contenido: function(){
      return top.length ? tabla(top, true) : '<div class="inv-vacio"><b>Nada sospechoso</b></div>';
    }}]);
    var v = lista.filter(function(x){ return x.id === vista })[0] || lista[0];
    vista = v.id;
    var copia = datos.copia ? new Date(datos.copia).toLocaleString('es-MX', {day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit'}) : '';
    m.innerHTML = '<div class="inv-vistas sr-pantalla"><nav class="vistas-menu" aria-label="Sucursales">' + lista.map(function(x){
        return '<button type="button" class="vista' + (x.id === v.id ? ' on' : '') + (x.id === 'top' ? ' sr-top' : '') + '" data-sr="' + esc(x.id) + '">' + x.ico + '<span>' + esc(x.nombre) + '</span>' +
          '<b class="' + (x.n ? 'rojo' : '') + '">' + x.n + '</b></button>';
      }).join('') + (copia ? '<p class="sr-copia">Odoo al ' + esc(copia) + '</p>' : '') +
      '</nav><section class="vistas-cont">' + v.contenido() + '</section></div>';
  }

  function abrir(contenedor, sb){
    raiz = contenedor; raiz.hidden = false;
    if(!raiz.dataset.listo){
      raiz.dataset.listo = '1';
      raiz.addEventListener('click', function(e){
        var b = e.target.closest('[data-sr]'); if(!b || !ultimo) return;
        vista = b.dataset.sr; pintar(); window.scrollTo({top: 0});
      });
    }
    if(!ultimo) raiz.innerHTML = '<p class="inv-cargando">Cargando…</p>';
    sb.rpc('inv_showrooms').then(function(r){
      if(r.error) throw r.error;
      ultimo = r.data; pintar();
    }).catch(function(err){ raiz.innerHTML = '<p class="inv-error">' + esc(err && err.message || err) + '</p>' });
  }
  function cerrar(){ if(raiz){ raiz.hidden = true; raiz.innerHTML = ''; } ultimo = null; vista = null; }
  window.Showrooms = {abrir: abrir, cerrar: cerrar};
})();
