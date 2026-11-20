/* Producción y ventas (20-nov-2026). Diseño: docs/superpowers/specs/2026-11-20-produccion-ventas-design.md
   Nueva venta → Por armar / Esperando piezas → Entrar a producción (venta o showroom, número de serie)
   → etapas: Armado, Revisión 1, Mecánica, Herrería y Forrado (rama de especiales), Detallado y pintura, Revisión final → Listo.
   Si la Revisión 1 encuentra un "Faltante de pieza", el vehículo queda en Faltantes hasta que se pongan. */
(function(){
  var H = window.InventarioApp._h, E = H.E, I = H.I, esc = H.esc, q = H.q;
  function main(){ return q('.inv-main', E.raiz) }

  var ETAPAS = [
    {id: 'armado', nombre: 'Armado'},
    {id: 'revision1', nombre: 'Revisión 1'},
    {id: 'mecanica', nombre: 'Mecánica'},
    {id: 'herreria', nombre: 'Herrería', especial: true},   // rama de especiales: sale después de Mecánica
    {id: 'forrado', nombre: 'Forrado', especial: true},     // y vuelve en Detallado y pintura
    {id: 'detallado', nombre: 'Detallado y pintura'},
    {id: 'revision_final', nombre: 'Revisión final'},
    {id: 'listo', nombre: 'Listo'}
  ];
  function etapa(id){ return ETAPAS.filter(function(x){ return x.id===id })[0] || {id: id, nombre: id} }
  function ruta(especial){ return ETAPAS.filter(function(x){ return especial || !x.especial }) }
  function siguiente(h){ var r = ruta(h.especial), i = r.map(function(x){ return x.id }).indexOf(h.etapa); return r[i+1] }

  var ESTADOS = {
    faltantes: {nombre: 'Faltantes', etq: 'rojo', sub: 'La Revisión 1 encontró piezas que faltan'},
    por_armar: {nombre: 'Por armar', etq: 'ok', sub: 'Hay vehículo en espera de armado para ellas'},
    esperando: {nombre: 'Esperando piezas', etq: 'pend', sub: 'Todavía no llega un vehículo de ese modelo y color'},
    produccion: {nombre: 'En producción', etq: 'azul', sub: ''},
    lista: {nombre: 'Listas para enviar', etq: 'ok', sub: 'Pasaron la revisión final'}
  };
  var TIPOS_DESTINO = ['Local', 'Semi Local', 'Foráneo', 'Sucursal', 'Se recoge en granja'];

  function nombreVeh(r){ return I.nombreVehiculo({modelo_id: r.modelo_id, opciones: r.opciones||[], color_id: r.color_id}, E.cat) }
  function puntoColor(id){ var c = I.porId(E.cat.colores, id), hx = c && H.hexColor(c.nombre); return hx ? '<span class="pt-col" style="background:'+hx+'"></span>' : '' }
  function dias(desde){
    var d = new Date(String(desde).length===10 ? desde + 'T12:00:00' : desde);
    var n = Math.max(0, Math.floor((Date.now() - d.getTime()) / 864e5));
    return n===0 ? 'hoy' : n===1 ? '1 día' : n+' días';
  }
  function avisoPrueba(){
    return '<p class="aviso-prueba"><span class="etq pend">En prueba</span> Las ventas se siguen capturando en el Drive hasta el día del cambio.</p>';
  }
  function errorEn(el, err){ el.innerHTML = '<p class="inv-error">'+esc(H.mensaje(err))+'</p>' }

  // ================================================================ Nueva venta (y corregir)
  var V = null;
  function nuevaV(){ return {paso: 1, id: null, bodega: E.rol==='bodega' ? E.bodega : E.verBodega, remision: '', fecha: H.hoyISO(), vendedor: '',
    destino: '', tipo_destino: '', modelo_id: null, opciones: [], color_id: null, especial: null, especial_que: '', error: ''} }

  function campoElegir(accion, etiqueta, valor, vacio){
    return '<div class="campo"><span>'+esc(etiqueta)+'</span><button type="button" class="elegir" data-nv="'+accion+'">'+
      '<span><span class="va'+(valor ? '' : ' vacio')+'">'+esc(valor || vacio)+'</span></span><span class="fl">'+H.ICO.flecha+'</span></button></div>';
  }

  function dibujarVenta(m){
    if(!V || V.terminado) V = nuevaV();
    var corrigiendo = !!V.id, titulos = ['Venta', 'Vehículo', 'Destino', 'Guardar'];
    var html = '<header class="inv-cab"><h1>'+(corrigiendo ? 'Corregir venta '+esc(V.remisionOriginal) : 'Nueva venta')+'</h1>'+
      '<p>'+(corrigiendo ? 'Cambia lo que haga falta. Se te pedirá el motivo.' : 'Registra la venta como te llegó por WhatsApp.')+'</p></header>'+
      (corrigiendo ? '' : avisoPrueba())+
      '<ol class="pasos">'+titulos.map(function(t, i){
        var n = i+1, cl = n < V.paso ? 'hecho' : (n===V.paso ? 'ahora' : '');
        return '<li class="'+cl+'"><span class="nn">'+(n < V.paso ? '✓' : n)+'</span><span class="tx">'+t+'</span></li>';
      }).join('')+'</ol>'+(V.error ? '<p class="inv-error">'+esc(V.error)+'</p>' : '');

    if(V.paso===1){
      if(E.rol==='admin') html += campoElegir('bodega', 'Bodega', V.bodega ? H.nombreBodega(V.bodega) : '', 'Escoge la bodega');
      html += '<label class="campo"><span>Remisión</span><input id="vRem" autocomplete="off" value="'+esc(V.remision)+'" placeholder="Por ejemplo 153 o 153/1"></label>'+
        '<label class="campo"><span>Fecha de compra</span><input id="vFecha" type="date" value="'+esc(V.fecha)+'"></label>'+
        '<label class="campo"><span>Vendedor</span><input id="vVend" autocomplete="off" value="'+esc(V.vendedor)+'"></label>';
    } else if(V.paso===2){
      html += V.modelo_id
        ? '<div class="tarjetas"><div class="tarjeta"><span class="txt"><b>'+esc(I.nombreModelo(V, E.cat))+'</b><small>'+puntoColor(V.color_id)+
            esc((I.porId(E.cat.colores, V.color_id)||{}).nombre||'')+'</small></span>'+
            '<span class="btns"><button type="button" class="btn" data-nv="vehiculo">Cambiar</button></span></div></div>'
        : '<div class="acciones" style="margin-top:0"><button type="button" class="btn ancho" data-nv="vehiculo">Escoger el vehículo</button></div>';
      html += campoElegir('especial', '¿Es especial?', V.especial==null ? '' : (V.especial ? 'Sí, es especial' : 'No, es normal'), 'Escoge sí o no');
      if(V.especial) html += '<label class="campo"><span>¿Qué lleva?</span><input id="vQue" autocomplete="off" maxlength="80" value="'+esc(V.especial_que)+'" placeholder="Garrafonero, caja seca…"></label>';
    } else if(V.paso===3){
      html += '<label class="campo"><span>Destino</span><input id="vDest" autocomplete="off" value="'+esc(V.destino)+'" placeholder="Ciudad o lugar de entrega"></label>'+
        campoElegir('tipo', 'Tipo de destino', V.tipo_destino, 'Escoge el tipo');
    } else {
      html += '<div class="resumen">Remisión <b>'+esc(V.remision)+'</b>'+(E.rol==='admin' ? ' en <b>'+esc(H.nombreBodega(V.bodega))+'</b>' : '')+
        ', comprada el <b>'+esc(H.fechaLarga(V.fecha))+'</b>, vendedor <b>'+esc(V.vendedor)+'</b>.'+
        '<p style="margin:10px 0 0">'+puntoColor(V.color_id)+'<b>'+esc(nombreVeh(V))+'</b>'+
        (V.especial ? ' · <span class="etq azul">Especial: '+esc(V.especial_que)+'</span>' : '')+'</p>'+
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
    if((x = q('#vQue', m))) V.especial_que = x.value.trim();
    if((x = q('#vDest', m))) V.destino = x.value.trim();
  }

  function escogerVehiculo(){
    var r = {modelo_id: null, opciones: [], color_id: null};
    return H.abrirLista({titulo: 'Modelo', grupos: [{opciones: (E.cat.modelos||[]).filter(function(x){ return x.activo!==false }).map(function(x){ return {valor: x.id, nombre: x.nombre} })}],
      elegido: V.modelo_id}).then(function(mo){
      if(mo==null) return null;
      r.modelo_id = mo;
      var permitidas = (E.cat.modelo_opciones||[]).filter(function(x){ return x.modelo_id===mo }).map(function(x){ return x.opcion_id });
      var cars = (E.cat.caracteristicas||[]).filter(function(c){ return c.activo!==false }).map(function(c){
        return {car: c, opciones: (c.opciones||[]).filter(function(o){ return o.activo!==false && permitidas.indexOf(o.id) > -1 })};
      }).filter(function(x){ return x.opciones.length });
      var i = 0;
      function sig(){
        if(i >= cars.length) return Promise.resolve(true);
        var x = cars[i++], antes = x.opciones.filter(function(o){ return V.opciones.indexOf(o.id) > -1 })[0];
        return H.abrirLista({titulo: x.car.nombre, grupos: [{opciones: x.opciones.map(function(o){ return {valor: o.id, nombre: I.nombreOpcion(x.car.nombre, o.nombre)} })}],
          elegido: antes ? antes.id : null}).then(function(v){ if(v==null) return false; r.opciones.push(v); return sig(); });
      }
      return sig();
    }).then(function(ok){
      if(!ok) return null;
      return H.abrirLista({titulo: 'Color', grupos: [{opciones: (E.cat.colores||[]).filter(function(c){ return c.activo!==false }).map(function(c){
        return {valor: c.id, nombre: c.nombre, color: H.hexColor(c.nombre)} })}], elegido: V.color_id});
    }).then(function(c){ if(c==null) return null; r.color_id = c; return r; });
  }

  function guardarVenta(m){
    var motivo = V.id ? H.pedirTexto({titulo: '¿Por qué corriges la venta?', ayuda: 'Queda guardado junto con el cambio', etiqueta: 'Motivo', largo: true,
      boton: 'Guardar cambios', falta: 'Escribe el motivo del cambio.'}) : Promise.resolve(null);
    motivo.then(function(mot){
      if(V.id && mot==null) return;
      var b = q('[data-nv="guardar"]', m); if(b){ b.disabled = true; b.textContent = 'Guardando…'; }
      H.rpc('inv_venta_guardar', {p: {id: V.id, bodega: V.bodega, remision: V.remision, fecha: V.fecha, vendedor: V.vendedor, destino: V.destino,
        tipo_destino: V.tipo_destino, modelo_id: V.modelo_id, opciones: V.opciones, color_id: V.color_id, especial: !!V.especial, especial_que: V.especial_que},
        p_motivo: mot}).then(function(r){
        var id = r.id, rem = V.remision, eraCorreccion = !!V.id;
        V.terminado = true;
        return H.rpc('inv_ventas', {p_bodega: E.verBodega}).then(function(l){
          var v = l.filter(function(x){ return x.id===id })[0] || {};
          var est = ESTADOS[v.estado_venta] || {nombre: ''};
          m.innerHTML = '<header class="inv-cab"><h1>Listo</h1><p>'+(eraCorreccion ? 'Se guardaron los cambios de la venta ' : 'Se guardó la venta ')+'<b>'+esc(rem)+'</b>.'+
            (est.nombre ? ' Quedó en <span class="etq '+est.etq+'">'+est.nombre+'</span>' : '')+'</p>'+
            (v.estado_venta==='esperando' ? '<p>No hay un vehículo de ese modelo y color en espera de armado. En cuanto se revise un contenedor que lo traiga, pasa sola a "Por armar".</p>' : '')+
            '</header><div class="acciones" style="margin-top:0">'+
            (v.estado_venta==='por_armar' && H.puedeEscribir() ? '<button type="button" class="btn prin" data-entrar-venta="'+id+'">Meterla a producción</button>' : '')+
            '<button type="button" class="btn" data-ir-sec="ventas">Ver ventas</button>'+
            (eraCorreccion ? '' : '<button type="button" class="btn" data-ir-sec="venta">Registrar otra</button>')+'</div>';
          refrescarCuentas();
        });
      }).catch(function(err){ V.error = H.mensaje(err); dibujarVenta(m); });
    });
  }

  function alClicVenta(e, m){
    var b = e.target.closest('[data-nv]'); if(!b) return;
    var a = b.dataset.nv; V.error = ''; leerVenta(m);
    if(a==='bodega'){
      H.abrirLista({titulo: 'Bodega', grupos: [{opciones: H.BODEGAS}], elegido: V.bodega}).then(function(v){ if(v) V.bodega = v; dibujarVenta(m); });
    } else if(a==='vehiculo'){
      escogerVehiculo().then(function(r){ if(r){ V.modelo_id = r.modelo_id; V.opciones = r.opciones; V.color_id = r.color_id; } dibujarVenta(m); });
    } else if(a==='especial'){
      H.abrirLista({titulo: '¿Es especial?', ayuda: 'Los especiales pasan por herrería y forrado',
        grupos: [{opciones: [{valor: 'no', nombre: 'No, es normal'}, {valor: 'si', nombre: 'Sí, es especial', detalle: 'Garrafonero, caja seca…'}]}],
        elegido: V.especial==null ? null : (V.especial ? 'si' : 'no')}).then(function(v){ if(v) V.especial = v==='si'; dibujarVenta(m); var x = q('#vQue', m); if(x && !V.especial_que) x.focus(); });
    } else if(a==='tipo'){
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
        if(!V.modelo_id) V.error = 'Escoge el vehículo';
        else if(V.especial==null) V.error = 'Escoge si es especial';
        else if(V.especial && !V.especial_que) V.error = 'Escribe qué lleva el especial';
        else V.paso = 3;
      } else if(V.paso===3){
        if(!V.destino) V.error = 'Escribe el destino';
        else if(!V.tipo_destino) V.error = 'Escoge el tipo de destino';
        else V.paso = 4;
      }
      dibujarVenta(m);
      if(V.paso===2 && !V.modelo_id && !V.error) b.closest && setTimeout(function(){ var x = q('[data-nv="vehiculo"]', m); if(x) x.click(); }, 50);
    } else if(a==='atras'){ V.paso = Math.max(1, V.paso-1); dibujarVenta(m); }
    else if(a==='cancelar'){ var id = V.id; V = null; abrirFichaVenta(id); }
    else if(a==='guardar') guardarVenta(m);
  }

  H.DIBUJAR.venta = function(m){ dibujarVenta(m) };

  // ================================================================ Ventas
  var ORDEN_VENTAS = ['faltantes', 'por_armar', 'esperando', 'produccion', 'lista'];
  H.DIBUJAR.ventas = function(m){
    H.rpc('inv_ventas', {p_bodega: E.verBodega}).then(function(lista){
      if(E.seccion!=='ventas') return;
      CACHE.ventas = lista;
      var html = '<header class="inv-cab"><h1>Ventas</h1><p>De la compra más antigua a la más reciente.</p></header>'+avisoPrueba();
      if(!lista.length){
        html += '<div class="inv-vacio"><b>Todavía no hay ventas</b>'+(H.puedeEscribir() ? 'Cuando llegue una por WhatsApp, regístrala en "Nueva venta".' : '')+'</div>';
      }
      ORDEN_VENTAS.forEach(function(est){
        var g = lista.filter(function(v){ return v.estado_venta===est }); if(!g.length) return;
        var x = ESTADOS[est];
        html += '<h2 class="inv-sub">'+x.nombre+' <span>· '+g.length+'</span></h2>'+(x.sub ? '<p class="inv-sub-p">'+x.sub+'</p>' : '')+
          '<div class="tarjetas">'+g.map(tarjetaVenta).join('')+'</div>';
      });
      m.innerHTML = html;
    }).catch(function(err){ errorEn(m, err) });
  };

  function tarjetaVenta(v){
    var est = ESTADOS[v.estado_venta] || {nombre: '', etq: 'anul'};
    var abajo = (v.especial ? '<span class="etq azul chica">Especial: '+esc(v.especial_que)+'</span> ' : '')+
      esc(v.vendedor)+' · '+esc(v.destino)+' · '+esc(dias(v.fecha))+(E.rol!=='bodega' && !E.verBodega ? ' · '+esc(H.nombreBodega(v.bodega)) : '');
    var der = v.estado_venta==='produccion' && v.vehiculo ? '<span class="etq azul">'+esc(etapa(v.vehiculo.etapa).nombre)+'</span>'
      : '<span class="etq '+est.etq+'">'+est.nombre+'</span>';
    return '<button type="button" class="tarjeta clic" data-ficha-venta="'+v.id+'"><span class="cant rem">'+esc(v.remision)+'</span>'+
      '<span class="txt"><b>'+puntoColor(v.color_id)+esc(nombreVeh(v))+'</b><small>'+abajo+'</small></span>'+der+
      '<span class="fl" style="color:var(--muted)">'+H.ICO.flecha+'</span></button>';
  }

  var CACHE = {ventas: null};
  function abrirFichaVenta(id){
    E.seccion = 'ventas'; H.dibujarMenu();
    var m = main(); m.innerHTML = '<p class="inv-cargando">Cargando…</p>'; window.scrollTo({top: 0});
    H.rpc('inv_ventas', {p_bodega: null}).then(function(l){
      var v = l.filter(function(x){ return x.id===id })[0];
      if(!v){ m.innerHTML = '<p class="inv-error">Esa venta no existe.</p>'; return; }
      var est = ESTADOS[v.estado_venta] || {nombre: '', etq: 'anul'};
      var dato = function(t, val){ return '<div class="dato"><span>'+t+'</span><b>'+val+'</b></div>' };
      var html = '<button type="button" class="btn-link" data-ir-sec="ventas">‹ Ventas</button>'+
        '<header class="inv-cab" style="display:flex;align-items:center;gap:14px;flex-wrap:wrap"><h1>Remisión '+esc(v.remision)+'</h1><span class="etq '+est.etq+'">'+est.nombre+'</span></header>'+
        '<div class="datos">'+
        dato('Vehículo', puntoColor(v.color_id)+esc(nombreVeh(v)))+
        dato('Especial', v.especial ? esc(v.especial_que) : 'No')+
        dato('Fecha de compra', esc(H.fechaLarga(v.fecha))+' · '+esc(dias(v.fecha)))+
        dato('Vendedor', esc(v.vendedor))+
        dato('Destino', esc(v.destino)+(v.tipo_destino ? ' · '+esc(v.tipo_destino) : ''))+
        (E.rol!=='bodega' ? dato('Bodega', esc(H.nombreBodega(v.bodega))) : '')+
        (v.vehiculo ? dato('Número de serie', esc(v.vehiculo.serie)+' · '+esc(etapa(v.vehiculo.etapa).nombre)) : '')+
        '</div>';
      if(v.estado_venta==='esperando') html += '<p style="margin:16px 0 0;color:var(--muted)">No hay un vehículo de ese modelo y color en espera de armado. Pasa sola a "Por armar" cuando se revise un contenedor que lo traiga.</p>';
      html += '<div class="acciones">'+
        (v.estado_venta==='por_armar' && H.puedeEscribir() ? '<button type="button" class="btn prin" data-entrar-venta="'+v.id+'">Meterla a producción</button>' : '')+
        (v.vehiculo ? '<button type="button" class="btn prin" data-ficha-veh="'+v.vehiculo.id+'">Ver el vehículo</button>' : '')+
        (H.puedeEscribir() ? '<button type="button" class="btn" data-corregir-venta="'+v.id+'">Corregir la venta</button>' : '')+'</div>';
      m.innerHTML = html;
      CACHE.venta = v;
    }).catch(function(err){ errorEn(m, err) });
  }

  // ================================================================ Producción
  H.DIBUJAR.produccion = function(m){
    H.rpc('inv_produccion', {p_bodega: E.verBodega}).then(function(lista){
      if(E.seccion!=='produccion') return;
      var enCurso = lista.filter(function(h){ return h.etapa!=='listo' }).length;
      var html = '<header class="inv-cab"><h1>Producción</h1><p>'+(enCurso ? enCurso+(enCurso===1 ? ' vehículo en producción.' : ' vehículos en producción.') : 'Los vehículos que se están armando, por etapa.')+'</p></header>';
      var modo = modoProduccion();
      html += '<div class="prod-barra">'+(H.puedeEscribir() ? '<button type="button" class="btn prin" data-entrar>+ Entrar a producción</button>' : '')+
        '<div class="vista-sel" role="group" aria-label="Ver como"><button type="button" data-modo-prod="linea" aria-pressed="'+(modo==='linea')+'">Línea</button>'+
        '<button type="button" data-modo-prod="lista" aria-pressed="'+(modo==='lista')+'">Lista</button></div></div>';
      if(modo==='linea' && H.linea){ m.innerHTML = html + '<div class="linea-caja"></div>'; H.linea.dibujar(q('.linea-caja', m), lista); return; }
      if(!lista.length) html += '<div class="inv-vacio"><b>Todavía no hay vehículos en producción</b>Cuando empiecen a armar uno, dale "Entrar a producción".</div>';
      var falt = lista.filter(function(h){ return h.faltantes });
      if(falt.length) html += '<h2 class="inv-sub rojo">Faltantes <span>· '+falt.length+'</span></h2><p class="inv-sub-p">No avanzan hasta que se pongan las piezas</p>'+
        '<div class="tarjetas">'+falt.map(tarjetaVeh).join('')+'</div>';
      ETAPAS.forEach(function(et){
        var g = lista.filter(function(h){ return h.etapa===et.id && !h.faltantes }); if(!g.length) return;
        html += '<h2 class="inv-sub">'+(et.id==='listo' ? 'Listos' : et.nombre)+' <span>· '+g.length+'</span></h2>'+
          '<div class="tarjetas">'+g.map(tarjetaVeh).join('')+'</div>';
      });
      m.innerHTML = html;
    }).catch(function(err){ errorEn(m, err) });
  };

  // Línea (el dibujo) o Lista; en celular siempre Lista. Se recuerda en el navegador.
  function modoProduccion(){
    if(innerWidth < 700) return 'lista';
    try { return localStorage.getItem('logistica.prodModo') || 'linea' } catch(e){ return 'linea' }
  }
  function tarjetaVeh(h){
    var para = h.venta ? 'Venta '+esc(h.venta.remision) : 'Showroom';
    return '<button type="button" class="tarjeta clic" data-ficha-veh="'+h.id+'"><span class="txt"><b>'+puntoColor(h.color_id)+esc(nombreVeh(h))+'</b>'+
      '<small>Serie '+esc(h.serie)+' · '+para+(E.rol!=='bodega' && !E.verBodega ? ' · '+esc(H.nombreBodega(h.bodega)) : '')+'</small></span>'+
      (h.especial ? '<span class="etq azul">Especial</span>' : '')+
      (h.etapa!=='listo' ? '<span class="etq anul">'+esc(dias(h.etapa_desde))+'</span>' : '')+
      '<span class="fl" style="color:var(--muted)">'+H.ICO.flecha+'</span></button>';
  }

  // ---------------------------------------------------------------- Entrar a producción
  function entrar(ventaId, despues){
    var paso = ventaId ? Promise.resolve({venta_id: ventaId}) : H.abrirLista({titulo: '¿Para qué es?', grupos: [{opciones: [
      {valor: 'venta', nombre: 'Para una venta', detalle: 'Ya tiene nota de remisión'},
      {valor: 'showroom', nombre: 'Para showroom', detalle: 'Se queda en bodega y se puede mandar a una sucursal'}]}]}).then(function(para){
      if(para==='venta'){
        return H.rpc('inv_ventas', {p_bodega: E.verBodega}).then(function(l){
          var por = l.filter(function(v){ return v.estado_venta==='por_armar' });
          if(!por.length){ aviso('No hay ventas por armar', 'Primero registra la venta en "Nueva venta". Si ya está, revisa que haya un vehículo de ese modelo y color en espera de armado.'); return null; }
          return H.abrirLista({titulo: '¿Qué venta?', ayuda: 'De la compra más antigua a la más reciente', grupos: [{opciones: por.map(function(v){
            return {valor: v.id, nombre: 'Remisión '+v.remision, detalle: nombreVeh(v)+(v.especial ? ' · Especial: '+v.especial_que : ''), color: colorHex(v.color_id)} })}]})
            .then(function(id){ return id==null ? null : {venta_id: id} });
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
        return H.rpc('inv_produccion_entrar', {p: p}).then(function(r){ refrescarCuentas(); (despues || abrirFichaVeh)(r.id); });
      });
    }).catch(function(err){ aviso('No se pudo', H.mensaje(err)); });
  }
  function colorHex(id){ var c = I.porId(E.cat.colores, id); return c ? H.hexColor(c.nombre) : null }
  function aviso(titulo, texto){ H.confirmar({titulo: titulo, ayuda: texto, si: 'Entendido', no: 'Cerrar'}) }

  // ---------------------------------------------------------------- Ficha de un vehículo
  function abrirFichaVeh(id){
    E.seccion = 'produccion'; H.dibujarMenu();
    var m = main(); m.innerHTML = '<p class="inv-cargando">Cargando…</p>'; window.scrollTo({top: 0});
    H.rpc('inv_vehiculo', {p_id: id}).then(function(f){
      var h = f.vehiculo, v = f.venta, sig = siguiente(h), et = etapa(h.etapa);
      var r = ruta(h.especial), iAhora = r.map(function(x){ return x.id }).indexOf(h.etapa);
      var estado = h.faltantes ? '<span class="etq rojo">Faltantes</span>' : h.etapa==='listo' ? '<span class="etq ok">Listo</span>' : '<span class="etq azul">'+esc(et.nombre)+'</span>';
      var html = '<button type="button" class="btn-link" data-ir-sec="produccion">‹ Producción</button>'+
        '<header class="inv-cab" style="display:flex;align-items:center;gap:14px;flex-wrap:wrap"><h1>Serie '+esc(h.serie)+'</h1>'+estado+'</header>'+
        '<p style="margin:-10px 0 18px;color:var(--muted)">'+puntoColor(h.color_id)+esc(nombreVeh(h))+' · '+
        (v ? 'Venta <button type="button" class="btn-link en-linea" data-ficha-venta="'+v.id+'">'+esc(v.remision)+'</button>'+(v.especial ? ' · Especial: '+esc(v.especial_que) : '') : 'Showroom')+
        (E.rol!=='bodega' ? ' · '+esc(H.nombreBodega(h.bodega)) : '')+'</p>';
      // Recorrido de etapas
      html += '<ol class="recorrido">'+r.map(function(x, i){
        var cl = i < iAhora || h.etapa==='listo' ? 'hecho' : i===iAhora ? (h.faltantes ? 'ahora falta' : 'ahora') : '';
        return '<li class="'+cl+'"><span class="nn">'+(cl==='hecho' ? '✓' : i+1)+'</span><span>'+esc(x.nombre)+'</span></li>';
      }).join('')+'</ol>';
      // Acción de la etapa
      if(H.puedeEscribir()){
        var acc = '';
        if(h.faltantes) acc = '<p style="margin:0 0 12px">La Revisión 1 encontró piezas que faltan. Cuando ya se pongan, márcalo para que siga a '+esc(sig ? sig.nombre : '')+'.</p>'+
          '<button type="button" class="btn prin" data-faltantes="'+h.id+'">✓ Ya se pusieron las piezas</button>';
        else if(h.etapa==='revision1') acc = '<button type="button" class="btn prin" data-revision1="'+h.id+'">Hacer la Revisión 1</button>';
        else if(h.etapa==='revision_final') acc = '<button type="button" class="btn prin" data-final="si" data-id="'+h.id+'">✓ Pasa la revisión final</button>'+
          '<button type="button" class="btn" data-final="no" data-id="'+h.id+'">No pasa</button>';
        else if(sig) acc = '<button type="button" class="btn prin" data-avanzar="'+h.id+'">Terminó '+esc(et.nombre.toLowerCase())+': pasar a '+esc(sig.nombre)+'</button>';
        else acc = '<p style="margin:0;color:var(--muted)">'+(v ? 'Listo para enviar. El flete y la entrega se agregan en la siguiente parte.' : 'Listo en showroom. Mandarlo a una sucursal se agrega más adelante.')+'</p>';
        html += '<div class="accion-etapa">'+acc+'</div>';
      }
      // Daños y faltantes
      var defs = f.defectos || [];
      if(defs.length){
        html += '<h2 class="inv-sub">Lo que encontró la Revisión 1</h2><div class="tarjetas">'+defs.map(function(d){
          var x = I.porId(E.cat.defectos, d.defecto_id);
          return '<div class="tarjeta"><span class="cant">'+d.cantidad+'</span><span class="txt"><b>'+esc(x ? x.nombre : '?')+'</b><small>'+esc(gravNom(d.gravedad))+'</small></span>'+
            (d.resuelto ? '<span class="etq ok">Ya se puso</span>' : '')+'</div>';
        }).join('')+'</div>';
      }
      var notas = (f.historial||[]).filter(function(x){ return x.accion==='no_paso' });
      if(notas.length){
        html += '<h2 class="inv-sub">No pasó la revisión final</h2><ul class="notas">'+notas.map(function(x){
          return '<li>'+esc(H.fechaLarga(String(x.fecha).slice(0, 10)))+': '+esc(x.nota)+'</li>' }).join('')+'</ul>';
      }
      m.innerHTML = html;
    }).catch(function(err){ errorEn(m, err) });
  }
  function gravNom(g){ return {leve: 'Leve', media: 'Media', grave: 'Grave'}[g] || g }

  function avanzar(id, p, despues){
    return H.rpc('inv_vehiculo_avanzar', {p_id: id, p: p || {}}).then(function(){ refrescarCuentas(); (despues || abrirFichaVeh)(id); })
      .catch(function(err){ aviso('No se pudo', H.mensaje(err)); });
  }

  // Revisión 1: "✓ Todo bien" o anotar faltantes y daños (tipo, gravedad, cantidad)
  function revision1(id, despues){
    var danos = [], enLista = false;
    new Promise(function(fin){
      function abrir(){
        H.abrirHoja(H.cabHoja('Revisión 1', 'Revisa si le falta alguna pieza o si alguna viene dañada')+'<div class="hoja-cuerpo">'+
          (danos.length ? '<div class="tarjetas">'+danos.map(function(d, k){
            var x = I.porId(E.cat.defectos, d.defecto_id);
            return '<div class="tarjeta" style="padding:10px 12px"><span class="cant">'+d.cantidad+'</span><span class="txt"><b>'+esc(x ? x.nombre : '?')+'</b><small>'+gravNom(d.gravedad)+'</small></span>'+
              '<span class="btns"><button type="button" class="btn" data-quitar="'+k+'">Quitar</button></span></div>';
          }).join('')+'</div>' : '<p style="margin:0 0 6px">Si todo está bien, da "✓ Todo bien". Si falta una pieza, agrega el daño "Faltante de pieza".</p>')+
          '<button type="button" class="btn" data-agregar style="margin-top:10px">+ Agregar faltante o daño</button>'+
          '<div class="acciones"><button type="button" class="btn" data-hoja-cerrar>Cancelar</button>'+
          (danos.length ? '<button type="button" class="btn prin der" data-listo>Guardar revisión</button>' : '<button type="button" class="btn prin der" data-listo>✓ Todo bien</button>')+
          '</div></div>', function(v){ if(!enLista) fin(v); });
        H.hojaEl().onclick = function(e){
          if(e.target.closest('[data-hoja-cerrar]')){ H.cerrarHoja(null); return; }
          if(e.target.closest('[data-listo]')){ H.cerrarHoja({defectos: danos}); return; }
          var qq = e.target.closest('[data-quitar]');
          if(qq){ danos.splice(+qq.dataset.quitar, 1); enLista = true; abrir(); enLista = false; return; }
          if(e.target.closest('[data-agregar]')){
            enLista = true;
            var d = {};
            H.abrirLista({titulo: '¿Qué encontraste?', grupos: [{opciones: (E.cat.defectos||[]).filter(function(x){ return x.activo!==false }).map(function(x){ return {valor: x.id, nombre: x.nombre} })}]})
              .then(function(t){ if(t==null) return null; d.defecto_id = t;
                return H.abrirLista({titulo: '¿Qué tan grave?', grupos: [{opciones: [{valor: 'leve', nombre: 'Leve'}, {valor: 'media', nombre: 'Media'}, {valor: 'grave', nombre: 'Grave'}]}]}); })
              .then(function(g){ if(g==null) return null; d.gravedad = g; return H.pedirCantidad({titulo: '¿Cuántas piezas?', valor: 1, boton: 'Agregar'}); })
              .then(function(n){ if(n!=null){ d.cantidad = n; danos.push(d); } enLista = false; abrir(); });
          }
        };
      }
      abrir();
    }).then(function(v){ if(v) avanzar(id, v, despues); });
  }

  function alClicGeneral(e){
    if(!E.raiz || !E.raiz.contains(e.target)) return;
    var m = main(), b;
    if(E.seccion==='venta' && V && m.contains(e.target) && e.target.closest('[data-nv]')){ alClicVenta(e, m); return; }
    if((b = e.target.closest('[data-ficha-venta]'))){ abrirFichaVenta(+b.dataset.fichaVenta); return; }
    if((b = e.target.closest('[data-ficha-veh]'))){ abrirFichaVeh(+b.dataset.fichaVeh); return; }
    if((b = e.target.closest('[data-entrar-venta]'))){ entrar(+b.dataset.entrarVenta); return; }
    if(e.target.closest('[data-entrar]')){ entrar(null, H.linea && q('.linea-caja', main()) ? H.linea.refrescar : null); return; }
    if((b = e.target.closest('[data-modo-prod]'))){ try { localStorage.setItem('logistica.prodModo', b.dataset.modoProd) } catch(er){} H.ir('produccion'); return; }
    if((b = e.target.closest('[data-avanzar]'))){ b.disabled = true; avanzar(+b.dataset.avanzar); return; }
    if((b = e.target.closest('[data-revision1]'))){ revision1(+b.dataset.revision1); return; }
    if((b = e.target.closest('[data-faltantes]'))){
      var id = +b.dataset.faltantes; b.disabled = true;
      H.rpc('inv_vehiculo_faltantes_listos', {p_id: id}).then(function(){ refrescarCuentas(); abrirFichaVeh(id); }).catch(function(err){ aviso('No se pudo', H.mensaje(err)); });
      return;
    }
    if((b = e.target.closest('[data-final]'))){
      var idf = +b.dataset.id;
      if(b.dataset.final==='si'){ b.disabled = true; avanzar(idf, {pasa: true}); }
      else H.pedirTexto({titulo: '¿Por qué no pasa?', ayuda: 'Se queda en revisión final hasta que se corrija', etiqueta: 'Qué hay que corregir', largo: true,
        boton: 'Guardar', falta: 'Escribe qué hay que corregir.'}).then(function(t){ if(t!=null) avanzar(idf, {pasa: false, nota: t}); });
      return;
    }
    if((b = e.target.closest('[data-corregir-venta]'))){
      var v = CACHE.venta; if(!v) return;
      V = {paso: 1, id: v.id, remisionOriginal: v.remision, bodega: v.bodega, remision: v.remision, fecha: v.fecha, vendedor: v.vendedor, destino: v.destino,
        tipo_destino: v.tipo_destino || '', modelo_id: v.modelo_id, opciones: v.opciones || [], color_id: v.color_id, especial: v.especial, especial_que: v.especial_que || '', error: ''};
      E.seccion = 'venta'; H.dibujarMenu(); dibujarVenta(main());
      return;
    }
    if((b = e.target.closest('[data-ir-sec="venta"]'))){ V = null; }
  }
  document.addEventListener('click', alClicGeneral);

  // Burbujas del menú: ventas por armar y vehículos con faltantes
  function refrescarCuentas(){
    if(!H.puedeEscribir()) return;
    Promise.all([H.rpc('inv_ventas', {p_bodega: E.verBodega}), H.rpc('inv_produccion', {p_bodega: E.verBodega})]).then(function(r){
      H.CUENTA.ventas = r[0].filter(function(v){ return v.estado_venta==='por_armar' }).length || '';
      H.CUENTA.produccion = r[1].filter(function(h){ return h.faltantes }).length || '';
      H.dibujarMenu();
    }).catch(function(){});
  }
  H.alIniciar.push(refrescarCuentas);
  H.prod = {ETAPAS: ETAPAS, etapa: etapa, siguiente: siguiente, nombreVeh: nombreVeh, colorHex: colorHex, dias: dias, aviso: aviso,
    entrar: entrar, avanzar: avanzar, revision1: revision1, abrirFichaVeh: abrirFichaVeh, refrescarCuentas: refrescarCuentas};
})();
