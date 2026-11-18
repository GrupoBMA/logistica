/* Inventario: revisión de recepción de un contenedor, en 3 pasos (Vehículos · Piezas · Guardar).
   Lo que debería traer sale de la lista de piezas de cada modelo (inventario-logica.js). */
(function(){
  var H = window.InventarioApp._h, E = H.E, I = H.I, esc = H.esc, q = H.q;
  var R = null;   // la revisión en pantalla

  function gravedadNombre(g){ return {leve: 'Leve', media: 'Media', grave: 'Grave'}[g] || g }
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
      var guardadas = {};
      (f.piezas||[]).forEach(function(p){ guardadas[claveP(p)] = p });
      var esperadas = I.piezasEsperadas(f.renglones, E.cat).map(function(p){
        var g = guardadas[claveP(p)];
        return {pieza_id: p.pieza_id, color_id: p.color_id, nombre: p.nombre, color: p.color, esperadas: p.esperadas,
          llegaron: g ? g.llegaron : null, danadas: g ? g.danadas : 0, revisada: !!g};
      });
      R = {id: id, c: c, renglones: f.renglones,
        contados: f.renglones.map(function(r){ return c.estado==='revisado' ? r.contados : null }),
        piezas: esperadas, sinLista: I.sinListaDePiezas(f.renglones, E.cat),
        defectos: (f.defectos||[]).map(function(d){ return {pieza_id: d.pieza_id, color_id: d.color_id, defecto_id: d.defecto_id, gravedad: d.gravedad, cantidad: d.cantidad} }),
        editando: c.estado==='revisado', soloVer: !H.puedeEscribir() || c.estado==='anulado',
        paso: (!H.puedeEscribir() || c.estado!=='recibido') ? 3 : 1, error: ''};
      dibujar();
    }).catch(function(err){ main.innerHTML = '<p class="inv-error">'+esc(H.mensaje(err))+'</p>' });
  }
  H.abrirRevision = abrirRevision;

  function dibujar(){
    var main = q('.inv-main', E.raiz);
    var titulos = ['Vehículos', 'Piezas', R.soloVer ? 'Resumen' : 'Guardar'];
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
    else if(R.paso===2) html += pasoPiezas();
    else html += pasoResumen();
    main.innerHTML = html;
  }

  // ---------------------------------------------------------------- 1. Vehículos
  function pasoVehiculos(){
    var faltan = R.contados.filter(function(x){ return x==null }).length;
    var html = '<p style="margin:0 0 14px">'+(faltan ? 'Cuenta los vehículos de cada tipo. Si coinciden con la hoja, pica <b>✓ Coincide</b>.' : 'Ya contaste todos los vehículos.')+'</p>';
    if(faltan > 1) html += '<div class="acciones" style="margin:0 0 14px"><button type="button" class="btn" data-v="todos">✓ Todos coinciden</button></div>';
    html += '<div class="tarjetas">'+R.renglones.map(function(r, i){
      var c = R.contados[i], estado;
      if(c==null){
        estado = '<span class="btns"><button type="button" class="btn prin" data-v="si" data-i="'+i+'">✓ Coincide</button>'+
          '<button type="button" class="btn" data-v="no" data-i="'+i+'">No coincide</button></span>';
      } else {
        var d = I.diferencia(r.cantidad, c);
        estado = (d.faltan ? '<span class="etq rojo">Faltan '+d.faltan+'</span>' : d.sobran ? '<span class="etq rojo">Sobran '+d.sobran+'</span>' : '<span class="etq ok">✓ Coincide</span>')+
          '<span class="btns"><button type="button" class="btn" data-v="no" data-i="'+i+'">Cambiar</button></span>';
      }
      return '<div class="tarjeta"><span class="cant">'+r.cantidad+'</span><span class="txt"><b>'+esc(I.nombreVehiculo(r, E.cat))+'</b>'+
        (c!=null && c!==r.cantidad ? '<small>Se contaron '+c+'</small>' : '<small>Según la hoja</small>')+'</span>'+estado+'</div>';
    }).join('')+'</div>'+
      '<div class="acciones"><button type="button" class="btn" data-ir-ficha="'+R.id+'">Cancelar</button>'+
      '<button type="button" class="btn prin der" data-v="sig">Siguiente</button></div>';
    return html;
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
        var danos = R.defectos.filter(function(x){ return x.pieza_id===p.pieza_id && (x.color_id||null)===(p.color_id||null) });
        detalle = '<small>Llegaron '+p.llegaron+' de '+p.esperadas+'</small>'+
          (danos.length ? '<small>'+danos.map(function(x){ return x.cantidad+' · '+esc(nombreDefecto(x.defecto_id))+' ('+gravedadNombre(x.gravedad)+')' }).join('<br>')+'</small>' : '');
        estado = etq.join(' ')+'<span class="btns"><button type="button" class="btn" data-p="no" data-i="'+i+'">Cambiar</button></span>';
      }
      return '<div class="tarjeta"><span class="cant">'+p.esperadas+'</span><span class="txt"><b>'+esc(nombrePieza(p))+'</b>'+detalle+'</span>'+estado+'</div>';
    }).join('')+'</div>'+
      '<div class="acciones"><button type="button" class="btn" data-v="atras">Atrás</button>'+
      '<button type="button" class="btn prin der" data-v="sig">Siguiente</button></div>';
    return html;
  }

  // Caja para una pieza que no coincide: Llegaron y Dañadas con − / +, y los daños.
  // Para agregar un daño se abren las listas (tipo, gravedad, cantidad) y luego se vuelve a esta caja con lo capturado.
  function corregirPieza(i){
    var base = R.piezas[i];
    var st = {llegaron: base.llegaron==null ? base.esperadas : base.llegaron, danadas: base.danadas || 0,
      danos: R.defectos.filter(function(x){ return x.pieza_id===base.pieza_id && (x.color_id||null)===(base.color_id||null) }).map(function(x){ return Object.assign({}, x) })};
    var enLista = false;
    return new Promise(function(fin){
      function leer(){
        var f = q('.hoja form', document); if(!f) return;
        st.llegaron = H.valorContador(q('[data-contador="llegaron"]', f)); st.danadas = H.valorContador(q('[data-contador="danadas"]', f));
      }
      function abrir(){
        H.abrirHoja(H.cabHoja(nombrePieza(base), 'Corrige lo que no coincide')+'<form class="hoja-cuerpo" novalidate>'+
          '<div class="campo"><span>¿Cuántas llegaron?</span><small>Deben venir '+base.esperadas+'</small>'+H.contador('llegaron', st.llegaron, 0)+'</div>'+
          '<div class="campo"><span>¿Cuántas vienen dañadas?</span>'+H.contador('danadas', st.danadas, 0)+'</div>'+
          '<div class="campo" style="max-width:none"><span>Daños</span>'+
          (st.danos.length ? st.danos.map(function(x, k){ return '<div class="tarjeta" style="padding:10px 12px"><span class="txt"><b>'+x.cantidad+' · '+esc(nombreDefecto(x.defecto_id))+'</b><small>'+gravedadNombre(x.gravedad)+'</small></span>'+
            '<span class="btns"><button type="button" class="btn" data-quitar-dano="'+k+'">Quitar</button></span></div>' }).join('') : '<small>Si hay dañadas, agrega qué tienen.</small>')+
          '<button type="button" class="btn" data-agregar-dano style="margin-top:6px">+ Agregar daño</button></div>'+
          '<p class="inv-error" hidden></p>'+
          '<div class="acciones"><button type="button" class="btn" data-hoja-cerrar>Cancelar</button><button type="submit" class="btn prin der">Listo</button></div></form>',
          function(v){ if(!enLista) fin(v); });
        var h = H.hojaEl(), f = q('form', h);
        f.onsubmit = function(e){
          e.preventDefault(); leer();
          var errs = I.validarPieza({esperadas: base.esperadas, llegaron: st.llegaron, danadas: st.danadas});
          if(!errs.length && st.danadas > 0 && !st.danos.length) errs.push('Agrega qué daño tienen las dañadas.');
          if(!errs.length && st.danadas===0 && st.danos.length) errs.push('No hay dañadas: quita los daños o corrige la cantidad.');
          if(errs.length){ var er = q('.inv-error', f); er.textContent = errs[0]; er.hidden = false; return; }
          H.cerrarHoja(st);
        };
        h.onclick = function(e){
          if(e.target.closest('[data-hoja-cerrar]')){ H.cerrarHoja(null); return; }
          var qd = e.target.closest('[data-quitar-dano]');
          // Se vuelve a pintar la caja sin terminar la corrección (enLista evita que se tome como "Cancelar")
          if(qd){ leer(); st.danos.splice(+qd.dataset.quitarDano, 1); enLista = true; abrir(); enLista = false; return; }
          if(e.target.closest('[data-agregar-dano]')) agregarDano();
        };
      }
      function agregarDano(){
        leer(); enLista = true;
        var nuevo = {pieza_id: base.pieza_id, color_id: base.color_id};
        H.abrirLista({titulo: 'Tipo de daño', grupos: [{opciones: (E.cat.defectos||[]).filter(function(d){ return d.activo!==false }).map(function(d){ return {valor: d.id, nombre: d.nombre} })}]})
          .then(function(d){
            if(d==null) return null; nuevo.defecto_id = d;
            return H.abrirLista({titulo: '¿Qué tan grave?', grupos: [{opciones: [{valor: 'leve', nombre: 'Leve'}, {valor: 'media', nombre: 'Media'}, {valor: 'grave', nombre: 'Grave'}]}]});
          }).then(function(g){
            if(g==null) return null; nuevo.gravedad = g;
            return H.pedirCantidad({titulo: '¿Cuántas piezas con este daño?', valor: Math.max(1, st.danadas)});
          }).then(function(n){
            if(n!=null){ nuevo.cantidad = n; st.danos.push(nuevo); if(st.danadas < 1) st.danadas = n; }
            enLista = false; abrir();
          });
      }
      abrir();
    }).then(function(v){
      if(!v) return null;
      R.defectos = R.defectos.filter(function(x){ return !(x.pieza_id===base.pieza_id && (x.color_id||null)===(base.color_id||null)) }).concat(v.danos);
      R.piezas[i] = Object.assign({}, R.piezas[i], {llegaron: v.llegaron, danadas: v.danadas, revisada: true});
      return v;
    });
  }

  // ---------------------------------------------------------------- 3. Resumen y guardar
  function pasoResumen(){
    var s = I.resumenRevision(R.piezas);
    var vDif = R.renglones.map(function(r, i){ return {r: r, c: R.contados[i]} }).filter(function(x){ return x.c!=null && x.c!==x.r.cantidad });
    var html = '<div class="resumen">';
    html += vDif.length
      ? '<p style="margin:0 0 8px"><b>Vehículos que no coinciden:</b></p><ul style="margin:0 0 12px;padding-left:22px">'+vDif.map(function(x){
          return '<li>'+esc(I.nombreVehiculo(x.r, E.cat))+': la hoja dice '+x.r.cantidad+', se contaron '+x.c+'</li>' }).join('')+'</ul>'
      : '<p style="margin:0 0 12px">✓ Los vehículos coinciden con la hoja.</p>';
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
        contados: R.renglones.map(function(r, i){ return {renglon_id: r.id, contados: R.contados[i]} }),
        piezas: R.piezas.filter(function(p){ return p.revisada }).map(function(p){ return {pieza_id: p.pieza_id, color_id: p.color_id, esperadas: p.esperadas, llegaron: p.llegaron, danadas: p.danadas||0} }),
        defectos: R.defectos
      }, p_motivo: motivo}).then(function(){
        if(H.actualizarCuenta) H.actualizarCuenta();
        var main = q('.inv-main', E.raiz), num = R.c.numero, id = R.id;
        main.innerHTML = '<header class="inv-cab"><h1>Revisión guardada</h1><p>El contenedor <b>'+esc(num)+'</b> ya está revisado. Sus vehículos quedaron en espera de armado y sus piezas en el inventario.</p></header>'+
          '<div class="acciones" style="margin-top:0"><button type="button" class="btn prin" data-ir-sec="inventario">Ver inventario</button>'+
          '<button type="button" class="btn" data-ir-ficha="'+id+'">Ver el contenedor</button></div>';
      }).catch(function(err){ R.error = H.mensaje(err); dibujar(); });
    });
  }

  document.addEventListener('click', function(e){
    if(!R || !E.raiz || !E.raiz.contains(e.target)) return;
    var b = e.target.closest('[data-v],[data-p]'); if(!b) return;
    var i = +b.dataset.i; R.error = '';
    if(b.dataset.p){
      if(b.dataset.p==='si'){ var p = R.piezas[i]; R.piezas[i] = Object.assign({}, p, {llegaron: p.esperadas, danadas: 0, revisada: true});
        R.defectos = R.defectos.filter(function(x){ return !(x.pieza_id===p.pieza_id && (x.color_id||null)===(p.color_id||null)) }); dibujar(); }
      else corregirPieza(i).then(function(){ dibujar() });
      return;
    }
    var a = b.dataset.v;
    if(a==='si'){ R.contados[i] = R.renglones[i].cantidad; dibujar(); }
    else if(a==='no'){
      H.pedirCantidad({titulo: '¿Cuántos se contaron?', ayuda: I.nombreVehiculo(R.renglones[i], E.cat)+' · la hoja dice '+R.renglones[i].cantidad,
        valor: R.contados[i]==null ? R.renglones[i].cantidad : R.contados[i], min: 0}).then(function(n){ if(n!=null) R.contados[i] = n; dibujar(); });
    }
    else if(a==='todos'){ R.contados = R.contados.map(function(c, k){ return c==null ? R.renglones[k].cantidad : c }); dibujar(); }
    else if(a==='todas'){ R.piezas = R.piezas.map(function(p){ return p.revisada ? p : Object.assign({}, p, {llegaron: p.esperadas, danadas: 0, revisada: true}) }); dibujar(); }
    else if(a==='atras'){ R.paso = Math.max(1, R.paso-1); dibujar(); }
    else if(a==='sig'){
      if(R.paso===1 && R.contados.some(function(c){ return c==null })){ R.error = 'Falta contar algunos vehículos.'; }
      else if(R.paso===2 && R.piezas.some(function(p){ return !p.revisada })){ R.error = 'Falta revisar algunas piezas.'; }
      else R.paso++;
      dibujar(); window.scrollTo({top: 0});
    }
    else if(a==='guardar') guardar();
    else if(a==='corregir'){ R.soloVer = false; R.paso = 1; dibujar(); }
  });
})();
