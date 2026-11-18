/* Inventario: consulta del inventario, Catálogos (solo admin) y Cambios (solo admin). */
(function(){
  var H = window.InventarioApp._h, E = H.E, I = H.I, esc = H.esc, q = H.q;
  function main(){ return q('.inv-main', E.raiz) }
  function errorArriba(err){ main().insertAdjacentHTML('afterbegin', '<p class="inv-error">'+esc(H.mensaje(err))+'</p>') }
  function plural(n, uno, varios){ return n + ' ' + (n===1 ? uno : varios) }

  // ================================================================ Inventario
  H.DIBUJAR.inventario = function(m){
    H.rpc('inv_inventario', {p_bodega: E.verBodega}).then(function(inv){
      if(E.seccion!=='inventario') return;
      var espera = inv.espera || [], piezas = inv.piezas || [];
      var totalEspera = espera.reduce(function(s, x){ return s + (+x.cantidad||0) }, 0);
      var danadas = piezas.reduce(function(s, x){ return s + (+x.danadas||0) }, 0);
      var html = '<header class="inv-cab"><h1>Inventario</h1><p>Lo que hay hoy en '+esc(E.rol==='bodega' ? 'tu bodega' : H.nombreBodega(E.verBodega).toLowerCase())+
        ', según los contenedores ya revisados.</p></header>';
      html += '<h2 style="font-size:20px;margin:0 0 10px">Vehículos en espera de armado <span style="color:var(--muted);font-weight:400">· '+totalEspera+'</span></h2>';
      html += espera.length ? '<div class="tarjetas">'+espera.map(function(x){
        return '<div class="tarjeta"><span class="cant">'+x.cantidad+'</span><span class="txt"><b>'+esc(I.nombreVehiculo({modelo_id: x.modelo_id, opciones: x.opciones, color_id: x.color_id}, E.cat))+'</b></span></div>';
      }).join('')+'</div>' : '<div class="inv-vacio"><b>No hay vehículos en espera</b>Aparecen aquí cuando se revisa un contenedor.</div>';
      html += '<h2 style="font-size:20px;margin:32px 0 10px">Piezas'+(danadas ? ' <span class="etq rojo" style="vertical-align:middle">'+plural(danadas, 'dañada', 'dañadas')+'</span>' : '')+'</h2>';
      html += piezas.length ? '<div class="tarjetas">'+piezas.map(function(x){
        return '<div class="tarjeta"><span class="cant">'+x.disponibles+'</span><span class="txt"><b>'+esc(x.pieza + (x.color ? ' · ' + x.color : ''))+'</b>'+
          '<small>Disponibles</small></span>'+(+x.danadas ? '<span class="etq rojo">'+plural(+x.danadas, 'dañada', 'dañadas')+'</span>' : '')+'</div>';
      }).join('')+'</div>' : '<div class="inv-vacio"><b>Todavía no hay piezas</b>Las piezas entran al inventario al revisar un contenedor.</div>';
      m.innerHTML = html;
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
