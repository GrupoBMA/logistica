/* Inventario: revisión de recepción de un contenedor, en 3 pasos (Vehículos · Piezas · Guardar).
   Lo que debería traer sale de la lista de piezas de cada modelo (inventario-logica.js). */
(function(){
  var H = window.InventarioApp._h, E = H.E, I = H.I, esc = H.esc, q = H.q;
  var R = null;   // la revisión en pantalla

  function gravedadNombre(g){ return {leve: 'Leve', media: 'Media', grave: 'Grave'}[g] || '' }
  // Un faltante de pieza no tiene grado (pedido del usuario, 21-nov-2026)
  function esFaltante(id){ var d = I.porId(E.cat.defectos, id); return !!(d && /^faltante/i.test(d.nombre)) }
  function opcionesDano(){ return (E.cat.defectos||[]).filter(function(x){ return x.activo!==false && x.nombre!=='Pieza dañada' }).map(function(x){ return {valor: x.id, nombre: x.nombre, ico: H.icoDano(x.nombre)} }) }
  function textoDano(x){ return x.cantidad+' · '+esc(nombreDefecto(x.defecto_id))+(x.gravedad ? ' ('+gravedadNombre(x.gravedad)+')' : '') }
  function nombreDefecto(id){ var d = I.porId(E.cat.defectos, id); return d ? d.nombre : '?' }
  function nombrePieza(p){ return p.nombre + (p.color ? ' · ' + p.color : '') }
  function claveP(p){ return p.pieza_id + '|' + (p.color_id==null ? '' : p.color_id) }

  function abrirRevision(id){
    E.seccion = 'contenedores'; H.dibujarMenu();
    var main = q('.inv-main', E.raiz);
    main.innerHTML = '<p class="inv-cargando">Cargando…</p>';
    window.scrollTo({top: 0});
    Promise.all([H.rpc('inv_contenedor', {p_id: id}), H.cargarCatalogo()]).then(function(res){
      var f = res[0], c = f.contenedor;
      R = {id: id, c: c, renglones: f.renglones,
        conteos: f.renglones.map(function(r){ return c.estado==='revisado' && r.conteo && r.conteo.length ? r.conteo.map(function(x){ return {color_id: x.color_id, contados: x.contados} }) : null }),
        piezas: [], sinLista: I.sinListaDePiezas(f.renglones, E.cat),
        defectos: (f.defectos||[]).filter(function(d){ return d.pieza_id!=null }).map(function(d){ return {pieza_id: d.pieza_id, color_id: d.color_id, defecto_id: d.defecto_id, gravedad: d.gravedad, cantidad: d.cantidad} }),
        // Daños del contenedor en general (sin pieza), mientras no haya lista de piezas
        danos: (f.defectos||[]).filter(function(d){ return d.pieza_id==null }).map(function(d){ return {defecto_id: d.defecto_id, gravedad: d.gravedad, cantidad: d.cantidad} }),
        sinDanos: c.estado==='revisado',
        editando: c.estado==='revisado', soloVer: !H.puedeEscribir() || c.estado==='anulado',
        paso: (!H.puedeEscribir() || c.estado!=='recibido') ? 3 : 1, error: ''};
      calcularPiezas(f.piezas);
      dibujar();
    }).catch(function(err){ main.innerHTML = '<p class="inv-error">'+esc(H.mensaje(err))+'</p>' });
  }
  H.abrirRevision = abrirRevision;

  function contados(i){ return R.conteos[i] ? I.sumaConteo(R.conteos[i]) : null }

  // Piezas que deberían venir, con lo contado de cada color. Conserva lo que ya se había revisado
  // ("previas": lo guardado en Supabase o lo capturado antes en pantalla).
  function calcularPiezas(previas){
    var antes = {};
    (previas || R.piezas.filter(function(p){ return p.revisada })).forEach(function(p){ antes[claveP(p)] = p });
    var renglones = R.renglones.map(function(r, i){ return Object.assign({}, r, {conteo: R.conteos[i] || []}) });
    R.piezas = I.piezasEsperadas(renglones, E.cat).map(function(p){
      var g = antes[claveP(p)];
      return {pieza_id: p.pieza_id, color_id: p.color_id, nombre: p.nombre, color: p.color, esperadas: p.esperadas,
        llegaron: g ? g.llegaron : null, danadas: g ? g.danadas : 0, revisada: !!g};
    });
  }

  // Caja para contar cuántos llegaron de cada color, con − / + y el total contra la hoja.
  // Se puede agregar un color que no venía en la hoja. -> Promise([{color_id, contados}]|null)
  function contarColores(i){
    var r = R.renglones[i];
    var st = R.conteos[i] ? R.conteos[i].map(function(x){ return Object.assign({}, x) })
      : (r.colores||[]).map(function(c){ return {color_id: c, contados: (r.colores.length===1 ? r.cantidad : 0)} });
    var enLista = false;
    function nombreColor(id){ var c = I.porId(E.cat.colores, id); return c ? c.nombre : '?' }
    return new Promise(function(fin){
      function leer(){
        var h = H.hojaEl();
        st.forEach(function(x){ var c = q('[data-contador="c'+x.color_id+'"]', h); if(c) x.contados = H.valorContador(c); });
      }
      function total(){ return st.reduce(function(s, x){ return s + x.contados }, 0) }
      function textoTotal(){
        var t = total(), d = I.diferencia(r.cantidad, t);
        return 'Llevas <b>'+t+'</b> de '+r.cantidad+(d.faltan ? ' · faltan '+d.faltan : d.sobran ? ' · sobran '+d.sobran : ' · ✓ coincide');
      }
      function abrir(){
        var libres = (E.cat.colores||[]).filter(function(c){ return c.activo!==false && !st.some(function(x){ return x.color_id===c.id }) });
        H.abrirHoja(H.cabHoja('¿Cuántos de cada color?', I.nombreModelo(r, E.cat)+' · la hoja dice '+r.cantidad)+'<form class="hoja-cuerpo" novalidate>'+
          st.map(function(x){
            var hx = H.hexColor(nombreColor(x.color_id));
            var fuera = (r.colores||[]).indexOf(x.color_id) < 0;
            return '<div class="campo cuenta-color"><span>'+(hx ? '<span class="pt-col" style="background:'+hx+'"></span>' : '')+esc(nombreColor(x.color_id))+
              (fuera ? ' <small>(no venía en la hoja)</small>' : '')+'</span>'+H.contador('c'+x.color_id, x.contados, 0)+'</div>';
          }).join('')+
          (libres.length ? '<button type="button" class="btn-link" data-otro-color>+ Llegó otro color</button>' : '')+
          '<p class="cuenta-total" aria-live="polite">'+textoTotal()+'</p>'+
          '<div class="acciones"><button type="button" class="btn" data-hoja-cerrar>Cancelar</button><button type="submit" class="btn prin der">Listo</button></div></form>',
          function(v){ if(!enLista) fin(v); });
        var h = H.hojaEl(), f = q('form', h);
        f.oninput = function(){ leer(); q('.cuenta-total', f).innerHTML = textoTotal(); };
        f.onsubmit = function(e){ e.preventDefault(); leer(); H.cerrarHoja(st); };
        h.onclick = function(e){
          if(e.target.closest('[data-hoja-cerrar]')){ H.cerrarHoja(null); return; }
          if(e.target.closest('[data-otro-color]')){
            leer(); enLista = true;
            H.abrirLista({titulo: '¿Qué color llegó?', grupos: [{opciones: libres.map(function(c){ return {valor: c.id, nombre: c.nombre, color: H.hexColor(c.nombre)} })}]})
              .then(function(c){ if(c!=null) st.push({color_id: c, contados: 1}); enLista = false; abrir(); });
          }
        };
      }
      abrir();
    }).then(function(v){
      if(!v) return null;
      // Un color que no venía en la hoja y quedó en 0 no se guarda
      R.conteos[i] = v.filter(function(x){ return x.contados > 0 || (r.colores||[]).indexOf(x.color_id) > -1 });
      return v;
    });
  }

  function dibujar(){
    var main = q('.inv-main', E.raiz);
    var titulos = ['Vehículos', R.piezas.length ? 'Piezas' : 'Daños', R.soloVer ? 'Resumen' : 'Guardar'];
    var html = '<button type="button" class="btn-link" data-ir-ficha="'+R.id+'">‹ Contenedor '+esc(R.c.numero)+'</button>'+
      '<header class="inv-cab"><h1>Revisión del contenedor '+esc(R.c.numero)+'</h1><p>'+
      (R.soloVer ? 'Lo que se encontró al revisarlo.' : 'Cuenta lo que llegó y compáralo con lo que dice la hoja.')+'</p></header>';
    if(!R.soloVer){
      html += '<ol class="pasos">'+titulos.map(function(t, i){
        var n = i+1, cl = n < R.paso ? 'hecho' : (n===R.paso ? 'ahora' : '');
        return '<li class="'+cl+'"><span class="nn">'+(n < R.paso ? '✓' : n)+'</span><span class="tx">'+t+'</span></li>';
      }).join('')+'</ol>';
    }
    if(R.error) html += '<p class="inv-error">'+esc(R.error)+'</p>';
    if(R.paso===1) html += pasoVehiculos();
    else if(R.paso===2) html += R.piezas.length ? pasoPiezas() : pasoDanos();
    else html += pasoResumen();
    main.innerHTML = html;
  }

  // ---------------------------------------------------------------- 1. Vehículos
  // Un solo color en la hoja: "✓ Coincide" o "No coincide". Varios colores: "Contar por color".
  function unColor(r){ return (r.colores||[]).length===1 }
  function pasoVehiculos(){
    var faltan = R.conteos.filter(function(x){ return x==null }).length;
    var rapidos = R.renglones.filter(function(r, i){ return R.conteos[i]==null && unColor(r) }).length;
    var html = '<p style="margin:0 0 14px">'+(faltan ? 'Cuenta los vehículos de cada tipo. Si traen varios colores, cuenta cuántos llegaron de cada uno.' : 'Ya contaste todos los vehículos.')+'</p>';
    if(rapidos > 1 && rapidos===faltan) html += '<div class="acciones" style="margin:0 0 14px"><button type="button" class="btn" data-v="todos">✓ Todos coinciden</button></div>';
    html += '<div class="tarjetas">'+R.renglones.map(function(r, i){
      var cs = R.conteos[i], c = contados(i), estado, abajo;
      if(cs==null){
        estado = unColor(r)
          ? '<span class="btns"><button type="button" class="btn prin" data-v="si" data-i="'+i+'">✓ Coincide</button>'+
            '<button type="button" class="btn" data-v="no" data-i="'+i+'">No coincide</button></span>'
          : '<span class="btns"><button type="button" class="btn prin" data-v="no" data-i="'+i+'">Contar por color</button></span>';
        abajo = '<small>'+H.coloresHTML(r.colores)+'</small>';
      } else {
        var d = I.diferencia(r.cantidad, c);
        estado = (d.faltan ? '<span class="etq rojo">Faltan '+d.faltan+'</span>' : d.sobran ? '<span class="etq rojo">Sobran '+d.sobran+'</span>' : '<span class="etq ok">✓ Coincide</span>')+
          '<span class="btns"><button type="button" class="btn" data-v="no" data-i="'+i+'">Cambiar</button></span>';
        abajo = '<small>'+H.coloresHTML(cs.map(function(x){ return x.color_id }), cs)+'</small>'+
          (c!==r.cantidad ? '<small>Se contaron '+c+'</small>' : '');
      }
      return '<div class="tarjeta"><span class="cant">'+r.cantidad+'</span><span class="txt"><b>'+esc(I.nombreModelo(r, E.cat))+'</b>'+abajo+'</span>'+estado+'</div>';
    }).join('')+'</div>'+
      '<div class="acciones"><button type="button" class="btn" data-ir-ficha="'+R.id+'">Cancelar</button>'+
      '<button type="button" class="btn prin der" data-v="sig">Siguiente</button></div>';
    return html;
  }

  // ---------------------------------------------------------------- 2. Daños del contenedor
  // Mientras no hay lista de piezas, los daños se anotan por contenedor: tipo, gravedad y cuántos.
  var GRAVEDADES = ['leve', 'media', 'grave'];
  function totalDanos(){ return R.danos.reduce(function(s, d){ return s + d.cantidad }, 0) }
  function textoDanos(){
    var t = totalDanos(); if(!t) return 'Sin daños';
    var por = GRAVEDADES.map(function(g){
      var n = R.danos.filter(function(d){ return d.gravedad===g }).reduce(function(s, d){ return s + d.cantidad }, 0);
      return n ? n+' '+gravedadNombre(g).toLowerCase()+(n===1 ? '' : 's') : '' }).filter(Boolean);
    return t+(t===1 ? ' daño' : ' daños')+' ('+por.join(', ')+')';
  }
  function pasoDanos(){
    var html = '';
    if(R.sinLista.length){
      html += '<p style="margin:0 0 14px;color:var(--muted)">Las piezas se revisarán una por una cuando esté la lista de piezas. Por ahora anota los daños de todo el contenedor.</p>';
    }
    var t = totalDanos();
    html += '<p style="margin:0 0 14px">'+(t ? '<b>'+esc(textoDanos())+'</b> en este contenedor.' : '¿Llegó algo dañado en este contenedor?')+'</p>';
    if(R.danos.length){
      html += '<div class="tarjetas">'+R.danos.map(function(d, k){
        return '<div class="tarjeta"><span class="cant">'+d.cantidad+'</span><span class="txt"><b>'+esc(nombreDefecto(d.defecto_id))+'</b></span>'+
          (d.gravedad ? '<span class="etq '+(d.gravedad==='leve' ? 'pend' : 'rojo')+'">'+gravedadNombre(d.gravedad)+'</span>' : '')+
          '<span class="btns"><button type="button" class="btn" data-d="cambiar" data-i="'+k+'">Cambiar</button>'+
          '<button type="button" class="btn" data-d="quitar" data-i="'+k+'">Quitar</button></span></div>';
      }).join('')+'</div>';
    } else if(R.sinDanos){
      html += '<div class="tarjetas"><div class="tarjeta"><span class="txt"><b>✓ No llegó nada dañado</b></span>'+
        '<span class="btns"><button type="button" class="btn" data-d="hay">Cambiar</button></span></div></div>';
    }
    html += '<div class="acciones" style="margin-top:14px">'+
      (!R.danos.length && !R.sinDanos ? '<button type="button" class="btn prin" data-d="ninguno">✓ No hay daños</button>' : '')+
      '<button type="button" class="btn" data-d="agregar">+ Agregar daño</button></div>'+
      '<div class="acciones"><button type="button" class="btn" data-v="atras">Atrás</button>'+
      '<button type="button" class="btn prin der" data-v="sig">Siguiente</button></div>';
    return html;
  }
  // Pide tipo, gravedad y cuántos. previo: para cambiar uno. -> Promise({defecto_id, gravedad, cantidad}|null)
  function pedirDano(previo){
    var d = {};
    return H.abrirLista({titulo: 'Tipo de daño', grupos: [{opciones: opcionesDano()}], elegido: previo ? previo.defecto_id : null})
      .then(function(t){
        if(t==null) return null; d.defecto_id = t;
        if(esFaltante(t)) return '';
        return H.abrirLista({titulo: '¿Qué tan grave?', grupos: [{opciones: [{valor: 'leve', nombre: 'Leve'}, {valor: 'media', nombre: 'Media'}, {valor: 'grave', nombre: 'Grave'}]}],
          elegido: previo ? previo.gravedad : null});
      }).then(function(g){
        if(g==null) return null; d.gravedad = g || null;
        return H.pedirCantidad({titulo: '¿Cuántos con este daño?', ayuda: nombreDefecto(d.defecto_id)+(g ? ' · '+gravedadNombre(g) : ''), valor: previo ? previo.cantidad : 1, boton: previo ? 'Listo' : 'Agregar'});
      }).then(function(n){ if(n==null) return null; d.cantidad = n; return d; });
  }
  // Si ya hay uno del mismo tipo y gravedad, se suman
  function meterDano(d){
    var x = R.danos.filter(function(y){ return y.defecto_id===d.defecto_id && y.gravedad===d.gravedad })[0];
    if(x) x.cantidad += d.cantidad; else R.danos.push(d);
    R.sinDanos = false;
  }

  // ---------------------------------------------------------------- 2. Piezas
  function pasoPiezas(){
    var s = I.resumenRevision(R.piezas), html = '';
    if(R.sinLista.length){
      html += '<div class="inv-vacio" style="text-align:left;margin-bottom:16px"><b>'+esc(R.sinLista.join(', '))+(R.sinLista.length===1 ? ' todavía no tiene' : ' todavía no tienen')+' su lista de piezas</b>'+
        'Puedes guardar el conteo de vehículos. Las piezas '+(R.sinLista.length===1 ? 'de ese modelo' : 'de esos modelos')+' se revisan cuando el administrador cargue la lista.</div>';
    }
    if(!R.piezas.length){
      html += '<div class="acciones"><button type="button" class="btn" data-v="atras">Atrás</button><button type="button" class="btn prin der" data-v="sig">Siguiente</button></div>';
      return html;
    }
    html += '<p style="margin:0 0 14px">'+(s.pendientes ? 'Faltan <b>'+s.pendientes+' de '+s.total+'</b> piezas por revisar.' : 'Ya revisaste todas las piezas.')+'</p>';
    if(s.pendientes > 1) html += '<div class="acciones" style="margin:0 0 14px"><button type="button" class="btn" data-v="todas">✓ Todas las que faltan coinciden</button></div>';
    html += '<div class="tarjetas">'+R.piezas.map(function(p, i){
      var estado, detalle = '<small>Deben venir '+p.esperadas+'</small>';
      if(!p.revisada){
        estado = '<span class="btns"><button type="button" class="btn prin" data-p="si" data-i="'+i+'">✓ Coincide</button>'+
          '<button type="button" class="btn" data-p="no" data-i="'+i+'">No coincide</button></span>';
      } else {
        var d = I.diferencia(p.esperadas, p.llegaron), etq = [];
        if(d.faltan) etq.push('<span class="etq rojo">Faltan '+d.faltan+'</span>');
        if(d.sobran) etq.push('<span class="etq pend">Sobran '+d.sobran+'</span>');
        if(p.danadas) etq.push('<span class="etq rojo">'+p.danadas+(p.danadas===1 ? ' dañada' : ' dañadas')+'</span>');
        if(!etq.length) etq.push('<span class="etq ok">✓ Coincide</span>');
        detalle = '<small>Llegaron '+p.llegaron+' de '+p.esperadas+'</small>';
        estado = etq.join(' ')+'<span class="btns"><button type="button" class="btn" data-p="no" data-i="'+i+'">Cambiar</button></span>';
      }
      return '<div class="tarjeta"><span class="cant">'+p.esperadas+'</span><span class="ico-p">'+H.icoPieza(p.nombre)+'</span><span class="txt"><b>'+esc(nombrePieza(p))+'</b>'+detalle+'</span>'+estado+'</div>';
    }).join('')+'</div>'+
      '<div class="acciones"><button type="button" class="btn" data-v="atras">Atrás</button>'+
      '<button type="button" class="btn prin der" data-v="sig">Siguiente</button></div>';
    return html;
  }

  // Caja para una pieza que no coincide: Llegaron y Dañadas con − / +.
  // Sin tipo de daño ni gravedad: ya se sabe qué pieza es (pedido del usuario, 24-nov-2026).
  // Las dañadas se guardan como "Pieza dañada" para que salgan en Piezas › Dañadas.
  function idPiezaDanada(){ var d = (E.cat.defectos||[]).filter(function(x){ return x.nombre==='Pieza dañada' })[0]; return d ? d.id : null }
  function corregirPieza(i){
    var base = R.piezas[i];
    var st = {llegaron: base.llegaron==null ? base.esperadas : base.llegaron, danadas: base.danadas || 0};
    return new Promise(function(fin){
      H.abrirHoja(H.cabHoja(nombrePieza(base), 'Corrige lo que no coincide')+'<form class="hoja-cuerpo" novalidate>'+
        '<div class="campo"><span>¿Cuántas llegaron?</span><small>Deben venir '+base.esperadas+'</small>'+H.contador('llegaron', st.llegaron, 0)+'</div>'+
        '<div class="campo"><span>¿Cuántas vienen dañadas?</span>'+H.contador('danadas', st.danadas, 0)+'</div>'+
        '<p class="inv-error" hidden></p>'+
        '<div class="acciones"><button type="button" class="btn" data-hoja-cerrar>Cancelar</button><button type="submit" class="btn prin der">Listo</button></div></form>', fin);
      var h = H.hojaEl(), f = q('form', h);
      f.onsubmit = function(e){
        e.preventDefault();
        st.llegaron = H.valorContador(q('[data-contador="llegaron"]', f)); st.danadas = H.valorContador(q('[data-contador="danadas"]', f));
        var errs = I.validarPieza({esperadas: base.esperadas, llegaron: st.llegaron, danadas: st.danadas});
        if(errs.length){ var er = q('.inv-error', f); er.textContent = errs[0]; er.hidden = false; return; }
        H.cerrarHoja(st);
      };
      h.onclick = function(e){ if(e.target.closest('[data-hoja-cerrar]')) H.cerrarHoja(null); };
    }).then(function(v){
      if(!v) return null;
      var tipo = idPiezaDanada();
      v.danos = v.danadas > 0 && tipo ? [{pieza_id: base.pieza_id, color_id: base.color_id, defecto_id: tipo, gravedad: null, cantidad: v.danadas}] : [];
      R.defectos = R.defectos.filter(function(x){ return !(x.pieza_id===base.pieza_id && (x.color_id||null)===(base.color_id||null)) }).concat(v.danos);
      R.piezas[i] = Object.assign({}, R.piezas[i], {llegaron: v.llegaron, danadas: v.danadas, revisada: true});
      return v;
    });
  }

  // ---------------------------------------------------------------- 3. Resumen y guardar
  function pasoResumen(){
    var s = I.resumenRevision(R.piezas);
    var vDif = R.renglones.map(function(r, i){ return {r: r, c: contados(i)} }).filter(function(x){ return x.c!=null && x.c!==x.r.cantidad });
    var html = '<div class="resumen">';
    html += vDif.length
      ? '<p style="margin:0 0 8px"><b>Vehículos que no coinciden:</b></p><ul style="margin:0 0 12px;padding-left:22px">'+vDif.map(function(x){
          return '<li>'+esc(I.nombreModelo(x.r, E.cat))+': la hoja dice '+x.r.cantidad+', se contaron '+x.c+'</li>' }).join('')+'</ul>'
      : '<p style="margin:0 0 12px">✓ Los vehículos coinciden con la hoja.</p>';
    html += '<p style="margin:0 0 8px"><b>Por color:</b></p><ul style="margin:0 0 12px;padding-left:22px;list-style:none">'+R.renglones.map(function(r, i){
      var cs = R.conteos[i] || [];
      return '<li style="margin-bottom:4px">'+esc(I.nombreModelo(r, E.cat))+'<br>'+H.coloresHTML(cs.map(function(x){ return x.color_id }), cs)+'</li>';
    }).join('')+'</ul>';
    if(!R.piezas.length){
      html += '<p style="margin:0 0 8px"><b>Daños:</b> '+esc(textoDanos())+'</p>'+
        (R.danos.length ? '<ul style="margin:0 0 12px;padding-left:22px">'+R.danos.map(function(d){
          return '<li>'+textoDano(d)+'</li>' }).join('')+'</ul>' : '');
    }
    if(R.piezas.length){
      var faltan = R.piezas.filter(function(p){ return p.revisada && p.llegaron < p.esperadas });
      var sobran = R.piezas.filter(function(p){ return p.revisada && p.llegaron > p.esperadas });
      var danadas = R.piezas.filter(function(p){ return p.revisada && p.danadas });
      if(!faltan.length && !sobran.length && !danadas.length) html += '<p style="margin:0">✓ Las piezas coinciden y ninguna viene dañada.</p>';
      if(faltan.length) html += '<p style="margin:0 0 4px"><b>Faltan:</b> '+faltan.map(function(p){ return (p.esperadas-p.llegaron)+' '+esc(nombrePieza(p)) }).join(', ')+'</p>';
      if(sobran.length) html += '<p style="margin:0 0 4px"><b>Sobran:</b> '+sobran.map(function(p){ return (p.llegaron-p.esperadas)+' '+esc(nombrePieza(p)) }).join(', ')+'</p>';
      if(danadas.length) html += '<p style="margin:0"><b>Dañadas:</b> '+danadas.map(function(p){ return p.danadas+' '+esc(nombrePieza(p)) }).join(', ')+'</p>';
    } else if(R.sinLista.length){
      html += '<p style="margin:0;color:var(--muted)">Las piezas se revisan cuando esté la lista de piezas de '+esc(R.sinLista.join(', '))+'.</p>';
    }
    html += '</div>';
    if(R.soloVer){
      html += '<div class="acciones"><button type="button" class="btn" data-ir-ficha="'+R.id+'">Volver al contenedor</button>'+
        (H.puedeEscribir() && R.c.estado==='revisado' ? '<button type="button" class="btn der" data-v="corregir">Corregir la revisión</button>' : '')+'</div>';
    } else {
      html += '<div class="acciones"><button type="button" class="btn" data-v="atras">Atrás</button>'+
        '<button type="button" class="btn prin der" data-v="guardar">'+(R.editando ? 'Guardar cambios' : 'Guardar revisión')+'</button></div>';
    }
    return html;
  }

  function guardar(){
    var m = R.editando ? H.pedirTexto({titulo: '¿Por qué corriges la revisión?', ayuda: 'Queda guardado junto con el cambio', etiqueta: 'Motivo', largo: true,
      boton: 'Guardar cambios', falta: 'Escribe el motivo del cambio.'}) : Promise.resolve(null);
    m.then(function(motivo){
      if(R.editando && motivo==null) return;
      var b = q('[data-v="guardar"]', E.raiz); if(b){ b.disabled = true; b.textContent = 'Guardando…'; }
      H.rpc('inv_revision_guardar', {p_id: R.id, p: {
        contados: R.renglones.map(function(r, i){ return {renglon_id: r.id, colores: R.conteos[i]} }),
        piezas: R.piezas.filter(function(p){ return p.revisada }).map(function(p){ return {pieza_id: p.pieza_id, color_id: p.color_id, esperadas: p.esperadas, llegaron: p.llegaron, danadas: p.danadas||0} }),
        defectos: R.defectos.concat(R.danos.map(function(d){ return {pieza_id: null, color_id: null, defecto_id: d.defecto_id, gravedad: d.gravedad, cantidad: d.cantidad} }))
      }, p_motivo: motivo}).then(function(){
        // Sin pantalla de "Listo" (pedido del usuario): un letrero y el punto naranja en Inventario
        if(H.actualizarCuenta) H.actualizarCuenta();
        var num = R.c.numero, id = R.id;
        H.avisar('Revisión del contenedor '+num+' guardada. Sus vehículos y piezas ya están en el inventario.');
        H.marcarNuevo('vehiculos'); H.marcarNuevo('piezas');
        R = null; H.abrirFicha(id);
      }).catch(function(err){ R.error = H.mensaje(err); dibujar(); });
    });
  }

  document.addEventListener('click', function(e){
    if(!R || !E.raiz || !E.raiz.contains(e.target)) return;
    var b = e.target.closest('[data-v],[data-p],[data-d]'); if(!b) return;
    var i = +b.dataset.i; R.error = '';
    if(b.dataset.d){
      var dd = b.dataset.d;
      if(dd==='ninguno'){ R.danos = []; R.sinDanos = true; dibujar(); }
      else if(dd==='hay'){ R.sinDanos = false; dibujar(); }
      else if(dd==='quitar'){ R.danos.splice(i, 1); dibujar(); }
      else if(dd==='agregar') pedirDano().then(function(d){ if(d) meterDano(d); dibujar(); });
      else if(dd==='cambiar') pedirDano(R.danos[i]).then(function(d){ if(d){ R.danos.splice(i, 1); meterDano(d); } dibujar(); });
      return;
    }
    if(b.dataset.p){
      if(b.dataset.p==='si'){ var p = R.piezas[i]; R.piezas[i] = Object.assign({}, p, {llegaron: p.esperadas, danadas: 0, revisada: true});
        R.defectos = R.defectos.filter(function(x){ return !(x.pieza_id===p.pieza_id && (x.color_id||null)===(p.color_id||null)) }); dibujar(); }
      else corregirPieza(i).then(function(){ dibujar() });
      return;
    }
    var a = b.dataset.v;
    if(a==='si'){ var r1 = R.renglones[i]; R.conteos[i] = [{color_id: r1.colores[0], contados: r1.cantidad}]; dibujar(); }
    else if(a==='no'){ contarColores(i).then(function(){ dibujar() }); }
    else if(a==='todos'){
      R.conteos = R.conteos.map(function(c, k){ var rk = R.renglones[k]; return c==null && unColor(rk) ? [{color_id: rk.colores[0], contados: rk.cantidad}] : c });
      dibujar();
    }
    else if(a==='todas'){ R.piezas = R.piezas.map(function(p){ return p.revisada ? p : Object.assign({}, p, {llegaron: p.esperadas, danadas: 0, revisada: true}) }); dibujar(); }
    else if(a==='atras'){ R.paso = Math.max(1, R.paso-1); dibujar(); }
    else if(a==='sig'){
      if(R.paso===1 && R.conteos.some(function(c){ return c==null })){ R.error = 'Falta contar algunos vehículos.'; }
      else if(R.paso===2 && R.piezas.some(function(p){ return !p.revisada })){ R.error = 'Falta revisar algunas piezas.'; }
      else if(R.paso===2 && !R.piezas.length && !R.danos.length && !R.sinDanos){ R.error = 'Agrega los daños o marca "No hay daños".'; }
      else { if(R.paso===1) calcularPiezas(); R.paso++; }
      dibujar(); window.scrollTo({top: 0});
    }
    else if(a==='guardar') guardar();
    else if(a==='corregir'){ R.soloVer = false; R.paso = 1; dibujar(); }
  });
})();
