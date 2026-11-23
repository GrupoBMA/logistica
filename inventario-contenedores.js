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
  function opcionesDeModelo(modeloId){
    var permitidas = (E.cat.modelo_opciones||[]).filter(function(mo){ return mo.modelo_id===modeloId }).map(function(mo){ return mo.opcion_id });
    return activos(E.cat.caracteristicas).map(function(c){
      return {car: c, opciones: activos(c.opciones).filter(function(o){ return permitidas.indexOf(o.id) > -1 })};
    }).filter(function(x){ return x.opciones.length });
  }
  // Tabla con casillas de las características del modelo (Cabina, Hidráulico, Pick up, Plus, Rodado). -> Promise([opciones]|null)
  function tablaOpciones(modeloId, previo){
    var cars = opcionesDeModelo(modeloId).sort(function(a, b){ return (a.car.orden||0) - (b.car.orden||0) });
    if(!cars.length) return Promise.resolve([]);
    var mo = I.porId(E.cat.modelos, modeloId);
    return H.escogerTabla({titulo: mo ? mo.nombre : 'Características', ayuda: 'Marca una casilla en cada renglón',
      filas: cars.map(function(x){ return {nombre: x.car.nombre, opciones: x.opciones.map(function(o){ return {valor: o.id, nombre: o.nombre} })} }),
      elegidos: previo && previo.modelo_id===modeloId ? previo.opciones : []});
  }
  H.tablaOpciones = tablaOpciones;
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

  // ---------------------------------------------------------------- Escoger un vehículo (modelo → características → colores → cantidad)
  // La hoja solo dice qué colores trae; cuántos de cada color se cuenta en la revisión.
  function escogerVehiculo(previo){
    var r = {modelo_id: null, opciones: [], colores: [], cantidad: previo ? previo.cantidad : 1};
    return H.abrirLista({titulo: 'Modelo', ayuda: 'Como dice la hoja del contenedor',
      grupos: [{opciones: activos(E.cat.modelos).map(function(m){ return {valor: m.id, nombre: m.nombre} })}],
      elegido: previo ? previo.modelo_id : null
    }).then(function(m){
      if(m==null) return null;
      r.modelo_id = m;
      return H.tablaOpciones(m, previo).then(function(v){ if(v==null) return false; r.opciones = v; return true; });
    }).then(function(ok){
      if(!ok) return null;
      return H.escogerVarios({titulo: 'Colores', ayuda: 'Marca todos los colores que dice la hoja',
        opciones: activos(E.cat.colores).map(function(c){ return {valor: c.id, nombre: c.nombre, color: hexColor(c.nombre)} }),
        elegidos: previo ? previo.colores : [], boton: 'Siguiente', falta: 'Marca al menos un color.'});
    }).then(function(c){
      if(c==null) return null;
      r.colores = c;
      return H.pedirCantidad({titulo: c.length > 1 ? '¿Cuántos en total?' : '¿Cuántos?', ayuda: I.nombreVehiculo(r, E.cat),
        valor: r.cantidad, boton: previo ? 'Listo' : 'Agregar'});
    }).then(function(n){
      if(n==null) return null;
      r.cantidad = n; return r;
    });
  }

  // ---------------------------------------------------------------- Recibir contenedor (y corregir)
  var W = null;   // el contenedor que se está llenando
  function nuevoW(){ return {paso: 1, id: null, bodega: E.rol==='bodega' ? E.bodega : E.verBodega, numero: '', llegada: H.hoyISO(), observaciones: '', renglones: [], error: ''} }

  function dibujarRecibir(main){
    if(!W || W.terminado) W = nuevoW();
    var corrigiendo = !!W.id;
    var titulos = ['Contenedor', '¿Qué trae?', 'Revisar y guardar'];
    var html = '<header class="inv-cab"><h1>'+(corrigiendo ? 'Corregir contenedor '+esc(W.numeroOriginal) : 'Recibir contenedor')+'</h1>'+
      '<p>'+(corrigiendo ? 'Cambia lo que haga falta y guarda. Se te pedirá el motivo.' : 'Registra el contenedor tal como dice la hoja que trae.')+'</p></header>'+
      '<ol class="pasos">'+titulos.map(function(t, i){
        var n = i+1, cl = n < W.paso ? 'hecho' : (n===W.paso ? 'ahora' : '');
        return '<li class="'+cl+'"><span class="nn">'+(n < W.paso ? '✓' : n)+'</span><span class="tx">'+t+'</span></li>';
      }).join('')+'</ol>'+
      (W.error ? '<p class="inv-error">'+esc(W.error)+'</p>' : '');

    if(W.paso===1){
      if(E.rol==='admin'){
        html += '<div class="campo"><span>Bodega</span><button type="button" class="elegir" data-r="bodega">'+
          '<span><span class="va'+(W.bodega ? '' : ' vacio')+'">'+esc(W.bodega ? H.nombreBodega(W.bodega) : 'Escoge la bodega')+'</span></span><span class="fl">'+H.ICO.flecha+'</span></button></div>';
      }
      html += '<label class="campo"><span>Número de contenedor</span><input id="rNum" autocomplete="off" value="'+esc(W.numero)+'" placeholder="Como viene en la hoja"></label>'+
        '<label class="campo"><span>Fecha en que llegó</span><input id="rFecha" type="date" value="'+esc(W.llegada)+'"></label>'+
        '<div class="acciones">'+(corrigiendo ? '<button type="button" class="btn" data-r="cancelar">Cancelar</button>' : '')+
        '<button type="button" class="btn prin der" data-r="sig">Siguiente</button></div>';
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
      var n = totalVehiculos(W.renglones);
      html += '<div class="resumen">Contenedor <b>'+esc(W.numero)+'</b>'+(E.rol==='admin' ? ' en <b>'+esc(H.nombreBodega(W.bodega))+'</b>' : '')+
        ', llegó el <b>'+esc(H.fechaLarga(W.llegada))+'</b> y trae <b>'+n+' '+(n===1 ? 'vehículo' : 'vehículos')+'</b>:'+
        '<ul style="margin:10px 0 0;padding-left:22px">'+W.renglones.map(function(r){ return '<li>'+r.cantidad+' · '+esc(I.nombreVehiculo(r, E.cat))+'</li>' }).join('')+'</ul>'+
        (W.observaciones ? '<p style="margin:10px 0 0;color:var(--muted)">Nota: '+esc(W.observaciones)+'</p>' : '')+'</div>'+
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
    if(a==='bodega'){
      leerPaso1(main);
      H.abrirLista({titulo: 'Bodega', grupos: [{opciones: H.BODEGAS}], elegido: W.bodega}).then(function(v){ if(v){ W.bodega = v; } dibujarRecibir(main); });
    } else if(a==='sig'){
      if(W.paso===1){
        leerPaso1(main);
        if(E.rol==='admin' && !W.bodega){ W.error = 'Escoge la bodega'; }
        else if(!W.numero.trim()){ W.error = 'Escribe el número de contenedor'; }
        else if(!W.llegada){ W.error = 'Escribe la fecha de llegada'; }
        else { W.paso = 2; if(!W.renglones.length){ dibujarRecibir(main); return agregar(main); } }
      } else if(W.paso===2){
        if(!W.renglones.length) W.error = 'Agrega al menos un vehículo';
        else W.paso = 3;
      }
      dibujarRecibir(main);
    } else if(a==='atras'){ W.paso = Math.max(1, W.paso-1); dibujarRecibir(main); }
    else if(a==='agregar'){ agregar(main); }
    else if(a==='cambiar'){
      var i = +b.dataset.i;
      escogerVehiculo(W.renglones[i]).then(function(r){ if(r){ W.renglones[i] = r; juntar(); } dibujarRecibir(main); });
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
  function agregar(main){
    escogerVehiculo(null).then(function(r){ if(r){ W.renglones.push(r); juntar(); } dibujarRecibir(main); });
  }
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
        var x = I.porId(E.cat.defectos, d.defecto_id);
        return '<div class="tarjeta"><span class="cant">'+d.cantidad+'</span><span class="ico-p">'+H.icoDano(x ? x.nombre : '')+'</span><span class="txt"><b>'+esc(x ? x.nombre : '?')+'</b></span>'+
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
