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

  /* Dos columnas por renglón: a la izquierda lo que pidió, a la derecha lo que hay en Odoo (con una fila por color) */
  function renglon(p, conSuc){
    var nv = NIVEL[p.nivel], u = p.rollo ? (p.hay == 1 ? 'rollo · ' : 'rollos · ') : '';
    var fig = window.Siluetas ? Siluetas.imagen(Siluetas.figura(p.texto + ' ' + (p.odoo || ''))) : '';
    var pidio = '<div class="sr-lado">' + (conSuc ? cuadro(p.almacen) : '') + fig +
      '<span class="cant">' + (p.cantidad == null ? '–' : esc(p.cantidad)) + '</span>' +
      '<span class="txt"><b>' + esc(p.texto) + '</b>' +
        (conSuc || p.cantidad == null ? '<small>' + [conSuc ? esc(p.suc) : '', p.cantidad == null ? 'No dijo cuántas' : ''].filter(Boolean).join(' · ') + '</small>' : '') +
      '</span></div>';
    var colores = (p.colores || []).map(function(c){
      return '<li>' + punto(c.color) + '<span>' + esc(c.color) + '</span><b>' + num(c.n) + '</b></li>';
    }).join('');
    var hay = '<div class="sr-lado sr-hay"><div class="sr-arr">' +
        '<span class="cant">' + (p.existe ? num(p.hay) : '–') + '</span>' +
        '<span class="txt">' + (p.existe
          ? '<b>' + esc(p.odoo) + '</b><small>' + u + 'Vendió ' + num(p.vendio) + ' en 30 días</small>'
          : '<small>No está en Odoo</small>') + '</span>' +
        '<span class="etq ' + nv.etq + '">' + nv.nombre + '</span></div>' +
        (colores ? '<ul class="sr-colores">' + colores + '</ul>' : '') + '</div>';
    return '<div class="tarjeta sr-fila sr-' + p.nivel + '">' + pidio + hay + '</div>';
  }
  function tabla(lista, conSuc){
    return '<div class="sr-cols"><span>Lo que pidió</span><span>Lo que hay en Odoo</span></div>' +
      '<div class="tarjetas">' + lista.map(function(p){ return renglon(p, conSuc) }).join('') + '</div>';
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
