/* Showrooms contra Odoo (27-nov-2026, pedido del usuario): lo que pidió cada sucursal para su showroom,
   comparado con lo que tiene hoy en Odoo y lo que vendió en 30 días. Por ahora solo la cuenta admin.
   Datos: public.inv_showrooms() (lee la copia nocturna de Odoo del esquema bma). Regla: Inventario.nivelShowroom. */
(function(){
  var H = window.InventarioApp._h, E = H.E, esc = H.esc;
  var NIVEL = {
    sospechoso: {nombre: 'Sospechoso', etq: 'rojo'},
    revisar:    {nombre: 'Revisar',    etq: 'pend'},
    bien:       {nombre: 'Va bien',    etq: 'ok'},
    noexiste:   {nombre: 'No hay en Odoo', etq: 'anul'}
  };
  var ORDEN = {sospechoso: 0, revisar: 1, noexiste: 2, bien: 3};
  var vista = 'top';

  function nombreSuc(datos, alm){
    var n = (datos.almacenes || {})[alm] || alm;
    n = n.split(' - ')[0];                       // "Washington - SUNL Showroom" -> "Washington"
    return alm === 'S-WAS' ? 'Guadalajara' : n;  // en Odoo Guadalajara es el almacén "Washington"
  }
  function num(n){ n = Math.round((+n || 0) * 10) / 10; return Number.isInteger(n) ? String(n) : n.toFixed(1) }

  function tarjeta(p, conSuc){
    var nv = NIVEL[p.nivel], u = p.rollo ? (p.hay == 1 ? ' rollo' : ' rollos') : '';
    var datos = [];
    if(p.existe) datos.push('Vendió ' + num(p.vendio) + ' en 30 días');
    datos.push(p.cantidad == null ? 'No dijo cuántas' : 'Pide ' + p.cantidad);
    var cols = (p.colores || []).slice(0, 6).map(function(c){ return esc(c.color) + ' ' + num(c.n) }).join(' · ');
    return '<div class="tarjeta sr-' + p.nivel + '">' +
      '<span class="cant" title="Lo que tiene hoy en Odoo">' + (p.existe ? num(p.hay) : '–') + '</span>' +
      '<span class="txt"><b>' + (conSuc ? esc(p.suc) + ' · ' : '') + esc(p.texto) + '</b>' +
        '<small>' + (p.existe ? 'Tiene' + u + ' · ' : '') + datos.join(' · ') + '</small>' +
        (p.existe ? '<small class="sr-odoo">' + esc(p.odoo) + (cols ? ': ' + cols : '') + '</small>' : '') +
      '</span><span class="etq ' + nv.etq + '">' + nv.nombre + '</span></div>';
  }

  function pintar(m, datos){
    var pedidos = (datos.pedidos || []).map(function(p){
      p.nivel = H.I.nivelShowroom(p); p.suc = nombreSuc(datos, p.almacen); return p;
    });
    var sucs = [];
    pedidos.forEach(function(p){ if(sucs.indexOf(p.almacen) < 0) sucs.push(p.almacen) });
    sucs.sort(function(a, b){ return nombreSuc(datos, a).localeCompare(nombreSuc(datos, b), 'es') });
    function cuenta(lista){ return lista.filter(function(p){ return p.nivel === 'sospechoso' }).length }
    var top = pedidos.filter(function(p){ return p.nivel === 'sospechoso' })
      .sort(function(a, b){ return (b.hay - b.vendio) - (a.hay - a.vendio) });
    var lista = [{id: 'top', nombre: 'Lo más sospechoso', n: top.length, rojo: true, contenido: function(){
      return top.length ? '<div class="tarjetas">' + top.map(function(p){ return tarjeta(p, true) }).join('') + '</div>'
        : '<div class="inv-vacio"><b>Nada sospechoso</b></div>';
    }}].concat(sucs.map(function(alm){
      var suyos = pedidos.filter(function(p){ return p.almacen === alm })
        .sort(function(a, b){ return ORDEN[a.nivel] - ORDEN[b.nivel] });
      return {id: alm, nombre: nombreSuc(datos, alm), n: cuenta(suyos), rojo: true, contenido: function(){
        return '<div class="tarjetas">' + suyos.map(function(p){ return tarjeta(p, false) }).join('') + '</div>';
      }};
    }));
    var v = lista.filter(function(x){ return x.id === vista })[0] || lista[0];
    var copia = datos.copia ? new Date(datos.copia).toLocaleString('es-MX', {day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit'}) : '';
    m.innerHTML = '<header class="inv-cab"><h1>Showrooms</h1>' + (copia ? '<p>Odoo al ' + esc(copia) + '</p>' : '') + '</header>' +
      '<div class="inv-vistas"><nav class="vistas-menu" aria-label="Sucursales">' + lista.map(function(x){
        return '<button type="button" class="vista' + (x.id === v.id ? ' on' : '') + '" data-sr="' + esc(x.id) + '"><span>' + esc(x.nombre) + '</span>' +
          '<b class="' + (x.rojo && x.n ? 'rojo' : '') + '">' + x.n + '</b></button>';
      }).join('') + '</nav><section class="vistas-cont">' + v.contenido() + '</section></div>';
  }

  var ultimo = null;
  H.DIBUJAR.showrooms = function(m){
    H.rpc('inv_showrooms').then(function(d){
      if(E.seccion !== 'showrooms') return;
      ultimo = d; pintar(m, d);
    }).catch(function(err){ m.innerHTML = '<p class="inv-error">' + esc(H.mensaje(err)) + '</p>' });
  };
  document.addEventListener('click', function(e){
    var b = e.target.closest('[data-sr]'); if(!b || E.seccion !== 'showrooms' || !E.raiz || !E.raiz.contains(b)) return;
    vista = b.dataset.sr;
    if(ultimo) pintar(H.q('.inv-main', E.raiz), ultimo);
    window.scrollTo({top: 0});
  });
})();
