/* Inventario: Vehículos y Piezas (con sus vistas), Catálogos (solo admin) y Cambios (solo admin). */
(function(){
  var H = window.InventarioApp._h, E = H.E, I = H.I, esc = H.esc, q = H.q;
  function main(){ return q('.inv-main', E.raiz) }
  function errorArriba(err){ main().insertAdjacentHTML('afterbegin', '<p class="inv-error">'+esc(H.mensaje(err))+'</p>') }
  function plural(n, uno, varios){ return n + ' ' + (n===1 ? uno : varios) }

  // ================================================================ Inventario (21-nov-2026): Vehículos y Piezas, cada uno con sus vistas y conteos,
  // como el menú de Logística. Pedido del usuario: ver los listos para venta, los de showroom, los que esperan piezas, los que
  // les faltan piezas…; y en piezas el total, las dañadas y las faltantes.
  var VISTA = {vehiculos: null, piezas: null};
  try { VISTA.vehiculos = localStorage.getItem('logistica.invVeh'); VISTA.piezas = localStorage.getItem('logistica.invPz'); } catch(e){}
  function vistas(m, titulo, sub, lista, actual, clave){
    // lista: [{id, nombre, n, rojo, contenido}]
    var v = lista.filter(function(x){ return x.id===actual })[0] || lista[0];
    m.innerHTML = '<header class="inv-cab"><h1>'+esc(titulo)+'</h1><p>'+esc(sub)+'</p></header>'+
      '<div class="inv-vistas"><nav class="vistas-menu" aria-label="Vistas">'+lista.map(function(x){
        return '<button type="button" class="vista'+(x.id===v.id ? ' on' : '')+'" data-vista="'+clave+':'+x.id+'"><span>'+esc(x.nombre)+'</span>'+
          '<b class="'+(x.rojo && x.n ? 'rojo' : '')+'">'+x.n+'</b></button>';
      }).join('')+'</nav><section class="vistas-cont">'+v.contenido()+'</section></div>';
  }
  document.addEventListener('click', function(e){
    var b = e.target.closest('[data-vista]'); if(!b || !E.raiz || !E.raiz.contains(b)) return;
    var p = b.dataset.vista.split(':');
    VISTA[p[0]] = p[1];
    try { localStorage.setItem(p[0]==='vehiculos' ? 'logistica.invVeh' : 'logistica.invPz', p[1]) } catch(er){}
    H.ir(p[0]);
  });
  function vacio(t){ return '<div class="inv-vacio"><b>'+esc(t)+'</b></div>' }

  H.DIBUJAR.vehiculos = function(m){
    Promise.all([H.rpc('inv_produccion', {p_bodega: E.verBodega}), H.rpc('inv_ventas', {p_bodega: E.verBodega}), H.rpc('inv_inventario', {p_bodega: E.verBodega})]).then(function(r){
      if(E.seccion!=='vehiculos') return;
      var P = H.prod, veh = r[0], ventas = r[1], espera = r[2].espera || [];
      function casilla(h){
        var est = h.faltantes ? '<span class="etq rojo chica">Faltan piezas</span>' : h.no_paso ? '<span class="etq rojo chica">No pasó la revisión final</span>'
          : h.etapa==='listo' ? '<span class="etq ok chica">Listo</span>' : '<span class="etq azul chica">'+esc(P.etapa(h.etapa).nombre)+'</span>';
        return '<button type="button" class="casilla" data-ficha-veh="'+h.id+'"><span class="c-arriba"><b>'+esc(h.serie)+'</b>'+est+'</span>'+
          '<span class="c-veh">'+P.puntoColor(h.color_id)+esc(P.nombreVeh(h))+'</span>'+
          '<span class="c-abajo"><span>'+P.paraDe(h)+(h.especial ? ' · Especial' : '')+'</span><span>'+esc(P.dias(h.etapa_desde))+'</span></span></button>';
      }
      function casillas(lista, nada){ return lista.length ? '<div class="casillas">'+lista.map(casilla).join('')+'</div>' : vacio(nada) }
      var listosVenta = veh.filter(function(h){ return h.etapa==='listo' && h.venta && !h.no_paso });
      var showroom = veh.filter(function(h){ return h.etapa==='listo' && !h.venta });
      var enProd = veh.filter(function(h){ return h.etapa!=='listo' && !h.faltantes && !h.no_paso });
      var falt = veh.filter(function(h){ return h.faltantes }), nop = veh.filter(function(h){ return h.no_paso });
      var esperan = ventas.filter(function(u){ return u.estado_venta==='esperando' });
      var nEspera = espera.reduce(function(s, x){ return s + (+x.cantidad||0) }, 0);
      vistas(m, 'Vehículos', 'Dónde está cada vehículo de '+(E.rol==='bodega' ? 'tu bodega' : H.nombreBodega(E.verBodega).toLowerCase())+'.', [
        {id: 'listos', nombre: 'Listos para venta', n: listosVenta.length, contenido: function(){ return casillas(listosVenta, 'No hay vehículos listos para enviar') }},
        {id: 'showroom', nombre: 'Showroom', n: showroom.length, contenido: function(){ return casillas(showroom, 'No hay vehículos de showroom listos') }},
        {id: 'produccion', nombre: 'En producción', n: enProd.length, contenido: function(){ return casillas(enProd, 'No hay vehículos en producción') }},
        {id: 'faltantes', nombre: 'Les faltan piezas', n: falt.length, rojo: true, contenido: function(){ return casillas(falt, 'A ningún vehículo le faltan piezas') }},
        {id: 'no_paso', nombre: 'No pasaron la revisión final', n: nop.length, rojo: true, contenido: function(){ return casillas(nop, 'Todos pasaron la revisión final') }},
        {id: 'esperando', nombre: 'Ventas esperando piezas', n: esperan.length, contenido: function(){
          return esperan.length ? '<div class="casillas">'+esperan.map(function(u){
            return '<button type="button" class="casilla" data-ficha-venta="'+u.id+'"><span class="c-arriba"><b>'+esc(P.remisionDe(u))+'</b><span class="etq pend chica">Esperando piezas</span></span>'+
              '<span class="c-veh">'+P.puntoColor(u.color_id)+esc(P.nombreVeh(u))+'</span>'+
              '<span class="c-abajo"><span>'+esc(u.vendedor)+' · '+esc(u.destino)+'</span><span>'+esc(P.dias(u.fecha))+'</span></span></button>';
          }).join('')+'</div>' : vacio('Ninguna venta está esperando piezas') }},
        {id: 'espera', nombre: 'En espera de armado', n: nEspera, contenido: function(){
          return espera.length ? '<div class="tarjetas">'+espera.map(function(x){
            return '<div class="tarjeta"><span class="cant">'+x.cantidad+'</span><span class="txt"><b>'+P.puntoColor(x.color_id)+esc(P.nombreVeh(x))+'</b></span></div>';
          }).join('')+'</div>' : vacio('No hay vehículos en espera de armado') }}
      ], VISTA.vehiculos, 'vehiculos');
    }).catch(function(err){ m.innerHTML = '<p class="inv-error">'+esc(H.mensaje(err))+'</p>' });
  };

  H.DIBUJAR.piezas = function(m){
    H.rpc('inv_inventario', {p_bodega: E.verBodega}).then(function(inv){
      if(E.seccion!=='piezas') return;
      var piezas = inv.piezas || [], danos = inv.danos || [], falt = inv.faltantes || [];
      var total = piezas.reduce(function(s, x){ return s + (+x.disponibles||0) }, 0);
      var nDan = piezas.reduce(function(s, x){ return s + (+x.danadas||0) }, 0);
      var nFalt = falt.reduce(function(s, x){ return s + (+x.contenedores||0) + (+x.vehiculos||0) }, 0);
      function fila(ico, nombre, det, n, extra){
        return '<div class="tarjeta"><span class="ico-p">'+ico+'</span><span class="txt"><b>'+esc(nombre)+'</b>'+(det ? '<small>'+det+'</small>' : '')+'</span>'+(extra||'')+'<span class="cant">'+n+'</span></div>';
      }
      function grav(g){ return {leve: 'Leve', media: 'Media', grave: 'Grave'}[g] || '' }
      vistas(m, 'Piezas', 'Lo que hay de cada pieza, según los contenedores ya revisados.', [
        {id: 'total', nombre: 'Disponibles', n: total, contenido: function(){
          return piezas.length ? '<div class="tarjetas">'+piezas.map(function(x){
            return fila(H.icoPieza(x.pieza), x.pieza + (x.color ? ' · '+x.color : ''), 'Disponibles', x.disponibles,
              (+x.danadas ? '<span class="etq rojo chica">'+x.danadas+(+x.danadas===1 ? ' dañada' : ' dañadas')+'</span>' : ''));
          }).join('')+'</div>' : vacio('Todavía no hay piezas: entran al revisar un contenedor') }},
        {id: 'danadas', nombre: 'Dañadas', n: nDan, rojo: true, contenido: function(){
          return danos.length ? '<div class="tarjetas">'+danos.map(function(d){
            var t = I.porId(E.cat.defectos, d.defecto_id), tn = t ? t.nombre : '?';
            return '<div class="tarjeta"><span class="ico-p">'+H.icoPieza(d.pieza||'')+'</span><span class="txt"><b>'+esc(d.pieza || 'Del contenedor')+'</b>'+
              '<small><span class="ico-mini">'+H.icoDano(tn)+'</span>'+esc(tn)+(d.gravedad ? ' · '+grav(d.gravedad) : '')+' · contenedor '+esc(d.contenedor)+'</small></span><span class="cant">'+d.cantidad+'</span></div>';
          }).join('')+'</div>' : vacio('No hay piezas dañadas') }},
        {id: 'faltantes', nombre: 'Faltantes', n: nFalt, rojo: true, contenido: function(){
          return falt.length ? '<div class="tarjetas">'+falt.map(function(x){
            var det = [+x.contenedores ? x.contenedores+' no llegaron en los contenedores' : '', +x.vehiculos ? x.vehiculos+' le faltan a vehículos en producción' : ''].filter(Boolean).join(' · ');
            return fila(H.icoPieza(x.pieza), x.pieza, esc(det), (+x.contenedores||0) + (+x.vehiculos||0));
          }).join('')+'</div>' : vacio('No falta ninguna pieza') }}
      ], VISTA.piezas, 'piezas');
    }).catch(function(err){ m.innerHTML = '<p class="inv-error">'+esc(H.mensaje(err))+'</p>' });
  };

  // ================================================================ Catálogos (admin)
  var CATS = [
    {id: 'modelos', nombre: 'Modelos', sub: 'MC 150, MC 200…'},
    {id: 'colores', nombre: 'Colores', sub: 'Los que pueden traer los vehículos'},
    {id: 'caracteristicas', nombre: 'Características', sub: 'Hidráulico, rodado… y qué modelos las tienen'},
    {id: 'defectos', nombre: 'Tipos de daño', sub: 'Para la revisión'},
    {id: 'piezas', nombre: 'Piezas', sub: 'Todas las piezas que pueden llegar'},
    {id: 'materiales', nombre: 'Lista de piezas', sub: 'Qué piezas trae cada modelo'}
  ];
  var C = {vista: null, destino: null};   // vista de catálogo y, en Lista de piezas, de qué es la lista

  function guardarCat(tabla, fila){
    return H.rpc('inv_catalogo_guardar', {p_tabla: tabla, p_fila: fila}).then(function(cat){ E.cat = cat; dibujarCatalogos(main()); }).catch(errorArriba);
  }
  function botonesFila(tabla, x){
    return '<span class="btns"><button type="button" class="btn" data-c="renombrar" data-t="'+tabla+'" data-id="'+x.id+'">Renombrar</button>'+
      '<button type="button" class="btn" data-c="activo" data-t="'+tabla+'" data-id="'+x.id+'" data-v="'+(x.activo===false ? 1 : 0)+'">'+(x.activo===false ? 'Activar' : 'Desactivar')+'</button></span>';
  }
  function filaSimple(tabla, x, extra){
    return '<div class="tarjeta"><span class="txt"><b>'+esc(x.nombre)+'</b>'+(extra||'')+(x.activo===false ? '<small>Desactivado: ya no sale para escoger</small>' : '')+'</span>'+botonesFila(tabla, x)+'</div>';
  }
  function nombreDestino(d){
    if(!d) return '';
    if(d.modelo_id){ var m = I.porId(E.cat.modelos, d.modelo_id); return m ? m.nombre + ' (lo que trae siempre)' : '?'; }
    var r = null; (E.cat.caracteristicas||[]).forEach(function(c){ (c.opciones||[]).forEach(function(o){ if(o.id===d.opcion_id) r = I.nombreOpcion(c.nombre, o.nombre) }) });
    return r ? r + ' (lo que agrega)' : '?';
  }

  function dibujarCatalogos(m){
    var html = '<header class="inv-cab"><h1>Catálogos</h1><p>Lo que las bodegas pueden escoger. Solo tú puedes cambiarlo.</p></header>';
    if(!C.vista){
      html += '<div class="tarjetas">'+CATS.map(function(c){
        return '<button type="button" class="tarjeta clic" data-c="vista" data-id="'+c.id+'"><span class="txt"><b>'+c.nombre+'</b><small>'+c.sub+'</small></span><span style="color:var(--muted)">'+H.ICO.flecha+'</span></button>';
      }).join('')+'</div>';
      m.innerHTML = html; return;
    }
    var cv = CATS.filter(function(c){ return c.id===C.vista })[0];
    html = '<button type="button" class="btn-link" data-c="volver">‹ Catálogos</button><header class="inv-cab"><h1>'+cv.nombre+'</h1><p>'+cv.sub+'</p></header>';
    var cat = E.cat;
    if(C.vista==='modelos' || C.vista==='colores' || C.vista==='defectos'){
      html += '<div class="tarjetas">'+(cat[C.vista]||[]).map(function(x){ return filaSimple(C.vista, x) }).join('')+'</div>'+
        '<div class="acciones"><button type="button" class="btn prin" data-c="agregar" data-t="'+C.vista+'">+ Agregar</button></div>';
    } else if(C.vista==='caracteristicas'){
      html += (cat.caracteristicas||[]).map(function(c){
        return '<section style="margin:0 0 28px"><div class="tarjeta" style="background:var(--raised)"><span class="txt"><b>'+esc(c.nombre)+'</b></span>'+botonesFila('caracteristicas', c)+'</div>'+
          '<div class="tarjetas" style="margin:8px 0 0 18px">'+(c.opciones||[]).map(function(o){
            var mods = (cat.modelo_opciones||[]).filter(function(x){ return x.opcion_id===o.id }).map(function(x){ var mo = I.porId(cat.modelos, x.modelo_id); return mo ? mo.nombre : '' });
            return '<div class="tarjeta"><span class="txt"><b>'+esc(I.nombreOpcion(c.nombre, o.nombre))+'</b><small>'+(mods.length ? 'Modelos: '+esc(mods.join(', ')) : 'Ningún modelo la tiene')+'</small>'+
              (o.activo===false ? '<small>Desactivada</small>' : '')+'</span><span class="btns"><button type="button" class="btn" data-c="modelos-op" data-id="'+o.id+'">Modelos</button>'+
              '<button type="button" class="btn" data-c="renombrar" data-t="opciones" data-id="'+o.id+'">Renombrar</button>'+
              '<button type="button" class="btn" data-c="activo" data-t="opciones" data-id="'+o.id+'" data-v="'+(o.activo===false ? 1 : 0)+'">'+(o.activo===false ? 'Activar' : 'Desactivar')+'</button></span></div>';
          }).join('')+'<div><button type="button" class="btn" data-c="agregar-op" data-id="'+c.id+'">+ Agregar opción</button></div></div></section>';
      }).join('')+'<div class="acciones"><button type="button" class="btn prin" data-c="agregar" data-t="caracteristicas">+ Agregar característica</button></div>';
    } else if(C.vista==='piezas'){
      html += (cat.piezas||[]).length ? '<div class="tarjetas">'+cat.piezas.map(function(x){
        return '<div class="tarjeta"><span class="txt"><b>'+esc(x.nombre)+'</b><small>'+(x.lleva_color ? 'Lleva el color del vehículo' : 'No lleva color')+(x.con_serie ? ' · Tiene número de serie' : '')+'</small>'+
          (x.activo===false ? '<small>Desactivada</small>' : '')+'</span><span class="btns">'+
          '<button type="button" class="btn" data-c="color-pieza" data-id="'+x.id+'" data-v="'+(x.lleva_color ? 0 : 1)+'">'+(x.lleva_color ? 'Quitar color' : 'Lleva color')+'</button>'+
          '<button type="button" class="btn" data-c="renombrar" data-t="piezas" data-id="'+x.id+'">Renombrar</button>'+
          '<button type="button" class="btn" data-c="activo" data-t="piezas" data-id="'+x.id+'" data-v="'+(x.activo===false ? 1 : 0)+'">'+(x.activo===false ? 'Activar' : 'Desactivar')+'</button></span></div>';
      }).join('')+'</div>' : '<div class="inv-vacio"><b>Todavía no hay piezas</b>Agrega las piezas que pueden llegar en los contenedores.</div>';
      html += '<div class="acciones"><button type="button" class="btn prin" data-c="agregar-pieza">+ Agregar pieza</button></div>';
    } else if(C.vista==='materiales'){
      html += '<div class="campo" style="max-width:none"><span>Lista de piezas de</span><button type="button" class="elegir" data-c="destino">'+
        '<span><span class="va'+(C.destino ? '' : ' vacio')+'">'+esc(C.destino ? nombreDestino(C.destino) : 'Escoge un modelo o una característica')+'</span></span><span class="fl">'+H.ICO.flecha+'</span></button></div>';
      if(C.destino){
        var filas = (cat.materiales||[]).filter(function(x){ return C.destino.modelo_id ? x.modelo_id===C.destino.modelo_id : x.opcion_id===C.destino.opcion_id });
        html += filas.length ? '<div class="tarjetas">'+filas.map(function(x){
          var pz = I.porId(cat.piezas, x.pieza_id);
          return '<div class="tarjeta"><span class="cant">'+x.cantidad+'</span><span class="txt"><b>'+esc(pz ? pz.nombre : '?')+'</b>'+(pz && pz.lleva_color ? '<small>Del color del vehículo</small>' : '')+'</span>'+
            '<span class="btns"><button type="button" class="btn" data-c="cant-mat" data-id="'+x.id+'" data-v="'+x.cantidad+'">Cambiar cantidad</button>'+
            '<button type="button" class="btn" data-c="quitar-mat" data-id="'+x.id+'">Quitar</button></span></div>';
        }).join('')+'</div>' : '<div class="inv-vacio"><b>Esta lista está vacía</b>Agrega las piezas y cuántas de cada una.</div>';
        html += '<div class="acciones"><button type="button" class="btn prin" data-c="agregar-mat">+ Agregar pieza a la lista</button></div>';
      }
    }
    m.innerHTML = html;
  }
  H.DIBUJAR.catalogos = function(m){ C.vista = null; C.destino = null; dibujarCatalogos(m) };

  function alClicCatalogos(e){
    if(E.seccion!=='catalogos' || !E.raiz || !E.raiz.contains(e.target)) return;
    var b = e.target.closest('[data-c]'); if(!b) return;
    var a = b.dataset.c, id = +b.dataset.id, t = b.dataset.t, cat = E.cat;
    var buscar = function(tabla){ if(tabla==='opciones'){ var r = null; cat.caracteristicas.forEach(function(c){ c.opciones.forEach(function(o){ if(o.id===id) r = o }) }); return r; } return I.porId(cat[tabla], id); };
    if(a==='vista'){ C.vista = b.dataset.id; C.destino = null; dibujarCatalogos(main()); }
    else if(a==='volver'){ C.vista = null; dibujarCatalogos(main()); }
    else if(a==='agregar'){
      H.pedirTexto({titulo: 'Agregar', etiqueta: 'Nombre', boton: 'Agregar', falta: 'Escribe el nombre.'}).then(function(n){ if(n) guardarCat(t, {nombre: n}) });
    } else if(a==='renombrar'){
      var x = buscar(t);
      H.pedirTexto({titulo: 'Renombrar', etiqueta: 'Nombre', valor: x ? x.nombre : '', falta: 'Escribe el nombre.'}).then(function(n){ if(n) guardarCat(t, {id: id, nombre: n}) });
    } else if(a==='activo'){
      var activar = b.dataset.v==='1';
      (activar ? Promise.resolve(true) : H.confirmar({titulo: '¿Desactivar?', ayuda: 'Ya no saldrá para escoger. Lo que ya se capturó no cambia.', si: 'Sí, desactivar'}))
        .then(function(ok){ if(ok) guardarCat(t, {id: id, activo: activar}) });
    } else if(a==='agregar-op'){
      H.pedirTexto({titulo: 'Agregar opción', etiqueta: 'Nombre (p. ej. Con, Sin, Doble)', boton: 'Agregar', falta: 'Escribe el nombre.'}).then(function(n){
        if(!n) return;
        H.rpc('inv_catalogo_guardar', {p_tabla: 'opciones', p_fila: {caracteristica_id: id, nombre: n}}).then(function(c){
          E.cat = c;
          // La opción nueva queda disponible en todos los modelos; se ajusta con "Modelos"
          var nueva = null; c.caracteristicas.forEach(function(x){ if(x.id===id) x.opciones.forEach(function(o){ if(o.nombre===n) nueva = o }) });
          if(!nueva) return dibujarCatalogos(main());
          return Promise.all(c.modelos.map(function(mo){ return H.rpc('inv_catalogo_guardar', {p_tabla: 'modelo_opciones', p_fila: {modelo_id: mo.id, opcion_id: nueva.id}}) }))
            .then(function(r){ if(r.length) E.cat = r[r.length-1]; dibujarCatalogos(main()); });
        }).catch(errorArriba);
      });
    } else if(a==='modelos-op'){
      (function ciclo(){
        var tiene = (E.cat.modelo_opciones||[]).filter(function(x){ return x.opcion_id===id }).map(function(x){ return x.modelo_id });
        H.abrirLista({titulo: 'Qué modelos la tienen', ayuda: 'Pica un modelo para ponerla o quitarla',
          grupos: [{opciones: E.cat.modelos.map(function(mo){ var si = tiene.indexOf(mo.id) > -1; return {valor: mo.id, nombre: mo.nombre, detalle: si ? '✓ La tiene' : 'No la tiene'} })}]
        }).then(function(mid){
          if(mid==null){ dibujarCatalogos(main()); return; }
          H.rpc('inv_catalogo_guardar', {p_tabla: 'modelo_opciones', p_fila: {modelo_id: mid, opcion_id: id, quitar: tiene.indexOf(mid) > -1}})
            .then(function(c){ E.cat = c; ciclo(); }).catch(errorArriba);
        });
      })();
    } else if(a==='agregar-pieza'){
      H.pedirTexto({titulo: 'Agregar pieza', etiqueta: 'Nombre de la pieza', boton: 'Siguiente', falta: 'Escribe el nombre.'}).then(function(n){
        if(!n) return;
        H.abrirLista({titulo: '¿Lleva el color del vehículo?', ayuda: n, grupos: [{opciones: [
          {valor: 'si', nombre: 'Sí, es del color del vehículo', detalle: 'Por ejemplo, la carrocería'},
          {valor: 'no', nombre: 'No lleva color', detalle: 'Por ejemplo, las llantas'}]}]}).then(function(v){
          if(v==null) return;
          var serie = /chasis/i.test(n);
          guardarCat('piezas', {nombre: n, lleva_color: v==='si', con_serie: serie});
        });
      });
    } else if(a==='color-pieza'){ guardarCat('piezas', {id: id, lleva_color: b.dataset.v==='1'}); }
    else if(a==='destino'){
      var grupos = [{titulo: 'Lo que trae siempre cada modelo', opciones: cat.modelos.filter(function(x){ return x.activo!==false }).map(function(mo){ return {valor: 'm'+mo.id, nombre: mo.nombre} })}];
      cat.caracteristicas.forEach(function(c){
        grupos.push({titulo: 'Lo que agrega: ' + c.nombre, opciones: c.opciones.filter(function(o){ return o.activo!==false }).map(function(o){ return {valor: 'o'+o.id, nombre: I.nombreOpcion(c.nombre, o.nombre)} })});
      });
      H.abrirLista({titulo: 'Lista de piezas de', grupos: grupos}).then(function(v){
        if(!v) return;
        C.destino = v[0]==='m' ? {modelo_id: +v.slice(1)} : {opcion_id: +v.slice(1)};
        dibujarCatalogos(main());
      });
    } else if(a==='agregar-mat'){
      var ya = (cat.materiales||[]).filter(function(x){ return C.destino.modelo_id ? x.modelo_id===C.destino.modelo_id : x.opcion_id===C.destino.opcion_id }).map(function(x){ return x.pieza_id });
      var libres = cat.piezas.filter(function(p){ return p.activo!==false && ya.indexOf(p.id) < 0 });
      if(!libres.length){ errorArriba({message: cat.piezas.length ? 'Ya están todas las piezas en esta lista.' : 'Primero agrega piezas en el catálogo "Piezas".'}); return; }
      H.abrirLista({titulo: 'Pieza', grupos: [{opciones: libres.map(function(p){ return {valor: p.id, nombre: p.nombre, detalle: p.lleva_color ? 'Del color del vehículo' : ''} })}]}).then(function(pid){
        if(pid==null) return null;
        return H.pedirCantidad({titulo: '¿Cuántas trae cada vehículo?', ayuda: I.porId(cat.piezas, pid).nombre, valor: 1}).then(function(n){
          if(n==null) return;
          guardarCat('materiales', Object.assign({pieza_id: pid, cantidad: n}, C.destino));
        });
      });
    } else if(a==='cant-mat'){
      H.pedirCantidad({titulo: '¿Cuántas trae cada vehículo?', valor: +b.dataset.v}).then(function(n){ if(n!=null) guardarCat('materiales', {id: id, cantidad: n}) });
    } else if(a==='quitar-mat'){
      H.confirmar({titulo: '¿Quitar esta pieza de la lista?', si: 'Sí, quitar'}).then(function(ok){ if(ok) guardarCat('materiales', {id: id, quitar: true}) });
    }
  }
  document.addEventListener('click', alClicCatalogos);

  // ================================================================ Cambios (admin)
  function quien(x){ if(x.bodega && /^bodega/.test(x.quien||'')) return H.nombreBodega(x.bodega); if(x.quien==='admin') return 'Administrador'; return x.quien || 'Alguien' }
  function totalV(f){ return f && f.renglones ? f.renglones.reduce(function(s, r){ return s + r.cantidad }, 0) : 0 }
  function describir(x){
    var num = '<b>'+esc(x.numero || '?')+'</b>';
    switch(x.accion){
      case 'alta': return 'registró el contenedor '+num;
      case 'revision': return 'revisó el contenedor '+num;
      case 'anulacion_pedida': return 'pidió anular el contenedor '+num;
      case 'anulacion_autorizada': return 'anulación autorizada del contenedor '+num;
      case 'anulacion_rechazada': return 'anulación rechazada del contenedor '+num;
      case 'edicion':
        if(x.tabla==='revision') return 'corrigió la revisión del contenedor '+num;
        var d = [], a = x.antes && x.antes.contenedor, b = x.despues && x.despues.contenedor;
        if(a && b && a.numero!==b.numero) d.push('número '+esc(a.numero)+' → '+esc(b.numero));
        if(a && b && a.llegada!==b.llegada) d.push('fecha '+esc(H.fechaLarga(a.llegada))+' → '+esc(H.fechaLarga(b.llegada)));
        if(totalV(x.antes)!==totalV(x.despues)) d.push('vehículos '+totalV(x.antes)+' → '+totalV(x.despues));
        else if(JSON.stringify(x.antes && x.antes.renglones)!==JSON.stringify(x.despues && x.despues.renglones)) d.push('cambió qué vehículos trae');
        return 'corrigió el contenedor '+num+(d.length ? ': '+d.join(', ') : '');
    }
    return x.accion+' '+num;
  }
  function horaCorta(iso){ var d = new Date(iso); return d.toLocaleDateString('es-MX', {day: 'numeric', month: 'short'})+' '+d.toLocaleTimeString('es-MX', {hour: '2-digit', minute: '2-digit'}) }

  function contarCambios(){
    if(E.rol!=='admin') return Promise.resolve();
    return Promise.all([H.rpc('inv_bitacora', {p_pendientes: true}), H.rpc('inv_contenedores', {p_bodega: null})]).then(function(r){
      var n = r[0].length + r[1].filter(function(c){ return c.anulacion_pendiente }).length;
      H.CUENTA.cambios = n || ''; H.dibujarMenu();
      return r;
    }).catch(function(){});
  }
  H.alIniciar.push(contarCambios);
  if(H.actualizarCuenta) H.alIniciar.push(H.actualizarCuenta);

  H.DIBUJAR.cambios = function(m){
    contarCambios().then(function(r){
      if(E.seccion!=='cambios' || !r) return;
      var cambios = r[0], pend = r[1].filter(function(c){ return c.anulacion_pendiente });
      return Promise.all(pend.map(function(c){ return H.rpc('inv_contenedor', {p_id: c.id}) })).then(function(fichas){
        var html = '<header class="inv-cab"><h1>Cambios</h1><p>Lo que registraron y corrigieron las bodegas. Márcalo como visto cuando lo revises.</p></header>';
        if(fichas.length){
          html += '<h2 style="font-size:20px;margin:0 0 10px">Anulaciones por autorizar</h2><div class="tarjetas" style="margin-bottom:28px">'+fichas.map(function(f){
            var c = f.contenedor, an = f.anulacion;
            return '<div class="tarjeta"><span class="txt"><b>Contenedor '+esc(c.numero)+' · '+esc(H.nombreBodega(c.bodega))+'</b><small>Motivo: '+esc(an.motivo)+'</small></span>'+
              '<span class="btns"><button type="button" class="btn" data-k="ver" data-id="'+c.id+'">Ver</button>'+
              '<button type="button" class="btn" data-k="rechazar" data-id="'+an.id+'">Rechazar</button>'+
              '<button type="button" class="btn prin" data-k="autorizar" data-id="'+an.id+'">Autorizar</button></span></div>';
          }).join('')+'</div>';
        }
        html += '<h2 style="font-size:20px;margin:0 0 10px">Sin ver'+(cambios.length ? ' <span style="color:var(--muted);font-weight:400">· '+cambios.length+'</span>' : '')+'</h2>';
        html += cambios.length ? '<div class="acciones" style="margin:0 0 12px"><button type="button" class="btn" data-k="todos">Marcar todos como vistos</button></div><div class="tarjetas">'+cambios.map(function(x){
          return '<div class="tarjeta"><span class="txt"><b>'+esc(quien(x))+' '+describir(x)+'</b><small>'+esc(horaCorta(x.fecha))+(x.motivo ? ' · Motivo: '+esc(x.motivo) : '')+'</small></span>'+
            '<span class="btns">'+(x.registro ? '<button type="button" class="btn" data-k="ver" data-id="'+x.registro+'">Ver</button>' : '')+
            '<button type="button" class="btn" data-k="visto" data-id="'+x.id+'">Visto</button></span></div>';
        }).join('')+'</div>' : '<div class="inv-vacio"><b>Todo al día</b>No hay cambios por revisar.</div>';
        m.innerHTML = html;
        m.dataset.ids = cambios.map(function(x){ return x.id }).join(',');
      });
    }).catch(function(err){ m.innerHTML = '<p class="inv-error">'+esc(H.mensaje(err))+'</p>' });
  };

  document.addEventListener('click', function(e){
    if(E.seccion!=='cambios' || !E.raiz || !E.raiz.contains(e.target)) return;
    var b = e.target.closest('[data-k]'); if(!b) return;
    var a = b.dataset.k, id = +b.dataset.id, recargar = function(){ H.DIBUJAR.cambios(main()) };
    if(a==='ver'){ H.abrirFicha(id); }
    else if(a==='visto'){ H.rpc('inv_bitacora_visto', {p_ids: [id]}).then(recargar).catch(errorArriba); }
    else if(a==='todos'){ var ids = (main().dataset.ids||'').split(',').filter(Boolean).map(Number); H.rpc('inv_bitacora_visto', {p_ids: ids}).then(recargar).catch(errorArriba); }
    else if(a==='autorizar' || a==='rechazar'){
      var si = a==='autorizar';
      H.confirmar({titulo: si ? '¿Autorizar la anulación?' : '¿Rechazar la anulación?',
        ayuda: si ? 'El contenedor dejará de contar en el inventario.' : 'El contenedor seguirá contando.', si: si ? 'Sí, anular' : 'Sí, rechazar'}).then(function(ok){
        if(ok) H.rpc('inv_anulacion_resolver', {p_id: id, p_autorizar: si}).then(recargar).catch(errorArriba);
      });
    }
  });
})();
