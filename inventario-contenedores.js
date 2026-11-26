/* Inventario: Recibir contenedor (3 pasos), lista de contenedores y su ficha.
   Usa lo que expone inventario.js (InventarioApp._h). */
(function(){
  var H = window.InventarioApp._h, E = H.E, I = H.I, esc = H.esc, q = H.q;

  // Punto de color en las listas (por nombre del color del catálogo)
  var HEX = {blanco:'#ffffff', azul:'#2563eb', rojo:'#dc2626', tinto:'#7f1d1d', plata:'#c0c4c8', negro:'#111111',
    rosa:'#ec4899', verde:'#16a34a', naranja:'#f97316', amarillo:'#facc15', gris:'#8a8d91', cafe:'#7c4a1e', morado:'#7c3aed'};
  function hexColor(nombre){ return HEX[String(nombre||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')] || null }
  H.hexColor = hexColor;

  // Colores con su punto: "● Azul  ● Rojo"; con conteo: "● Azul 2  ● Rojo 3" (en el orden del catálogo)
  function coloresHTML(ids, conteo){
    var n = {}; (conteo||[]).forEach(function(x){ n[x.color_id] = x.contados });
    return (E.cat.colores||[]).filter(function(c){ return (ids||[]).indexOf(c.id) > -1 }).map(function(c){
      var hx = hexColor(c.nombre);
      return '<span class="col-et">'+(hx ? '<span class="pt-col" style="background:'+hx+'"></span>' : '')+esc(c.nombre)+
        (conteo ? '<b>'+(n[c.id]||0)+'</b>' : '')+'</span>';
    }).join('');
  }
  H.coloresHTML = coloresHTML;
  // Una tarjeta de vehículos: cantidad, modelo con opciones y, abajo, sus colores
  function txtVehiculo(r){
    return '<b>'+esc(I.nombreModelo(r, E.cat))+'</b><small>'+coloresHTML(r.colores)+'</small>';
  }

  function activos(lista){ return (lista||[]).filter(function(x){ return x.activo !== false }) }
  // De fábrica (aditamentos = false) o aditamentos (true): las características que tiene el modelo, con sus opciones permitidas
  function opcionesDeModelo(modeloId, aditamentos){
    var permitidas = (E.cat.modelo_opciones||[]).filter(function(mo){ return mo.modelo_id===modeloId }).map(function(mo){ return mo.opcion_id });
    return activos(E.cat.caracteristicas).filter(function(c){ return !!c.aditamento===!!aditamentos }).map(function(c){
      return {car: c, opciones: activos(c.opciones).filter(function(o){ return permitidas.indexOf(o.id) > -1 })};
    }).filter(function(x){ return x.opciones.length });
  }
  // Características de fábrica del modelo en su orden (Cabina, Atrás, Hidráulico, Tipo) y sus aditamentos (Caja, Toldo, Cachucha)
  H.opcionesDeModelo = function(m){ return opcionesDeModelo(m, false).sort(function(a, b){ return (a.car.orden||0) - (b.car.orden||0) }) };
  H.aditamentosDeModelo = function(m){ return opcionesDeModelo(m, true).sort(function(a, b){ return (a.car.orden||0) - (b.car.orden||0) }) };
  // Lo que se contradice no se puede escoger (pedido del usuario, 26-nov-2026): al escoger una opción se quitan las que chocan con ella
  H.escogerOpcion = function(sel, carId, opId, quitarSiEsLaMisma){
    if(quitarSiEsLaMisma && sel[carId]===opId){ delete sel[carId]; return; }
    sel[carId] = opId;
    var bl = I.bloqueadas([opId], E.cat);
    Object.keys(sel).forEach(function(k){ if(+k!==carId && bl[sel[k]]) delete sel[k]; });
  };
  // Botones de un renglón: el escogido marcado y los que chocan con lo ya escogido, apagados
  H.filaOpciones = function(x, sel, bloq, attrs){
    return '<div class="vf-fila"><span class="vf-nom">'+esc(x.car.nombre)+'</span><div class="pilds">'+x.opciones.map(function(o){
      var on = sel[x.car.id]===o.id, apagado = !on && bloq[o.id]!=null, choca = apagado ? nombreLegible(bloq[o.id]) : '';
      return '<button type="button" class="pild'+(on ? ' sel' : '')+'" aria-pressed="'+on+'" '+attrs+' data-car="'+x.car.id+'" data-val="'+o.id+'"'+
        (apagado ? ' disabled title="No va con '+esc(choca || 'lo que escogiste')+'"' : '')+'>'+esc(o.nombre)+'</button>';
    }).join('')+'</div></div>';
  };
  // "Hidráulico" en vez de "Sí", "Cabina cerrada" tal cual
  function nombreLegible(opId){
    var r = '';
    (E.cat.caracteristicas||[]).forEach(function(c){ (c.opciones||[]).forEach(function(o){ if(o.id===opId) r = c.solo_opcion ? o.nombre : I.nombreOpcion(c.nombre, o.nombre) }) });
    return r;
  }
  H.valores = function(sel){ return Object.keys(sel).map(function(k){ return sel[k] }) };
  function totalVehiculos(renglones){ return renglones.reduce(function(s, r){ return s + (r.cantidad||0) }, 0) }
  // Mismo modelo y opciones (los colores se juntan)
  function mismoVehiculo(a, b){
    return a.modelo_id===b.modelo_id && (a.opciones||[]).slice().sort().join(',') === (b.opciones||[]).slice().sort().join(',');
  }
  function etiquetaEstado(c){
    if(c.estado==='anulado') return '<span class="etq anul">Anulado</span>';
    if(c.anulacion_pendiente) return '<span class="etq rojo">Anulación pedida</span>';
    if(c.estado==='revisado') return '<span class="etq ok">Revisado</span>';
    return '<span class="etq pend">Por revisar</span>';
  }

  // ---------------------------------------------------------------- Formulario de un vehículo (una sola pantalla)
  // 1. Modelo · 2. Características · 3. Colores (todos los que dice la hoja) · 4. ¿Cuántos en total?
  // Como en Nueva venta (pedido del usuario, 26-nov-2026). La hoja solo dice qué colores trae;
  // cuántos de cada color se cuenta en la revisión. Nada viene escogido de antemano (candado).
  function nuevoForm(i){
    var p = i==null ? null : W.renglones[i];
    var f = {i: i, modelo_id: p ? p.modelo_id : null, sel: {}, colores: p ? p.colores.slice() : [], cantidad: p ? p.cantidad : 1, error: ''};
    if(p) H.opcionesDeModelo(p.modelo_id).forEach(function(x){
      var o = x.opciones.filter(function(o){ return (p.opciones||[]).indexOf(o.id) > -1 })[0]; if(o) f.sel[x.car.id] = o.id;
    });
    return f;
  }
  function pild(attrs, on, contenido){
    return '<button type="button" class="pild'+(on ? ' sel' : '')+'" aria-pressed="'+on+'" data-r="vf" '+attrs+'>'+contenido+'</button>';
  }
  // En una sola pantalla sin deslizar (pedido del usuario, 26-nov-2026): a la izquierda Modelo y Características;
  // a la derecha Colores (en una lista para escoger, ya no como botones) y ¿Cuántos?
  function formVehiculo(){
    var f = W.form, n = 0, izq = '', der = '';
    izq += '<section class="vf-sec"><h3>'+(++n)+'. Modelo</h3><div class="pilds">'+
      activos(E.cat.modelos).map(function(x){ return pild('data-k="modelo" data-val="'+x.id+'"', f.modelo_id===x.id, esc(x.nombre)) }).join('')+'</div></section>';
    if(f.modelo_id!=null){
      var cars = H.opcionesDeModelo(f.modelo_id);
      if(cars.length){
        var bloq = I.bloqueadas(H.valores(f.sel), E.cat);
        izq += '<section class="vf-sec"><h3>'+(++n)+'. Características</h3><div class="vf-tabla">'+cars.map(function(x){
          return H.filaOpciones(x, f.sel, bloq, 'data-r="vf" data-k="op"');
        }).join('')+'</div></section>';
      }
      der += '<section class="vf-sec"><h3>'+(++n)+'. Colores</h3>'+
        '<button type="button" class="elegir" data-r="vf" data-k="colores"><span><span class="va'+(f.colores.length ? '' : ' vacio')+'">'+
        (f.colores.length ? coloresHTML(f.colores) : 'Escoge los colores')+'</span></span><span class="fl">'+H.ICO.flecha+'</span></button></section>';
      der += '<section class="vf-sec"><h3>'+(++n)+'. '+(f.colores.length > 1 ? '¿Cuántos en total?' : '¿Cuántos?')+'</h3>'+H.contador('vfCant', f.cantidad, 1)+'</section>';
    }
    return '<div class="vf vf-dos">'+(f.error ? '<p class="inv-error">'+esc(f.error)+'</p>' : '')+
      '<div class="vf-cols"><div>'+izq+'</div><div>'+der+'</div></div>'+
      '<div class="acciones">'+(W.renglones.length || f.i!=null ? '<button type="button" class="btn" data-r="vf" data-k="cancelar">Cancelar</button>'
                                                               : '<button type="button" class="btn" data-r="atras">Atrás</button>')+
      '<button type="button" class="btn prin der" data-r="vf" data-k="listo">'+(f.i==null ? 'Agregar' : 'Listo')+'</button></div></div>';
  }
  function leerForm(main){
    var f = W.form; if(!f) return;
    var c = q('[data-contador="vfCant"]', main); if(c) f.cantidad = H.valorContador(c);
  }
  function clicForm(b, main){
    var f = W.form, k = b.dataset.k, val = +b.dataset.val;
    leerForm(main); f.error = '';
    if(k==='modelo'){ if(f.modelo_id!==val){ f.modelo_id = val; f.sel = {}; } }
    else if(k==='op') H.escogerOpcion(f.sel, +b.dataset.car, val);
    else if(k==='colores'){
      H.escogerVarios({titulo: 'Colores', ayuda: 'Marca todos los colores que dice la hoja',
        opciones: activos(E.cat.colores).map(function(c){ return {valor: c.id, nombre: c.nombre, color: hexColor(c.nombre)} }),
        elegidos: f.colores, boton: 'Listo', falta: 'Marca al menos un color.'}).then(function(v){ if(v) f.colores = v; dibujarRecibir(main); });
      return;
    }
    else if(k==='cancelar') W.form = null;
    else if(k==='listo'){
      var cars = f.modelo_id==null ? [] : H.opcionesDeModelo(f.modelo_id), faltan = [];
      if(f.modelo_id==null) faltan.push('el modelo');
      cars.forEach(function(x){ if(f.sel[x.car.id]==null) faltan.push(x.car.nombre) });
      if(f.modelo_id!=null && !f.colores.length) faltan.push('al menos un color');
      if(faltan.length) f.error = 'Falta escoger: '+faltan.join(', ')+'.';
      else if(!(f.cantidad >= 1)) f.error = 'La cantidad debe ser 1 o más.';
      else {
        var orden = activos(E.cat.colores).map(function(c){ return c.id });
        var r = {modelo_id: f.modelo_id, opciones: cars.map(function(x){ return f.sel[x.car.id] }),
          colores: f.colores.slice().sort(function(a, b){ return orden.indexOf(a) - orden.indexOf(b) }), cantidad: f.cantidad};
        if(f.i==null) W.renglones.push(r); else W.renglones[f.i] = r;
        juntar(); W.form = null;
      }
    }
    var arriba = window.scrollY;
    dibujarRecibir(main);
    window.scrollTo({top: W.form && !f.error ? arriba : 0});
  }

  // ---------------------------------------------------------------- Recibir contenedor (y corregir)
  var W = null;   // el contenedor que se está llenando
  function nuevoW(){ return {paso: 1, id: null, bodega: E.rol==='bodega' ? E.bodega : E.verBodega, numero: '', llegada: H.hoyISO(), observaciones: '', renglones: [], error: ''} }

  function dibujarRecibir(main){
    if(!W || W.terminado) W = nuevoW();
    var corrigiendo = !!W.id;
    var titulos = ['Contenedor', 'Contenido', 'Revisar y guardar'];
    var html = '<header class="inv-cab"><h1>'+(corrigiendo ? 'Corregir contenedor '+esc(W.numeroOriginal) : 'Recibir contenedor')+'</h1>'+
      (corrigiendo ? '<p>Cambia lo que haga falta y guarda. Se te pedirá el motivo.</p>' : '')+'</header>'+
      '<ol class="pasos">'+titulos.map(function(t, i){
        var n = i+1, cl = n < W.paso ? 'hecho' : (n===W.paso ? 'ahora' : '');
        return '<li class="'+cl+'"><span class="nn">'+(n < W.paso ? '✓' : n)+'</span><span class="tx">'+t+'</span></li>';
      }).join('')+'</ol>'+
      (W.error ? '<p class="inv-error">'+esc(W.error)+'</p>' : '');

    if(W.paso===1){
      if(E.rol==='admin'){
        html += '<div class="campo grande"><span>Bodega</span><button type="button" class="elegir" data-r="bodega">'+
          '<span><span class="va'+(W.bodega ? '' : ' vacio')+'">'+esc(W.bodega ? H.nombreBodega(W.bodega) : 'Escoge la bodega')+'</span></span><span class="fl">'+H.ICO.flecha+'</span></button></div>';
      }
      // El título de cada campo en grande y la pista de adentro en chiquito (pedido del usuario, 26-nov-2026)
      html += '<label class="campo grande"><span>Número de contenedor</span><input id="rNum" autocomplete="off" value="'+esc(W.numero)+'" placeholder="Como viene en la hoja"></label>'+
        '<label class="campo grande"><span>Fecha en que llegó</span><input id="rFecha" type="date" value="'+esc(W.llegada)+'"></label>'+
        '<div class="acciones">'+(corrigiendo ? '<button type="button" class="btn" data-r="cancelar">Cancelar</button>' : '')+
        '<button type="button" class="btn prin der" data-r="sig">Siguiente</button></div>';
    } else if(W.paso===2 && W.form){
      html += formVehiculo();
    } else if(W.paso===2){
      html += '<div class="tarjetas">'+W.renglones.map(function(r, i){
        return '<div class="tarjeta"><span class="cant">'+r.cantidad+'</span><span class="txt">'+txtVehiculo(r)+'</span>'+
          '<span class="btns"><button type="button" class="btn" data-r="cambiar" data-i="'+i+'">Cambiar</button>'+
          '<button type="button" class="btn" data-r="quitar" data-i="'+i+'" aria-label="Quitar">Quitar</button></span></div>';
      }).join('')+'</div>'+
        (W.renglones.length ? '' : '<div class="inv-vacio"><b>Todavía no agregas vehículos</b>Agrega cada tipo de vehículo que dice la hoja del contenedor.</div>')+
        '<div class="acciones" style="margin-top:16px"><button type="button" class="btn ancho" data-r="agregar">+ Agregar vehículos</button></div>'+
        '<p style="margin:18px 0 0">'+(W.observaciones
          ? 'Nota: '+esc(W.observaciones)+' <button type="button" class="btn-link" data-r="nota">Cambiar nota</button>'
          : '<button type="button" class="btn-link" data-r="nota">Agregar una nota</button>')+'</p>'+
        '<div class="acciones"><button type="button" class="btn" data-r="atras">Atrás</button>'+
        '<button type="button" class="btn prin der" data-r="sig">Siguiente</button></div>';
    } else {
      // Revisar y guardar: como una nota, con la información separada (pedido del usuario, 26-nov-2026)
      var n = totalVehiculos(W.renglones);
      html += '<div class="nota">'+
        '<div class="nota-cab"><span>Contenedor</span><b>'+esc(W.numero)+'</b></div>'+
        '<div class="nota-datos">'+
          '<div><span>Llegó el</span><b>'+esc(H.fechaLarga(W.llegada))+'</b></div>'+
          (E.rol==='admin' ? '<div><span>Bodega</span><b>'+esc(H.nombreBodega(W.bodega))+'</b></div>' : '')+
          '<div><span>Total</span><b>'+n+' '+(n===1 ? 'vehículo' : 'vehículos')+'</b></div>'+
        '</div>'+
        '<div class="nota-tit">Contenido</div>'+
        '<div class="nota-lista">'+W.renglones.map(function(r){
          return '<div class="nota-fila"><span class="nota-n">'+r.cantidad+'</span><span class="nota-txt"><b>'+esc(I.nombreModelo(r, E.cat))+'</b>'+
            '<small>'+coloresHTML(r.colores)+'</small></span></div>';
        }).join('')+'</div>'+
        (W.observaciones ? '<div class="nota-tit">Nota</div><p class="nota-obs">'+esc(W.observaciones)+'</p>' : '')+
      '</div>'+
        '<div class="acciones"><button type="button" class="btn" data-r="atras">Atrás</button>'+
        '<button type="button" class="btn prin der" data-r="guardar">'+(corrigiendo ? 'Guardar cambios' : 'Guardar contenedor')+'</button></div>';
    }
    main.innerHTML = html;
    var foco = q('#rNum', main); if(foco && !W.numero) foco.focus();
  }

  function leerPaso1(main){
    var n = q('#rNum', main), f = q('#rFecha', main);
    if(n) W.numero = n.value; if(f) W.llegada = f.value;
  }

  function guardarContenedor(main, existentes){
    var errores = I.validarContenedor(W, existentes);
    if(errores.length){ W.error = errores[0]; dibujarRecibir(main); return; }
    var motivo = W.id ? H.pedirTexto({titulo: '¿Por qué lo corriges?', ayuda: 'Queda guardado junto con el cambio', etiqueta: 'Motivo', largo: true,
      boton: 'Guardar cambios', falta: 'Escribe el motivo del cambio.'}) : Promise.resolve(null);
    motivo.then(function(m){
      if(W.id && m==null) return;
      var boton = q('[data-r="guardar"]', main); if(boton){ boton.disabled = true; boton.textContent = 'Guardando…'; }
      H.rpc('inv_contenedor_guardar', {p: {id: W.id, bodega: W.bodega, numero: W.numero, llegada: W.llegada, observaciones: W.observaciones,
        renglones: W.renglones}, p_motivo: m}).then(function(r){
        // Sin pantalla de "Listo" (pedido del usuario): un letrero y el punto naranja en la lista
        var id = r.id, num = W.numero.trim(), eraCorreccion = !!W.id;
        W.terminado = true;
        actualizarCuenta();
        if(eraCorreccion){ H.avisar('Se guardaron los cambios del contenedor '+num+'.'); abrirFicha(id); }
        else { H.avisar('Se guardó el contenedor '+num+'. Ya está en la lista, esperando su revisión.'); H.marcarNuevo('contenedores'); W = null; dibujarRecibir(main); }
      }).catch(function(err){
        W.error = H.mensaje(err); dibujarRecibir(main);
      });
    });
  }

  function alClicRecibir(e){
    var main = q('.inv-main', E.raiz);
    if(E.seccion!=='recibir' || !main.contains(e.target)) return;
    var b = e.target.closest('[data-r]'); if(!b) return;
    var a = b.dataset.r;
    W.error = '';
    if(a==='vf'){ clicForm(b, main); return; }
    if(a==='bodega'){
      leerPaso1(main);
      H.abrirLista({titulo: 'Bodega', grupos: [{opciones: H.BODEGAS}], elegido: W.bodega}).then(function(v){ if(v){ W.bodega = v; } dibujarRecibir(main); });
    } else if(a==='sig'){
      if(W.paso===1){
        leerPaso1(main);
        if(E.rol==='admin' && !W.bodega){ W.error = 'Escoge la bodega'; }
        else if(!W.numero.trim()){ W.error = 'Escribe el número de contenedor'; }
        else if(!W.llegada){ W.error = 'Escribe la fecha de llegada'; }
        else { W.paso = 2; if(!W.renglones.length) W.form = nuevoForm(null); }
      } else if(W.paso===2){
        if(!W.renglones.length) W.error = 'Agrega al menos un vehículo';
        else W.paso = 3;
      }
      dibujarRecibir(main);
    } else if(a==='atras'){ W.form = null; W.paso = Math.max(1, W.paso-1); dibujarRecibir(main); }
    else if(a==='agregar'){ agregar(main); }
    else if(a==='cambiar'){
      W.form = nuevoForm(+b.dataset.i); dibujarRecibir(main); window.scrollTo({top: 0});
    } else if(a==='quitar'){ W.renglones.splice(+b.dataset.i, 1); dibujarRecibir(main); }
    else if(a==='nota'){
      H.pedirTexto({titulo: 'Nota del contenedor', ayuda: 'Algo que valga la pena recordar (opcional)', etiqueta: 'Nota', largo: true, valor: W.observaciones,
        falta: 'Escribe la nota o da Cancelar.'}).then(function(t){ if(t!=null) W.observaciones = t; dibujarRecibir(main); });
    } else if(a==='cancelar'){ var id = W.id; W = null; abrirFicha(id); }
    else if(a==='guardar'){
      H.rpc('inv_contenedores', {p_bodega: null}).then(function(lista){
        var otros = lista.filter(function(c){ return c.id!==W.id && c.estado!=='anulado' }).map(function(c){ return c.numero });
        guardarContenedor(main, otros);
      }).catch(function(){ guardarContenedor(main, []); });
    }
  }
  function agregar(main){ W.form = nuevoForm(null); dibujarRecibir(main); window.scrollTo({top: 0}); }
  // Si se agrega dos veces el mismo modelo con las mismas opciones, se suman y se juntan sus colores
  function juntar(){
    var res = [];
    W.renglones.forEach(function(r){
      var x = res.filter(function(y){ return mismoVehiculo(y, r) })[0];
      if(!x){ res.push(r); return; }
      x.cantidad += r.cantidad;
      r.colores.forEach(function(c){ if(x.colores.indexOf(c) < 0) x.colores.push(c) });
    });
    W.renglones = res;
  }

  // ---------------------------------------------------------------- Lista de contenedores
  function actualizarCuenta(){
    if(!H.puedeEscribir()) return;
    H.rpc('inv_contenedores', {p_bodega: E.verBodega}).then(function(l){
      var n = l.filter(function(c){ return c.estado==='recibido' }).length;
      H.CUENTA.contenedores = n || ''; H.dibujarMenu();
    }).catch(function(){});
  }
  H.actualizarCuenta = actualizarCuenta;

  function dibujarContenedores(main){
    H.rpc('inv_contenedores', {p_bodega: E.verBodega}).then(function(lista){
      if(E.seccion!=='contenedores') return;
      var porRevisar = lista.filter(function(c){ return c.estado==='recibido' }).length;
      if(H.puedeEscribir()){ H.CUENTA.contenedores = porRevisar || ''; H.dibujarMenu(); }
      var html = '<header class="inv-cab"><h1>Contenedores</h1><p>'+
        (porRevisar ? porRevisar+(porRevisar===1 ? ' contenedor espera' : ' contenedores esperan')+' su revisión.' : 'Los contenedores que han llegado, del más reciente al más antiguo.')+'</p></header>';
      if(!lista.length){
        html += '<div class="inv-vacio"><b>Todavía no hay contenedores</b>'+(H.puedeEscribir() ? 'Cuando llegue uno, regístralo en "Recibir contenedor".' : '')+'</div>';
      } else {
        html += '<div class="tarjetas">'+lista.map(function(c){
          return '<button type="button" class="tarjeta clic" data-ir-ficha="'+c.id+'"><span class="txt"><b>'+esc(c.numero)+'</b>'+
            '<small>'+esc(H.fechaLarga(c.llegada))+' · '+c.vehiculos+(c.vehiculos===1 ? ' vehículo' : ' vehículos')+
            (E.rol!=='bodega' && !E.verBodega ? ' · '+esc(H.nombreBodega(c.bodega)) : '')+'</small></span>'+
            (+c.danos ? '<span class="etq rojo">'+c.danos+(+c.danos===1 ? ' daño' : ' daños')+'</span>' : '')+etiquetaEstado(c)+
            '<span class="fl" style="color:var(--muted)">'+H.ICO.flecha+'</span></button>';
        }).join('')+'</div>';
      }
      main.innerHTML = html;
    }).catch(function(err){ main.innerHTML = '<p class="inv-error">'+esc(H.mensaje(err))+'</p>' });
  }

  // ---------------------------------------------------------------- Ficha de un contenedor
  // Daños que se anotaron en la revisión (del contenedor y de piezas)
  function danosHTML(c, defs){
    if(c.estado!=='revisado') return '';
    var t = defs.reduce(function(s, d){ return s + d.cantidad }, 0);
    if(!t) return '<p style="margin:16px 0 0">✓ No llegó nada dañado.</p>';
    var grav = {leve: 'Leve', media: 'Media', grave: 'Grave'};
    return '<h2 style="font-size:18px;margin:24px 0 10px">Daños <span class="etq rojo" style="vertical-align:middle">'+t+'</span></h2>'+
      '<div class="tarjetas">'+defs.map(function(d){
        var x = I.porId(E.cat.defectos, d.defecto_id), pz = d.pieza_id!=null ? I.porId(E.cat.piezas, d.pieza_id) : null;
        // Por pieza: el nombre de la pieza y si es reparable (26-nov-2026); del contenedor: tipo y gravedad
        return '<div class="tarjeta"><span class="cant">'+d.cantidad+'</span><span class="ico-p">'+(pz ? H.icoPieza(pz.nombre) : H.icoDano(x ? x.nombre : ''))+'</span>'+
          '<span class="txt"><b>'+esc(pz ? pz.nombre : (x ? x.nombre : '?'))+'</b>'+(pz ? '<small>'+esc(x ? x.nombre : '')+'</small>' : '')+'</span>'+
          (d.reparable===true ? '<span class="etq pend">Reparable</span>' : d.reparable===false ? '<span class="etq rojo">Irreparable</span>' : '')+
          (d.gravedad ? '<span class="etq '+(d.gravedad==='leve' ? 'pend' : 'rojo')+'">'+grav[d.gravedad]+'</span>' : '')+'</div>';
      }).join('')+'</div>';
  }
  function abrirFicha(id){
    H.E.seccion = 'contenedores'; H.dibujarMenu();
    var main = q('.inv-main', E.raiz);
    main.innerHTML = '<p class="inv-cargando">Cargando…</p>';
    window.scrollTo({top: 0});
    H.rpc('inv_contenedor', {p_id: id}).then(function(f){
      var c = f.contenedor, rs = f.renglones || [], an = f.anulacion;
      var pend = an && an.estado==='pendiente';
      var estado = etiquetaEstado({estado: c.estado, anulacion_pendiente: pend});
      var n = totalVehiculos(rs);
      var html = '<button type="button" class="btn-link" data-ir-sec="contenedores">‹ Contenedores</button>'+
        '<header class="inv-cab" style="display:flex;align-items:center;gap:14px;flex-wrap:wrap"><h1>Contenedor '+esc(c.numero)+'</h1>'+estado+'</header>'+
        '<p style="margin:-10px 0 18px;color:var(--muted)">Llegó el '+esc(H.fechaLarga(c.llegada))+(E.rol!=='bodega' ? ' · '+esc(H.nombreBodega(c.bodega)) : '')+
        ' · '+n+(n===1 ? ' vehículo' : ' vehículos')+'</p>'+
        (pend ? '<p class="inv-error">Se pidió anular este contenedor: '+esc(an.motivo)+'. Falta que el administrador lo autorice.</p>' : '')+
        '<div class="tarjetas">'+rs.map(function(r){
          var revisado = c.estado==='revisado' && r.conteo && r.conteo.length;
          var abajo = revisado
            ? '<small>Se contaron: '+coloresHTML(r.conteo.map(function(x){ return x.color_id }), r.conteo)+'</small>'+
              (r.contados!==r.cantidad ? '<small style="color:var(--neg)">La hoja dice '+r.cantidad+', se contaron '+r.contados+'</small>' : '')
            : '<small>'+coloresHTML(r.colores)+'</small>';
          return '<div class="tarjeta"><span class="cant">'+r.cantidad+'</span><span class="txt"><b>'+esc(I.nombreModelo(r, E.cat))+'</b>'+abajo+'</span></div>';
        }).join('')+'</div>'+
        danosHTML(c, f.defectos||[])+
        (c.observaciones ? '<p style="margin:16px 0 0">Nota: '+esc(c.observaciones)+'</p>' : '');
      if(H.puedeEscribir() && c.estado!=='anulado'){
        html += '<div class="acciones">'+
          (c.estado==='recibido' ? '<button type="button" class="btn prin" data-revisar="'+c.id+'">Revisar contenedor</button>'
                                 : '<button type="button" class="btn" data-revisar="'+c.id+'">Ver o corregir la revisión</button>')+
          '<button type="button" class="btn" data-corregir="'+c.id+'">Corregir lo que trae</button>'+
          (pend ? '' : '<button type="button" class="btn peligro der" data-anular="'+c.id+'">Pedir anulación</button>')+'</div>';
      } else if(c.estado==='revisado'){
        html += '<div class="acciones"><button type="button" class="btn" data-revisar="'+c.id+'">Ver la revisión</button></div>';
      }
      main.innerHTML = html;
      H.fichaActual = f;
    }).catch(function(err){ main.innerHTML = '<p class="inv-error">'+esc(H.mensaje(err))+'</p>' });
  }
  H.abrirFicha = abrirFicha;

  function alClicGeneral(e){
    if(!E.raiz || !E.raiz.contains(e.target)) return;
    var b;
    if((b = e.target.closest('[data-ir-ficha]'))){ abrirFicha(+b.dataset.irFicha); return; }
    if((b = e.target.closest('[data-ir-sec]'))){ if(b.dataset.irSec==='recibir') W = null; H.ir(b.dataset.irSec); return; }
    if((b = e.target.closest('[data-corregir]'))){
      var f = H.fichaActual, c = f.contenedor;
      var seguir = c.estado==='revisado'
        ? H.confirmar({titulo: '¿Corregir lo que trae?', ayuda: 'Si cambias los vehículos, el contenedor tendrá que revisarse otra vez.', si: 'Sí, corregir'})
        : Promise.resolve(true);
      seguir.then(function(ok){
        if(!ok) return;
        W = {paso: 1, id: c.id, numeroOriginal: c.numero, bodega: c.bodega, numero: c.numero, llegada: c.llegada, observaciones: c.observaciones||'',
          renglones: f.renglones.map(function(r){ return {modelo_id: r.modelo_id, opciones: r.opciones||[], colores: r.colores||[], cantidad: r.cantidad} }), error: ''};
        E.seccion = 'recibir'; H.dibujarMenu(); dibujarRecibir(q('.inv-main', E.raiz));
      });
      return;
    }
    if((b = e.target.closest('[data-anular]'))){
      var id = +b.dataset.anular;
      H.pedirTexto({titulo: 'Pedir anulación', ayuda: 'El administrador tiene que autorizarla. Mientras, el contenedor sigue contando.', etiqueta: '¿Por qué se debe anular?',
        largo: true, boton: 'Pedir anulación', falta: 'Escribe el motivo.'}).then(function(m){
        if(m==null) return;
        H.rpc('inv_anulacion_pedir', {p_contenedor: id, p_motivo: m}).then(function(){ abrirFicha(id) })
          .catch(function(err){ q('.inv-main', E.raiz).insertAdjacentHTML('afterbegin', '<p class="inv-error">'+esc(H.mensaje(err))+'</p>') });
      });
      return;
    }
    if((b = e.target.closest('[data-revisar]'))){ if(H.abrirRevision) H.abrirRevision(+b.dataset.revisar); return; }
  }

  document.addEventListener('click', alClicRecibir);
  // Al picar "Recibir contenedor" en el menú, una corrección a medias se descarta y empieza uno nuevo
  document.addEventListener('click', function(e){ var s = e.target.closest('[data-sec="recibir"]'); if(s && W && W.id) W = null; }, true);
  document.addEventListener('click', alClicGeneral);
  H.DIBUJAR.recibir = dibujarRecibir;
  H.DIBUJAR.contenedores = dibujarContenedores;
})();
