/* Ventas y producción. Diseño: docs/superpowers/specs/2026-11-20-produccion-ventas-design.md
   Nueva venta (uno o varios vehículos, de uno o varios colores) → cada vehículo queda Por armar o Esperando piezas
   → Entrar a producción (venta o showroom, número de serie) → etapas:
   Armado → Revisión 1 → (Herrería → Forrado, solo especiales) → Mecánica → Detallado y pintura → Revisión final → Listo.
   Si la Revisión 1 encuentra un "Faltante de pieza", el vehículo queda en Faltantes hasta que se pongan.
   Si no pasa la revisión final, queda marcado (no_paso) hasta que pase. Cualquier paso se puede regresar.
   La ficha del vehículo se abre del lado derecho, como la de Logística (#insp de index.html). */
(function(){
  var H = window.InventarioApp._h, E = H.E, I = H.I, esc = H.esc, q = H.q;
  function main(){ return q('.inv-main', E.raiz) }

  // Mecánica siempre es la antepenúltima (pedido del usuario, 21-nov-2026)
  var ETAPAS = [
    {id: 'armado', nombre: 'Armado'},
    {id: 'revision1', nombre: 'Revisión 1'},
    {id: 'herreria', nombre: 'Herrería', especial: true},
    {id: 'forrado', nombre: 'Forrado', especial: true},
    {id: 'mecanica', nombre: 'Mecánica'},
    {id: 'detallado', nombre: 'Detallado y pintura'},
    {id: 'revision_final', nombre: 'Revisión final'},
    {id: 'listo', nombre: 'Listo'}
  ];
  function etapa(id){ return ETAPAS.filter(function(x){ return x.id===id })[0] || {id: id, nombre: id} }
  function ruta(especial){ return ETAPAS.filter(function(x){ return especial || !x.especial }) }
  function indice(h){ return ruta(h.especial).map(function(x){ return x.id }).indexOf(h.etapa) }
  function siguiente(h){ return ruta(h.especial)[indice(h)+1] }
  function anterior(h){ return ruta(h.especial)[indice(h)-1] }

  var ESTADOS = {
    faltantes:  {nombre: 'Faltan piezas', etq: 'rojo', orden: 1},
    no_paso:    {nombre: 'No pasó la revisión final', etq: 'rojo', orden: 2},
    por_armar:  {nombre: 'Por armar', etq: 'ok', orden: 3},
    esperando:  {nombre: 'Esperando piezas', etq: 'pend', orden: 4},
    produccion: {nombre: 'En producción', etq: 'azul', orden: 5},
    lista:      {nombre: 'Lista para enviar', etq: 'ok', orden: 6}
  };
  var SECCIONES_VENTA = [
    {id: 'atender', nombre: 'Necesitan atención', sub: 'Les faltan piezas o no pasaron la revisión final', estados: ['faltantes', 'no_paso']},
    {id: 'por_armar', nombre: 'Por armar', sub: 'Hay vehículo en espera de armado para ellas', estados: ['por_armar']},
    {id: 'esperando', nombre: 'Esperando piezas', sub: 'Todavía no llega un vehículo de ese modelo y color', estados: ['esperando']},
    {id: 'produccion', nombre: 'En producción', sub: '', estados: ['produccion']},
    {id: 'lista', nombre: 'Listas para enviar', sub: 'Todos sus vehículos pasaron la revisión final', estados: ['lista']}
  ];
  var TIPOS_DESTINO = ['Local', 'Semi Local', 'Foráneo', 'Sucursal', 'Se recoge en granja'];

  function nombreVeh(r){ return I.nombreVehiculo({modelo_id: r.modelo_id, opciones: r.opciones||[], color_id: r.color_id}, E.cat) }
  function colorHex(id){ var c = I.porId(E.cat.colores, id); return c ? H.hexColor(c.nombre) : null }
  function puntoColor(id){ var hx = colorHex(id); return hx ? '<span class="pt-col" style="background:'+hx+'"></span>' : '' }
  function dias(desde){
    var d = new Date(String(desde).length===10 ? desde + 'T12:00:00' : desde);
    var n = Math.max(0, Math.floor((Date.now() - d.getTime()) / 864e5));
    return n===0 ? 'hoy' : n===1 ? '1 día' : n+' días';
  }
  function remisionDe(v){ return v.remision + (v.partes > 1 ? ' · '+v.parte+' de '+v.partes : '') }
  function avisoPrueba(){ return '<p class="aviso-prueba"><span class="etq pend">En prueba</span> Las ventas se siguen capturando en el Drive hasta el día del cambio.</p>' }
  function errorEn(el, err){ el.innerHTML = '<p class="inv-error">'+esc(H.mensaje(err))+'</p>' }
  function aviso(titulo, texto){ H.confirmar({titulo: titulo, ayuda: texto, si: 'Entendido', no: 'Cerrar'}) }
  function esFaltante(defectoId){ var d = I.porId(E.cat.defectos, defectoId); return !!(d && /^faltante/i.test(d.nombre)) }
  function gravNom(g){ return {leve: 'Leve', media: 'Media', grave: 'Grave'}[g] || '' }

  // ================================================================ Nueva venta (y corregir)
  var V = null;
  function nuevaV(){ return {paso: 1, id: null, bodega: E.rol==='bodega' ? E.bodega : E.verBodega, remision: '', fecha: H.hoyISO(), vendedor: '',
    destino: '', tipo_destino: '', vehiculos: [], conProduccion: false, error: ''} }

  function campoElegir(accion, etiqueta, valor, vacio){
    return '<div class="campo"><span>'+esc(etiqueta)+'</span><button type="button" class="elegir" data-nv="'+accion+'">'+
      '<span><span class="va'+(valor ? '' : ' vacio')+'">'+esc(valor || vacio)+'</span></span><span class="fl">'+H.ICO.flecha+'</span></button></div>';
  }
  function totalVeh(){ return V.vehiculos.reduce(function(s, r){ return s + r.cantidad }, 0) }
  function txtRenglon(r){
    return '<b>'+puntoColor(r.color_id)+esc(nombreVeh(r))+'</b>'+(r.especial ? '<small><span class="etq azul chica">Especial: '+esc(r.especial_que)+'</span></small>' : '<small>Normal</small>');
  }

  function dibujarVenta(m){
    if(!V || V.terminado) V = nuevaV();
    var corrigiendo = !!V.id, titulos = ['Venta', 'Vehículos', 'Destino', 'Guardar'];
    var html = '<header class="inv-cab"><h1>'+(corrigiendo ? 'Corregir venta '+esc(V.remisionOriginal) : 'Nueva venta')+'</h1>'+
      '<p>'+(corrigiendo ? 'Cambia lo que haga falta. Se te pedirá el motivo.' : 'Registra la venta como te llegó por WhatsApp.')+'</p></header>'+
      (corrigiendo ? '' : avisoPrueba())+
      '<ol class="pasos">'+titulos.map(function(t, i){
        var n = i+1, cl = n < V.paso ? 'hecho' : (n===V.paso ? 'ahora' : '');
        return '<li class="'+cl+'"><span class="nn">'+(n < V.paso ? '✓' : n)+'</span><span class="tx">'+t+'</span></li>';
      }).join('')+'</ol>'+(V.error ? '<p class="inv-error">'+esc(V.error)+'</p>' : '');

    if(V.paso===1){
      if(E.rol==='admin') html += campoElegir('bodega', 'Bodega', V.bodega ? H.nombreBodega(V.bodega) : '', 'Escoge la bodega');
      html += '<label class="campo"><span>Remisión</span><input id="vRem" autocomplete="off" value="'+esc(V.remision)+'" placeholder="Por ejemplo 153"></label>'+
        '<label class="campo"><span>Fecha de compra</span><input id="vFecha" type="date" value="'+esc(V.fecha)+'"></label>'+
        '<label class="campo"><span>Vendedor</span><input id="vVend" autocomplete="off" value="'+esc(V.vendedor)+'"></label>';
    } else if(V.paso===2){
      if(V.conProduccion){
        html += '<div class="inv-vacio" style="text-align:left;margin-bottom:14px"><b>Ya hay vehículos de esta venta en producción</b>Los vehículos ya no se pueden cambiar; solo los datos de la venta.</div>';
      }
      html += '<div class="tarjetas">'+V.vehiculos.map(function(r, i){
        return '<div class="tarjeta"><span class="cant">'+r.cantidad+'</span><span class="txt">'+txtRenglon(r)+'</span>'+
          (V.conProduccion ? '' : '<span class="btns"><button type="button" class="btn" data-nv="cambiar" data-i="'+i+'">Cambiar</button>'+
          '<button type="button" class="btn" data-nv="quitar" data-i="'+i+'">Quitar</button></span>')+'</div>';
      }).join('')+'</div>'+
        (V.vehiculos.length ? '' : '<div class="inv-vacio"><b>Todavía no agregas vehículos</b>Agrega cada modelo y color que pidió el cliente. Si pidió 2 blancos y 1 azul, son dos renglones.</div>')+
        (V.conProduccion ? '' : '<div class="acciones" style="margin-top:16px"><button type="button" class="btn ancho" data-nv="agregar">+ Agregar vehículos</button></div>');
    } else if(V.paso===3){
      html += '<label class="campo"><span>Destino</span><input id="vDest" autocomplete="off" value="'+esc(V.destino)+'" placeholder="Ciudad o lugar de entrega"></label>'+
        campoElegir('tipo', 'Tipo de destino', V.tipo_destino, 'Escoge el tipo');
    } else {
      var n = totalVeh();
      html += '<div class="resumen">Remisión <b>'+esc(V.remision)+'</b>'+(E.rol==='admin' ? ' en <b>'+esc(H.nombreBodega(V.bodega))+'</b>' : '')+
        ', comprada el <b>'+esc(H.fechaLarga(V.fecha))+'</b>, vendedor <b>'+esc(V.vendedor)+'</b>.'+
        '<p style="margin:10px 0 4px"><b>'+n+(n===1 ? ' vehículo' : ' vehículos')+':</b></p><ul style="margin:0;padding-left:22px">'+
        V.vehiculos.map(function(r){ return '<li>'+r.cantidad+' · '+puntoColor(r.color_id)+esc(nombreVeh(r))+(r.especial ? ' · Especial: '+esc(r.especial_que) : '')+'</li>' }).join('')+'</ul>'+
        '<p style="margin:10px 0 0">Va a <b>'+esc(V.destino)+'</b>'+(V.tipo_destino ? ' ('+esc(V.tipo_destino)+')' : '')+'.</p></div>';
    }
    html += '<div class="acciones">'+
      (V.paso > 1 ? '<button type="button" class="btn" data-nv="atras">Atrás</button>' : (corrigiendo ? '<button type="button" class="btn" data-nv="cancelar">Cancelar</button>' : ''))+
      (V.paso < 4 ? '<button type="button" class="btn prin der" data-nv="sig">Siguiente</button>'
                  : '<button type="button" class="btn prin der" data-nv="guardar">'+(corrigiendo ? 'Guardar cambios' : 'Guardar venta')+'</button>')+'</div>';
    m.innerHTML = html;
    var f = q('#vRem', m); if(f && !V.remision) f.focus();
  }

  function leerVenta(m){
    var x;
    if((x = q('#vRem', m))) V.remision = x.value.trim();
    if((x = q('#vFecha', m))) V.fecha = x.value;
    if((x = q('#vVend', m))) V.vendedor = x.value.trim();
    if((x = q('#vDest', m))) V.destino = x.value.trim();
  }

  // Modelo → opciones → color → ¿especial? (y qué lleva) → cuántos
  function escogerVehiculo(previo){
    var r = {modelo_id: null, opciones: [], color_id: null, especial: false, especial_que: '', cantidad: previo ? previo.cantidad : 1};
    return H.abrirLista({titulo: 'Modelo', grupos: [{opciones: (E.cat.modelos||[]).filter(function(x){ return x.activo!==false }).map(function(x){ return {valor: x.id, nombre: x.nombre} })}],
      elegido: previo ? previo.modelo_id : null}).then(function(mo){
      if(mo==null) return null;
      r.modelo_id = mo;
      return H.tablaOpciones(mo, previo).then(function(v){ if(v==null) return false; r.opciones = v; return true; });
    }).then(function(ok){
      if(!ok) return null;
      return H.abrirLista({titulo: 'Color', grupos: [{opciones: (E.cat.colores||[]).filter(function(c){ return c.activo!==false }).map(function(c){
        return {valor: c.id, nombre: c.nombre, color: H.hexColor(c.nombre)} })}], elegido: previo ? previo.color_id : null});
    }).then(function(c){
      if(c==null) return null;
      r.color_id = c;
      return H.abrirLista({titulo: '¿Es especial?', ayuda: 'Los especiales pasan por herrería y forrado',
        grupos: [{opciones: [{valor: 'no', nombre: 'No, es normal'}, {valor: 'si', nombre: 'Sí, es especial', detalle: 'Garrafonero, caja seca…'}]}],
        elegido: previo ? (previo.especial ? 'si' : 'no') : null});
    }).then(function(e){
      if(e==null) return null;
      r.especial = e==='si';
      if(!r.especial) return true;
      return H.pedirTexto({titulo: '¿Qué lleva el especial?', etiqueta: 'Qué lleva', valor: previo ? previo.especial_que : '', boton: 'Siguiente',
        falta: 'Escribe qué lleva (garrafonero, caja seca…).'}).then(function(t){ if(t==null) return null; r.especial_que = t; return true; });
    }).then(function(ok){
      if(!ok) return null;
      return H.pedirCantidad({titulo: '¿Cuántos de este?', ayuda: nombreVeh(r)+(r.especial ? ' · '+r.especial_que : ''), valor: r.cantidad, boton: previo ? 'Listo' : 'Agregar'});
    }).then(function(n){ if(n==null) return null; r.cantidad = n; return r; });
  }
  // Mismo modelo, opciones, color y especial: se suman
  function juntar(){
    var res = [];
    V.vehiculos.forEach(function(r){
      var k = function(x){ return [x.modelo_id, (x.opciones||[]).slice().sort().join(','), x.color_id, x.especial ? 1 : 0, (x.especial_que||'').toLowerCase()].join('|') };
      var y = res.filter(function(z){ return k(z)===k(r) })[0];
      if(y) y.cantidad += r.cantidad; else res.push(r);
    });
    V.vehiculos = res;
  }

  function guardarVenta(m){
    var motivo = V.id ? H.pedirTexto({titulo: '¿Por qué corriges la venta?', ayuda: 'Queda guardado junto con el cambio', etiqueta: 'Motivo', largo: true,
      boton: 'Guardar cambios', falta: 'Escribe el motivo del cambio.'}) : Promise.resolve(null);
    motivo.then(function(mot){
      if(V.id && mot==null) return;
      var b = q('[data-nv="guardar"]', m); if(b){ b.disabled = true; b.textContent = 'Guardando…'; }
      var p = {id: V.id, bodega: V.bodega, remision: V.remision, fecha: V.fecha, vendedor: V.vendedor, destino: V.destino, tipo_destino: V.tipo_destino};
      if(!V.conProduccion) p.vehiculos = V.vehiculos;
      H.rpc('inv_venta_guardar', {p: p, p_motivo: mot}).then(function(r){
        var id = r.id, rem = V.remision, eraCorreccion = !!V.id;
        V.terminado = true;
        return H.rpc('inv_ventas', {p_bodega: E.verBodega}).then(function(l){
          var us = l.filter(function(x){ return x.id===id });
          var porArmar = us.filter(function(x){ return x.estado_venta==='por_armar' }).length, esperan = us.filter(function(x){ return x.estado_venta==='esperando' }).length;
          var det = [porArmar ? porArmar+' por armar' : '', esperan ? esperan+' esperando piezas' : ''].filter(Boolean).join(' y ');
          refrescarCuentas();
          // Sin pantalla de "Listo" (pedido del usuario): letrero y punto naranja en Lista de ventas
          if(eraCorreccion){ H.avisar('Se guardaron los cambios de la venta '+rem+'.'); abrirFichaVenta(id); }
          else { H.avisar('Se guardó la venta '+rem+(det ? ': '+det : '')+'.'); H.marcarNuevo('ventas'); V = null; dibujarVenta(m); }
        });
      }).catch(function(err){ V.error = H.mensaje(err); dibujarVenta(m); });
    });
  }

  function alClicVenta(e, m){
    var b = e.target.closest('[data-nv]'); if(!b) return;
    var a = b.dataset.nv; V.error = ''; leerVenta(m);
    if(a==='bodega'){
      H.abrirLista({titulo: 'Bodega', grupos: [{opciones: H.BODEGAS}], elegido: V.bodega}).then(function(v){ if(v) V.bodega = v; dibujarVenta(m); });
    } else if(a==='agregar'){
      escogerVehiculo(null).then(function(r){ if(r){ V.vehiculos.push(r); juntar(); } dibujarVenta(m); });
    } else if(a==='cambiar'){
      var i = +b.dataset.i;
      escogerVehiculo(V.vehiculos[i]).then(function(r){ if(r){ V.vehiculos[i] = r; juntar(); } dibujarVenta(m); });
    } else if(a==='quitar'){ V.vehiculos.splice(+b.dataset.i, 1); dibujarVenta(m); }
    else if(a==='tipo'){
      H.abrirLista({titulo: 'Tipo de destino', grupos: [{opciones: TIPOS_DESTINO.map(function(t){ return {valor: t, nombre: t} })}], elegido: V.tipo_destino})
        .then(function(v){ if(v) V.tipo_destino = v; dibujarVenta(m); });
    } else if(a==='sig'){
      if(V.paso===1){
        if(E.rol==='admin' && !V.bodega) V.error = 'Escoge la bodega';
        else if(!V.remision) V.error = 'Escribe la remisión';
        else if(!V.fecha) V.error = 'Escribe la fecha de compra';
        else if(!V.vendedor) V.error = 'Escribe el vendedor';
        else V.paso = 2;
      } else if(V.paso===2){
        if(!V.vehiculos.length) V.error = 'Agrega al menos un vehículo';
        else V.paso = 3;
      } else if(V.paso===3){
        if(!V.destino) V.error = 'Escribe el destino';
        else if(!V.tipo_destino) V.error = 'Escoge el tipo de destino';
        else V.paso = 4;
      }
      dibujarVenta(m);
      if(V.paso===2 && !V.vehiculos.length && !V.error) setTimeout(function(){ var x = q('[data-nv="agregar"]', m); if(x) x.click(); }, 50);
    } else if(a==='atras'){ V.paso = Math.max(1, V.paso-1); dibujarVenta(m); }
    else if(a==='cancelar'){ var id = V.id; V = null; abrirFichaVenta(id); }
    else if(a==='guardar') guardarVenta(m);
  }

  H.DIBUJAR.venta = function(m){ dibujarVenta(m) };

  // ================================================================ Lista de ventas (una tarjeta por remisión, con sus vehículos)
  function agruparVentas(lista){
    var porId = {}, orden = [];
    lista.forEach(function(u){
      if(!porId[u.id]){ porId[u.id] = {id: u.id, remision: u.remision, fecha: u.fecha, vendedor: u.vendedor, destino: u.destino, tipo_destino: u.tipo_destino,
        bodega: u.bodega, unidades: []}; orden.push(porId[u.id]); }
      porId[u.id].unidades.push(u);
    });
    orden.forEach(function(v){
      v.estado = v.unidades.map(function(u){ return u.estado_venta }).sort(function(a, b){ return ESTADOS[a].orden - ESTADOS[b].orden })[0];
    });
    return orden;
  }
  var CACHE = {};
  H.DIBUJAR.ventas = function(m){
    H.rpc('inv_ventas', {p_bodega: E.verBodega}).then(function(lista){
      if(E.seccion!=='ventas') return;
      var ventas = agruparVentas(lista);
      var html = '<header class="inv-cab"><h1>Lista de ventas</h1><p>De la compra más antigua a la más reciente.</p></header>'+avisoPrueba();
      if(!ventas.length) html += '<div class="inv-vacio"><b>Todavía no hay ventas</b>'+(H.puedeEscribir() ? 'Cuando llegue una por WhatsApp, regístrala en "Nueva venta".' : '')+'</div>';
      SECCIONES_VENTA.forEach(function(sec){
        var g = ventas.filter(function(v){ return sec.estados.indexOf(v.estado) > -1 }); if(!g.length) return;
        html += '<h2 class="inv-sub'+(sec.id==='atender' ? ' rojo' : '')+'">'+sec.nombre+' <span>· '+g.length+'</span></h2>'+(sec.sub ? '<p class="inv-sub-p">'+sec.sub+'</p>' : '')+
          '<div class="tarjetas">'+g.map(tarjetaVenta).join('')+'</div>';
      });
      m.innerHTML = html;
    }).catch(function(err){ errorEn(m, err) });
  };
  function etiquetaUnidad(u){
    var est = ESTADOS[u.estado_venta];
    if(u.estado_venta==='produccion' && u.vehiculo) return '<span class="etq azul chica">'+esc(etapa(u.vehiculo.etapa).nombre)+'</span>';
    return '<span class="etq '+est.etq+' chica">'+est.nombre+'</span>';
  }
  function tarjetaVenta(v){
    var n = v.unidades.length;
    return '<button type="button" class="tarjeta clic venta-t" data-ficha-venta="'+v.id+'"><span class="cant rem">'+esc(v.remision)+'</span>'+
      '<span class="txt"><b>'+n+(n===1 ? ' vehículo' : ' vehículos')+'</b><small>'+esc(v.vendedor)+' · '+esc(v.destino)+' · '+esc(dias(v.fecha))+
      (E.rol!=='bodega' && !E.verBodega ? ' · '+esc(H.nombreBodega(v.bodega)) : '')+'</small>'+
      '<span class="unidades">'+v.unidades.map(function(u){
        return '<span class="unidad">'+puntoColor(u.color_id)+esc(nombreVeh(u))+(u.especial ? ' · '+esc(u.especial_que) : '')+' '+etiquetaUnidad(u)+'</span>';
      }).join('')+'</span></span>'+
      '<span class="fl" style="color:var(--muted)">'+H.ICO.flecha+'</span></button>';
  }

  function abrirFichaVenta(id){
    E.seccion = 'ventas'; H.dibujarMenu();
    var m = main(); m.innerHTML = '<p class="inv-cargando">Cargando…</p>'; window.scrollTo({top: 0});
    H.rpc('inv_ventas', {p_bodega: null}).then(function(l){
      var v = agruparVentas(l.filter(function(x){ return x.id===id }))[0];
      if(!v){ m.innerHTML = '<p class="inv-error">Esa venta no existe.</p>'; return; }
      CACHE.venta = v;
      var dato = function(t, val){ return '<div class="dato"><span>'+t+'</span><b>'+val+'</b></div>' };
      var html = '<button type="button" class="btn-link" data-ir-sec="ventas">‹ Lista de ventas</button>'+
        '<header class="inv-cab"><h1>Remisión '+esc(v.remision)+'</h1></header>'+
        '<div class="datos">'+
        dato('Fecha de compra', esc(H.fechaLarga(v.fecha))+' · '+esc(dias(v.fecha)))+
        dato('Vendedor', esc(v.vendedor))+
        dato('Destino', esc(v.destino)+(v.tipo_destino ? ' · '+esc(v.tipo_destino) : ''))+
        (E.rol!=='bodega' ? dato('Bodega', esc(H.nombreBodega(v.bodega))) : '')+
        '</div><h2 class="inv-sub">Vehículos <span>· '+v.unidades.length+'</span></h2><div class="tarjetas">'+
        v.unidades.map(function(u){
          var acc = '';
          if(u.estado_venta==='por_armar' && H.puedeEscribir()) acc = '<button type="button" class="btn prin" data-entrar-unidad="'+u.unidad_id+'">Meter a producción</button>';
          else if(u.vehiculo) acc = '<button type="button" class="btn" data-ficha-veh="'+u.vehiculo.id+'">Ver vehículo</button>';
          return '<div class="tarjeta"><span class="cant">'+u.parte+'</span><span class="txt"><b>'+puntoColor(u.color_id)+esc(nombreVeh(u))+'</b><small>'+
            (u.especial ? 'Especial: '+esc(u.especial_que) : 'Normal')+(u.vehiculo ? ' · Serie '+esc(u.vehiculo.serie) : '')+'</small></span>'+
            etiquetaUnidad(u)+(acc ? '<span class="btns">'+acc+'</span>' : '')+'</div>';
        }).join('')+'</div>';
      if(v.unidades.some(function(u){ return u.estado_venta==='esperando' }))
        html += '<p style="margin:14px 0 0;color:var(--muted)">Los que están esperando piezas pasan solos a "Por armar" cuando se revise un contenedor que traiga ese modelo y color.</p>';
      if(H.puedeEscribir()) html += '<div class="acciones"><button type="button" class="btn" data-corregir-venta="'+v.id+'">Corregir la venta</button></div>';
      m.innerHTML = html;
    }).catch(function(err){ errorEn(m, err) });
  }

  // ================================================================ Producción (Línea o Lista)
  H.DIBUJAR.produccion = function(m){
    H.rpc('inv_produccion', {p_bodega: E.verBodega}).then(function(lista){
      if(E.seccion!=='produccion') return;
      var enCurso = lista.filter(function(h){ return h.etapa!=='listo' }).length;
      var html = '<header class="inv-cab"><h1>Línea de producción</h1><p>'+(enCurso ? enCurso+(enCurso===1 ? ' vehículo en producción.' : ' vehículos en producción.') : 'Los vehículos que se están armando, por etapa.')+'</p></header>';
      var modo = modoProduccion();
      html += '<div class="prod-barra">'+(H.puedeEscribir() ? '<button type="button" class="btn prin" data-entrar>+ Entrar a producción</button>' : '')+
        '<div class="vista-sel" role="group" aria-label="Ver como"><button type="button" data-modo-prod="linea" aria-pressed="'+(modo==='linea')+'">Línea</button>'+
        '<button type="button" data-modo-prod="lista" aria-pressed="'+(modo==='lista')+'">Lista</button></div></div>';
      if(modo==='linea' && H.linea){ m.innerHTML = html + '<div class="linea-caja"></div>'; H.linea.dibujar(q('.linea-caja', m), lista); return; }
      if(!lista.length) html += '<div class="inv-vacio"><b>Todavía no hay vehículos en producción</b>Cuando empiecen a armar uno, dale "Entrar a producción".</div>';
      var falt = lista.filter(function(h){ return h.faltantes }), nop = lista.filter(function(h){ return h.no_paso });
      if(falt.length) html += '<h2 class="inv-sub rojo">Faltan piezas <span>· '+falt.length+'</span></h2><p class="inv-sub-p">No avanzan hasta que se pongan las piezas</p><div class="tarjetas">'+falt.map(tarjetaVeh).join('')+'</div>';
      if(nop.length) html += '<h2 class="inv-sub rojo">No pasaron la revisión final <span>· '+nop.length+'</span></h2><p class="inv-sub-p">Hay que corregirlos</p><div class="tarjetas">'+nop.map(tarjetaVeh).join('')+'</div>';
      ETAPAS.forEach(function(et){
        var g = lista.filter(function(h){ return h.etapa===et.id && !h.faltantes && !h.no_paso }); if(!g.length) return;
        html += '<h2 class="inv-sub">'+(et.id==='listo' ? 'Listos' : et.nombre)+' <span>· '+g.length+'</span></h2><div class="tarjetas">'+g.map(tarjetaVeh).join('')+'</div>';
      });
      m.innerHTML = html;
    }).catch(function(err){ errorEn(m, err) });
  };
  function modoProduccion(){
    if(innerWidth < 700) return 'lista';
    try { return localStorage.getItem('logistica.prodModo') || 'linea' } catch(e){ return 'linea' }
  }
  function paraDe(h){ return h.venta ? 'Venta '+esc(h.venta.remision)+(h.venta.partes > 1 ? ' ('+h.venta.parte+' de '+h.venta.partes+')' : '') : 'Showroom' }
  function tarjetaVeh(h){
    return '<button type="button" class="tarjeta clic" data-ficha-veh="'+h.id+'"><span class="txt"><b>'+puntoColor(h.color_id)+esc(nombreVeh(h))+'</b>'+
      '<small>Serie '+esc(h.serie)+' · '+paraDe(h)+(E.rol!=='bodega' && !E.verBodega ? ' · '+esc(H.nombreBodega(h.bodega)) : '')+'</small></span>'+
      (h.especial ? '<span class="etq azul">Especial</span>' : '')+
      (h.etapa!=='listo' ? '<span class="etq anul">'+esc(dias(h.etapa_desde))+'</span>' : '')+
      '<span class="fl" style="color:var(--muted)">'+H.ICO.flecha+'</span></button>';
  }

  // ---------------------------------------------------------------- Después de un cambio: se actualiza lo que se esté viendo
  function trasCambio(id, msg){
    refrescarCuentas();
    if(msg) H.avisar(msg);
    if(H.linea && q('.linea-caja', main())) H.linea.refrescar();
    else if(E.seccion==='produccion' && !q('.linea-caja', main())) H.ir('produccion');
    else if(E.seccion==='vehiculos' && H.DIBUJAR.vehiculos) H.ir('vehiculos');
    if(id && fichaAbierta()) abrirFichaVeh(id);
  }

  // ---------------------------------------------------------------- Entrar a producción
  function entrar(unidadId, despues){
    var paso = unidadId ? Promise.resolve({unidad_id: unidadId}) : H.abrirLista({titulo: '¿Para qué es?', grupos: [{opciones: [
      {valor: 'venta', nombre: 'Para una venta', detalle: 'Ya tiene nota de remisión'},
      {valor: 'showroom', nombre: 'Para showroom', detalle: 'Se queda en bodega y se puede mandar a una sucursal'}]}]}).then(function(para){
      if(para==='venta'){
        return H.rpc('inv_ventas', {p_bodega: E.verBodega}).then(function(l){
          var por = l.filter(function(v){ return v.estado_venta==='por_armar' });
          if(!por.length){ aviso('No hay ventas por armar', 'Primero registra la venta en "Nueva venta". Si ya está, revisa que haya un vehículo de ese modelo y color en espera de armado.'); return null; }
          return H.abrirLista({titulo: '¿Qué vehículo de qué venta?', ayuda: 'De la compra más antigua a la más reciente', grupos: [{opciones: por.map(function(v){
            return {valor: v.unidad_id, nombre: 'Remisión '+remisionDe(v), detalle: nombreVeh(v)+(v.especial ? ' · Especial: '+v.especial_que : ''), color: colorHex(v.color_id)} })}]})
            .then(function(id){ return id==null ? null : {unidad_id: id} });
        });
      }
      if(para==='showroom'){
        return H.rpc('inv_espera_armado', {p_bodega: E.verBodega}).then(function(l){
          if(!l.length){ aviso('No hay vehículos en espera de armado', 'Aparecen cuando se revisa un contenedor.'); return null; }
          return H.abrirLista({titulo: '¿Qué vehículo?', ayuda: 'De los que están en espera de armado', grupos: [{opciones: l.map(function(x, i){
            return {valor: i, nombre: nombreVeh(x), detalle: E.rol!=='bodega' ? H.nombreBodega(x.bodega) : '', n: x.cantidad, color: colorHex(x.color_id)} })}]})
            .then(function(i){ if(i==null) return null; var x = l[i];
              return {para: 'showroom', bodega: x.bodega, modelo_id: x.modelo_id, opciones: x.opciones, color_id: x.color_id}; });
        });
      }
      return null;
    });
    paso.then(function(p){
      if(!p) return;
      return H.pedirTexto({titulo: 'Número de serie', ayuda: 'El que trae el chasis', etiqueta: 'Número de serie', boton: 'Entrar a producción',
        falta: 'Escribe el número de serie.'}).then(function(serie){
        if(serie==null) return;
        p.serie = serie;
        return H.rpc('inv_produccion_entrar', {p: p}).then(function(r){
          refrescarCuentas();
          H.avisar('Serie '+serie+' entró a producción, en Armado. Sus piezas se descontaron del inventario.');
          // Entra aunque no alcancen las piezas (llegan con el vehículo), pero se avisa cuáles faltan en el inventario
          var fal = r.faltan_en_inventario || [];
          if(fal.length) aviso('Faltan piezas en el inventario', 'Serie '+serie+' entró a producción, pero en el inventario no alcanzaron: '+
            fal.map(function(x){ return x.faltan+' '+x.pieza }).join(', ')+'. Revisa que se hayan registrado al revisar su contenedor.');
          H.marcarNuevo('produccion');
          if(despues) despues(r.id);
          else if(E.seccion==='ventas' && CACHE.venta) abrirFichaVenta(CACHE.venta.id);
        });
      });
    }).catch(function(err){ aviso('No se pudo', H.mensaje(err)); });
  }

  // ---------------------------------------------------------------- Acciones sobre un vehículo (las usan la ficha, la línea y la lista)
  // h: el vehículo (con etapa, especial, modelo_id…). alTerminar(id, mensaje)
  function avanzar(h, p, alTerminar){
    var sig = siguiente(h);
    return H.rpc('inv_vehiculo_avanzar', {p_id: h.id, p: p || {}}).then(function(r){
      var msg = r.faltantes ? 'Serie '+h.serie+' se quedó en Revisión 1: le faltan piezas.' : r.no_paso ? 'Serie '+h.serie+' no pasó la revisión final.' : 'Serie '+h.serie+' pasó a '+etapa(r.etapa).nombre+'.';
      (alTerminar || trasCambio)(h.id, msg);
    }).catch(function(err){ aviso('No se pudo', H.mensaje(err)); });
  }
  function regresar(h, alTerminar){
    var ant = anterior(h), destino = ant ? ant.nombre : 'En espera de armado';
    H.confirmar({titulo: '¿Regresar a '+destino+'?', ayuda: h.etapa==='armado' ? 'El vehículo sale de producción y regresa a En espera de armado.'
        : (ant && (ant.id==='revision1' || ant.id==='armado') ? 'Lo que se anotó en la Revisión 1 se borra, para volver a revisarlo.' : 'Por si se pasó por error.'),
      si: 'Sí, regresar', no: 'Cancelar'}).then(function(ok){
      if(!ok) return;
      H.rpc('inv_vehiculo_regresar', {p_id: h.id}).then(function(r){
        if(r.borrado){ cerrarFicha(); (alTerminar || trasCambio)(null, 'Serie '+h.serie+' regresó a En espera de armado.'); }
        else (alTerminar || trasCambio)(h.id, 'Serie '+h.serie+' regresó a '+destino+'.');
      }).catch(function(err){ aviso('No se pudo', H.mensaje(err)); });
    });
  }
  function faltantesListos(h, alTerminar){
    H.rpc('inv_vehiculo_faltantes_listos', {p_id: h.id}).then(function(r){
      (alTerminar || trasCambio)(h.id, 'Serie '+h.serie+': ya se pusieron las piezas. Pasó a '+etapa(r.etapa).nombre+'.');
    }).catch(function(err){ aviso('No se pudo', H.mensaje(err)); });
  }
  function noPasa(h, alTerminar){
    H.pedirTexto({titulo: '¿Por qué no pasa?', ayuda: 'Se queda marcado en revisión final hasta que se corrija', etiqueta: 'Qué hay que corregir', largo: true,
      boton: 'Guardar', falta: 'Escribe qué hay que corregir.'}).then(function(t){ if(t!=null) avanzar(h, {pasa: false, nota: t}, alTerminar); });
  }
  // El paso principal de la etapa en la que está (lo que hace el botón grande)
  function pasoPrincipal(h, alTerminar){
    if(h.faltantes) return faltantesListos(h, alTerminar);
    if(h.etapa==='revision1') return revision1(h, alTerminar);
    if(h.etapa==='revision_final') return avanzar(h, {pasa: true}, alTerminar);
    return avanzar(h, {}, alTerminar);
  }
  function textoPaso(h){
    var sig = siguiente(h);
    if(h.faltantes) return '✓ Ya se pusieron las piezas';
    if(h.etapa==='revision1') return 'Hacer la Revisión 1';
    if(h.etapa==='revision_final') return '✓ Pasa la revisión final';
    return sig ? 'Pasar a '+sig.nombre : '';
  }

  // Revisión 1: "✓ Todo bien" o anotar faltantes (qué pieza y cuántas, sin grado) y daños (tipo, grado, pieza y cuántas)
  function piezasDelModelo(modeloId){
    var ids = (E.cat.materiales||[]).filter(function(m){ return m.modelo_id===modeloId }).map(function(m){ return m.pieza_id });
    return (E.cat.piezas||[]).filter(function(p){ return ids.indexOf(p.id) > -1 && p.activo!==false });
  }
  function revision1(h, alTerminar){
    var danos = [], enLista = false;
    var piezas = piezasDelModelo(h.modelo_id);
    function nomPieza(id){ var p = I.porId(E.cat.piezas, id); return p ? p.nombre : '' }
    new Promise(function(fin){
      function abrir(){
        H.abrirHoja(H.cabHoja('Revisión 1 · Serie '+h.serie, 'Revisa si le falta alguna pieza o si alguna viene dañada')+'<div class="hoja-cuerpo">'+
          (danos.length ? '<div class="tarjetas">'+danos.map(function(d, k){
            var x = I.porId(E.cat.defectos, d.defecto_id);
            return '<div class="tarjeta" style="padding:10px 12px"><span class="cant">'+d.cantidad+'</span><span class="ico-d">'+H.icoDano(x ? x.nombre : '')+'</span>'+
              '<span class="txt"><b>'+esc(x ? x.nombre : '?')+'</b><small>'+esc([nomPieza(d.pieza_id), gravNom(d.gravedad)].filter(Boolean).join(' · '))+'</small></span>'+
              '<span class="btns"><button type="button" class="btn" data-quitar="'+k+'">Quitar</button></span></div>';
          }).join('')+'</div>' : '<p style="margin:0 0 6px">Si todo está bien, da "✓ Todo bien". Si falta una pieza, agrégala como "Faltante de pieza".</p>')+
          '<button type="button" class="btn" data-agregar style="margin-top:10px">+ Agregar faltante o daño</button>'+
          '<div class="acciones"><button type="button" class="btn" data-hoja-cerrar>Cancelar</button>'+
          '<button type="button" class="btn prin der" data-listo>'+(danos.length ? 'Guardar revisión' : '✓ Todo bien')+'</button></div></div>', function(v){ if(!enLista) fin(v); });
        H.hojaEl().onclick = function(e){
          if(e.target.closest('[data-hoja-cerrar]')){ H.cerrarHoja(null); return; }
          if(e.target.closest('[data-listo]')){ H.cerrarHoja({defectos: danos}); return; }
          var qq = e.target.closest('[data-quitar]');
          if(qq){ danos.splice(+qq.dataset.quitar, 1); enLista = true; abrir(); enLista = false; return; }
          if(e.target.closest('[data-agregar]')){
            enLista = true;
            var d = {};
            H.abrirLista({titulo: '¿Qué encontraste?', grupos: [{opciones: (E.cat.defectos||[]).filter(function(x){ return x.activo!==false }).map(function(x){
                return {valor: x.id, nombre: x.nombre, ico: H.icoDano(x.nombre)} })}]})
              .then(function(t){
                if(t==null) return null; d.defecto_id = t;
                if(esFaltante(t)) return true;   // un faltante no tiene grado (pedido del usuario)
                return H.abrirLista({titulo: '¿Qué tan grave?', grupos: [{opciones: [{valor: 'leve', nombre: 'Leve'}, {valor: 'media', nombre: 'Media'}, {valor: 'grave', nombre: 'Grave'}]}]})
                  .then(function(g){ if(g==null) return null; d.gravedad = g; return true; });
              })
              .then(function(ok){
                if(!ok) return null;
                if(!piezas.length) return true;
                return H.abrirLista({titulo: esFaltante(d.defecto_id) ? '¿Qué pieza falta?' : '¿En qué pieza?', grupos: [{opciones: piezas.map(function(p){
                    return {valor: p.id, nombre: p.nombre, ico: H.icoPieza(p.nombre)} })}]})
                  .then(function(p){ if(p==null) return null; d.pieza_id = p; return true; });
              })
              .then(function(ok){ if(!ok) return null; return H.pedirCantidad({titulo: '¿Cuántas piezas?', valor: 1, boton: 'Agregar'}); })
              .then(function(n){ if(n!=null){ d.cantidad = n; danos.push(d); } enLista = false; abrir(); });
          }
        };
      }
      abrir();
    }).then(function(v){ if(v) avanzar(h, v, alTerminar); });
  }

  // ================================================================ Ficha del vehículo, del lado derecho (como la de Logística)
  var FICHA = null;   // el vehículo que se está viendo
  function fichaAbierta(){ var x = document.getElementById('insp'); return x && x.classList.contains('on') && x.dataset.inv==='1' }
  function cerrarFicha(){
    var x = document.getElementById('insp'), s = document.getElementById('scrim');
    if(x){ x.classList.remove('on'); x.setAttribute('aria-hidden', 'true'); delete x.dataset.inv; }
    if(s) s.classList.remove('on');
    FICHA = null;
  }
  function abrirFichaVeh(id){
    var insp = document.getElementById('insp'); if(!insp) return;
    H.rpc('inv_vehiculo', {p_id: id}).then(function(f){
      var h = f.vehiculo, v = f.venta; FICHA = h;
      var r = ruta(h.especial), iAhora = indice(h), et = etapa(h.etapa), ant = anterior(h);
      var est = h.faltantes ? ['rojo', 'Faltan piezas', 'La Revisión 1 encontró piezas que faltan. No avanza hasta que se pongan.']
        : h.no_paso ? ['rojo', 'No pasó la revisión final', 'Hay que corregirlo antes de que salga.']
        : h.etapa==='listo' ? ['ok', 'Listo', v ? 'Listo para enviar.' : 'Listo en showroom.']
        : ['azul', et.nombre, 'Lleva '+dias(h.etapa_desde)+' en esta etapa.'];
      document.getElementById('ih').textContent = 'Serie '+h.serie;
      document.getElementById('is').innerHTML = puntoColor(h.color_id)+esc(nombreVeh(h));
      var kv = [
        ['Para', v ? 'Venta · remisión '+esc(v.remision)+(v.partes > 1 ? ' ('+v.parte+' de '+v.partes+')' : '') : 'Showroom'],
        ['Especial', h.especial ? esc((v && v.especial_que) || 'Sí') : 'No']
      ];
      if(v) kv.push(['Vendedor', esc(v.vendedor)], ['Destino', esc(v.destino)+(v.tipo_destino ? ' · '+esc(v.tipo_destino) : '')], ['Fecha de venta', esc(H.fechaLarga(v.fecha))+' · hace '+esc(dias(v.fecha))]);
      kv.push(['Bodega', esc(H.nombreBodega(h.bodega))], ['Entró a producción', esc(H.fechaLarga(String(h.creado).slice(0, 10)))]);
      var html = '<div class="state"><span class="etq '+est[0]+'">'+esc(est[1])+'</span><span><small>'+esc(est[2])+'</small></span></div>'+
        '<ol class="recorrido chico">'+r.map(function(x, i){
          var cl = i < iAhora || h.etapa==='listo' ? 'hecho' : i===iAhora ? (h.faltantes || h.no_paso ? 'ahora falta' : 'ahora') : '';
          return '<li class="'+cl+'"><span class="nn">'+(cl==='hecho' ? '✓' : i+1)+'</span><span>'+esc(x.nombre)+'</span></li>';
        }).join('')+'</ol>';
      if(H.puedeEscribir()){
        var t = textoPaso(h);
        html += '<div class="ficha-acciones">'+(t ? '<button type="button" class="btn prin" data-fv="paso">'+esc(t)+'</button>' : '')+
          (h.etapa==='revision_final' && !h.faltantes ? '<button type="button" class="btn" data-fv="nopasa">No pasa</button>' : '')+
          '<button type="button" class="btn-link" data-fv="regresar">↩ Regresar a '+esc(ant ? ant.nombre : 'En espera de armado')+'</button></div>';
      }
      html += '<dl class="kv">'+kv.map(function(x){ return '<dt>'+x[0]+'</dt><dd>'+x[1]+'</dd>' }).join('')+'</dl>';
      var defs = f.defectos || [];
      if(defs.length) html += '<h3 class="ficha-sub">Lo que encontró la Revisión 1</h3>'+defs.map(function(d){
        var x = I.porId(E.cat.defectos, d.defecto_id);
        return '<div class="ficha-dano"><span class="ico-d">'+H.icoDano(x ? x.nombre : '')+'</span><span><b>'+d.cantidad+' · '+esc(x ? x.nombre : '?')+'</b><small>'+
          esc([d.pieza, gravNom(d.gravedad)].filter(Boolean).join(' · '))+'</small></span>'+(d.resuelto ? '<span class="etq ok chica">Ya se puso</span>' : '')+'</div>';
      }).join('');
      var notas = (f.historial||[]).filter(function(x){ return x.accion==='no_paso' });
      if(notas.length) html += '<h3 class="ficha-sub">No pasó la revisión final</h3><ul class="notas">'+notas.map(function(x){
        return '<li>'+esc(H.fechaLarga(String(x.fecha).slice(0, 10)))+': '+esc(x.nota)+'</li>' }).join('')+'</ul>';
      var hist = E.rol==='bodega' ? [] : (f.historial||[]).filter(function(x){ return x.accion!=='no_paso' });   // el historial no lo ven las bodegas
      if(hist.length) html += '<h3 class="ficha-sub">Historial</h3><ul class="historial">'+hist.map(function(x){
        var txt = x.accion==='entro' ? 'Entró a '+etapa(x.etapa).nombre : x.accion==='regreso' ? 'Regresó a '+etapa(x.etapa).nombre
          : x.accion==='faltantes' ? 'Se detuvo: faltan piezas' : 'Se pusieron las piezas que faltaban';
        var fe = new Date(x.fecha);
        return '<li><span>'+esc(txt)+'</span><small>'+esc(H.fechaLarga(String(x.fecha).slice(0, 10)))+' · '+String(fe.getHours()).padStart(2,'0')+':'+String(fe.getMinutes()).padStart(2,'0')+'</small></li>';
      }).join('')+'</ul>';
      document.getElementById('ib').innerHTML = html;
      insp.dataset.inv = '1';
      insp.classList.add('on'); insp.setAttribute('aria-hidden', 'false');
      var s = document.getElementById('scrim'); if(s) s.classList.add('on');
    }).catch(function(err){ aviso('No se pudo', H.mensaje(err)); });
  }
  // Botones de la ficha (está fuera de la pantalla de Inventario)
  document.addEventListener('click', function(e){
    var b = e.target.closest('#insp [data-fv]'); if(!b || !FICHA) return;
    var h = FICHA, a = b.dataset.fv;
    if(a==='paso') pasoPrincipal(h);
    else if(a==='nopasa') noPasa(h);
    else if(a==='regresar') regresar(h);
  });
  // Al cerrar la ficha con la X, el fondo o Esc (lo maneja index.html), se olvida el vehículo
  ['close', 'scrim'].forEach(function(id){ var x = document.getElementById(id); if(x) x.addEventListener('click', function(){ var i = document.getElementById('insp'); if(i) delete i.dataset.inv; FICHA = null; }); });

  // ================================================================ Clics generales
  function alClicGeneral(e){
    if(!E.raiz || !E.raiz.contains(e.target)) return;
    var m = main(), b;
    if(E.seccion==='venta' && V && m.contains(e.target) && e.target.closest('[data-nv]')){ alClicVenta(e, m); return; }
    if((b = e.target.closest('[data-ficha-venta]'))){ abrirFichaVenta(+b.dataset.fichaVenta); return; }
    if((b = e.target.closest('[data-ficha-veh]'))){ abrirFichaVeh(+b.dataset.fichaVeh); return; }
    if((b = e.target.closest('[data-entrar-unidad]'))){ entrar(+b.dataset.entrarUnidad); return; }
    if(e.target.closest('[data-entrar]')){ entrar(null, H.linea && q('.linea-caja', main()) ? function(){ H.linea.refrescar() } : function(){ H.ir('produccion') }); return; }
    if((b = e.target.closest('[data-modo-prod]'))){ try { localStorage.setItem('logistica.prodModo', b.dataset.modoProd) } catch(er){} H.ir('produccion'); return; }
    if((b = e.target.closest('[data-corregir-venta]'))){
      var v = CACHE.venta; if(!v) return;
      var renglones = [];
      v.unidades.forEach(function(u){ renglones.push({modelo_id: u.modelo_id, opciones: u.opciones || [], color_id: u.color_id, especial: u.especial, especial_que: u.especial_que || '', cantidad: 1}) });
      V = {paso: 1, id: v.id, remisionOriginal: v.remision, bodega: v.bodega, remision: v.remision, fecha: v.fecha, vendedor: v.vendedor, destino: v.destino,
        tipo_destino: v.tipo_destino || '', vehiculos: renglones, conProduccion: v.unidades.some(function(u){ return !!u.vehiculo }), error: ''};
      juntar();
      E.seccion = 'venta'; H.dibujarMenu(); dibujarVenta(main());
      return;
    }
    if(e.target.closest('[data-ir-sec="venta"]')){ V = null; }
  }
  document.addEventListener('click', alClicGeneral);

  // Burbujas del menú: vehículos por armar y vehículos que necesitan atención (faltan piezas o no pasaron)
  function refrescarCuentas(){
    if(!H.puedeEscribir()) return;
    Promise.all([H.rpc('inv_ventas', {p_bodega: E.verBodega}), H.rpc('inv_produccion', {p_bodega: E.verBodega})]).then(function(r){
      H.CUENTA.ventas = r[0].filter(function(v){ return v.estado_venta==='por_armar' }).length || '';
      H.CUENTA.produccion = r[1].filter(function(h){ return h.faltantes || h.no_paso }).length || '';
      H.dibujarMenu();
    }).catch(function(){});
  }
  H.alIniciar.push(refrescarCuentas);
  H.prod = {ETAPAS: ETAPAS, etapa: etapa, ruta: ruta, indice: indice, siguiente: siguiente, anterior: anterior, nombreVeh: nombreVeh, colorHex: colorHex,
    puntoColor: puntoColor, dias: dias, paraDe: paraDe, aviso: aviso, entrar: entrar, avanzar: avanzar, regresar: regresar, revision1: revision1,
    faltantesListos: faltantesListos, noPasa: noPasa, pasoPrincipal: pasoPrincipal, textoPaso: textoPaso,
    abrirFichaVeh: abrirFichaVeh, refrescarCuentas: refrescarCuentas, ESTADOS: ESTADOS, remisionDe: remisionDe};
})();
