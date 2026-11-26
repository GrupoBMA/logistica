/* Producción vista como línea (21-nov-2026). Viene del prototipo prototipos/linea-produccion-svg.html, que el usuario escogió.
   Banda en U vista desde arriba, solo SVG (sin librerías). La producción empieza en Armado (sin "En espera", 26-nov-2026):
   arriba Armado y Revisión, mecánica y activación; abajo, de derecha a izquierda, Detallado y pintura, Revisión final y Listo.
   Reparación es un desvío lateral por fuera de la U, arriba, para los que no pasan la revisión (26-nov-2026): sale de la
   banda después de Revisión y vuelve a ella antes de la esquina. Herrería y Forrado son una rama aparte (por fuera, a la derecha) que
   sale después de Revisión (o de Reparación) y vuelve antes de Detallado.
   Al picar un área, ARRIBA de la línea sale la lista de sus vehículos con sus pasos para avanzarlos o regresarlos,
   y ABAJO solo se ve cómo se mueven (pedido del usuario). */
(function(){
  var H = window.InventarioApp._h, E = H.E, esc = H.esc;
  var NS = 'http://www.w3.org/2000/svg';
  var POS = {
    // Más ancha y más baja para llenar el espacio (26-nov-2026); Reparación va por fuera de la U, arriba
    armado: [32,0,'arriba'], revision: [80,0,'arriba'], reparacion: [122,-17,'lateral'],
    herreria: [202,11,'rama'], forrado: [202,33,'rama'],
    detallado: [150,46,'abajo'], revision_final: [100,46,'abajo'], listo: [50,46,'abajo']
  };
  var COLOR = {armado:'#f08a4b', revision:'#26a889', reparacion:'#e5533d', herreria:'#6c7a91', forrado:'#9a6ee0',
    detallado:'#e7698a', revision_final:'#3f9f5d', listo:'#7d848e'};
  function p(id){ return POS[id].slice(0, 2) }
  function ruta(a, b){
    var R = {
      'armado>revision': [p('armado'), p('revision')],
      'revision>reparacion': [p('revision'), [106,0], [106,-17], p('reparacion')],
      'reparacion>detallado': [p('reparacion'), [138,-17], [138,0], [178,0], [178,46], p('detallado')],
      'reparacion>herreria': [p('reparacion'), [138,-17], [138,0], [178,0], [202,0], p('herreria')],
      'revision>detallado': [p('revision'), [178,0], [178,46], p('detallado')],
      'revision>herreria': [p('revision'), [178,0], [202,0], p('herreria')], 'herreria>forrado': [p('herreria'), p('forrado')],
      'forrado>detallado': [p('forrado'), [202,46], [178,46], p('detallado')],
      'detallado>revision_final': [p('detallado'), p('revision_final')],
      'revision_final>listo': [p('revision_final'), p('listo')]
    };
    var r = R[a+'>'+b];
    if(!r && R[b+'>'+a]) r = R[b+'>'+a].slice().reverse();   // regresar un paso: el mismo camino al revés
    return (r || []).map(function(x){ return x.slice() });
  }
  function nombreEtapa(id){ return H.prod.etapa(id).nombre }
  function el(tag, attrs, padre){ var n = document.createElementNS(NS, tag); for(var k in attrs) n.setAttribute(k, attrs[k]); if(padre) padre.appendChild(n); return n; }

  var L = null;              // la línea en pantalla
  var corriendo = false;     // un solo ciclo de animación para toda la vida de la página

  function dibujar(caja, lista){
    var abierta = L && document.body.contains(L.caja) ? L.abierta : null;
    L = {caja: caja, veh: {}, abierta: abierta};
    L.panel = document.createElement('div'); L.panel.className = 'ln-panel'; caja.appendChild(L.panel);
    L.panel.addEventListener('click', alClicPanel);
    var svg = el('svg', {viewBox: '-6 -37 232 102', class: 'linea', role: 'img', 'aria-label': 'Línea de producción'});
    caja.appendChild(svg); L.svg = svg;
    el('defs', {}, svg).innerHTML = '<filter id="lnSombra" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy=".35" stdDeviation=".45" flood-color="#000" flood-opacity=".14"/></filter>'+
      '<filter id="lnSombraVeh" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy=".25" stdDeviation=".25" flood-color="#000" flood-opacity=".25"/></filter>';
    L.areas = el('g', {}, svg); var banda = el('g', {}, svg); var rod = el('g', {}, svg);
    L.capaVeh = el('g', {}, svg); L.letreros = el('g', {}, svg);

    Object.keys(POS).forEach(function(id){
      var c = cajaArea(id), g = el('g', {class: 'ln-area', 'data-ln': id}, L.areas);
      el('rect', {class: 'fondo', x: c.x, y: c.y, width: c.w, height: c.h, rx: 2.2, fill: COLOR[id], 'fill-opacity': .13}, g);
      el('rect', {class: 'orilla', x: c.x, y: c.y, width: c.w, height: c.h, rx: 2.2, fill: 'none', stroke: COLOR[id], 'stroke-opacity': .45, 'stroke-width': .25,
        'stroke-dasharray': POS[id][2]==='rama' || POS[id][2]==='lateral' ? '1 .7' : 'none'}, g);
    });
    var U = 'M 6 0 H 178 V 46 H 4', RAMA = 'M 178 0 H 202 V 46 H 178', LADO = 'M 106 0 V -17 H 138 V 0';
    // Desvío de Reparación (más delgado, por fuera de la U)
    el('path', {d: LADO, fill: 'none', stroke: '#2c5f6c', 'stroke-width': 3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'stroke-opacity': .7, filter: 'url(#lnSombra)'}, banda);
    el('path', {class: 'ln-flujo', d: LADO}, banda);
    el('path', {d: RAMA, fill: 'none', stroke: '#2c5f6c', 'stroke-width': 4.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'stroke-opacity': .85, filter: 'url(#lnSombra)'}, banda);
    el('path', {d: U, fill: 'none', stroke: '#2c5f6c', 'stroke-width': 4.2, 'stroke-linejoin': 'round', filter: 'url(#lnSombra)'}, banda);
    el('path', {d: 'M 4.2 42.4 L -2.5 46 L 4.2 49.6 Z', fill: '#2c5f6c'}, banda);
    el('path', {class: 'ln-flujo', d: U}, banda);
    el('path', {class: 'ln-flujo', d: RAMA}, banda);
    Object.keys(POS).forEach(function(id){
      var x = POS[id][0], y = POS[id][1], vert = POS[id][2]==='rama', w = vert ? 7 : 11, h = vert ? 11 : 7;   // Reparación va acostada
      var g = el('g', {class: 'ln-area', 'data-ln': id, filter: 'url(#lnSombra)'}, rod);
      el('rect', {x: x-w/2, y: y-h/2, width: w, height: h, rx: 1, fill: '#fff', stroke: COLOR[id], 'stroke-width': .35}, g);
      for(var i=1; i<8; i++){
        if(vert) el('line', {x1: x-w/2+.7, x2: x+w/2-.7, y1: y-h/2+i*h/8, y2: y-h/2+i*h/8, stroke: COLOR[id], 'stroke-width': .22, 'stroke-opacity': .8}, g);
        else el('line', {y1: y-h/2+.7, y2: y+h/2-.7, x1: x-w/2+i*w/8, x2: x-w/2+i*w/8, stroke: COLOR[id], 'stroke-width': .22, 'stroke-opacity': .8}, g);
      }
    });
    svg.addEventListener('click', function(ev){
      var a = ev.target.closest('[data-ln]'); if(a){ abrir(a.dataset.ln); return; }
      var v = ev.target.closest('[data-veh]'); if(v){ abrir(L.veh[v.dataset.veh].etapa); return; }
    });
    cargar(lista, false);
    if(!corriendo) arrancar();
    if(document.fonts) document.fonts.ready.then(function(){ if(L) dibujarLetreros(); });
  }

  function cajaArea(id){
    var x = POS[id][0], y = POS[id][1], lado = POS[id][2];
    if(lado==='arriba') return {x: x-13, y: y-9, w: 26, h: 26};
    if(lado==='abajo') return {x: x-11.5, y: y-17, w: 23, h: 26};
    if(lado==='lateral') return {x: x-14, y: y-14, w: 28, h: 19};
    return {x: x-6, y: y-8, w: 26, h: 16};
  }
  function lugares(id){
    var x = POS[id][0], y = POS[id][1], lado = POS[id][2], res = [];
    if(lado==='arriba') [7.5, 13.5].forEach(function(fy){ [-7, 0, 7].forEach(function(fx){ res.push([x+fx, y+fy]) }) });
    else if(lado==='abajo') [-7.5, -13.5].forEach(function(fy){ [-6.5, 0, 6.5].forEach(function(fx){ res.push([x+fx, y+fy]) }) });
    else if(lado==='lateral') [-7, 0, 7].forEach(function(fx){ res.push([x+fx, y-8]) });
    else [1, 5.2].forEach(function(fy){ [8, 14].forEach(function(fx){ res.push([x+fx, y+fy]) }) });
    return res;
  }
  var GIRO = {arriba: 0, abajo: 180, rama: 90, lateral: 0};
  function atender(h){ return h.faltantes || h.no_paso }

  // ---------------------------------------------------------------- Datos
  function cargar(lista, animar){
    L.lista = lista;
    var vivos = {};
    lista.forEach(function(h){
      vivos[h.id] = true;
      var v = L.veh[h.id];
      if(!v){
        // Uno nuevo entra por el principio de la banda y se acomoda en su área
        v = L.veh[h.id] = {id: h.id, etapa: h.etapa};
        v.g = motocarro(h);
        var ini = animar ? [6, 0] : lugares(h.etapa)[0];
        v.x = ini[0]; v.y = ini[1]; v.r = 0;
      }
      v.h = h;
      if(v.etapa !== h.etapa){ v.ir = ruta(v.etapa, h.etapa); v.anim = true; v.etapa = h.etapa; }
      v.g.querySelector('.ln-aro').setAttribute('opacity', atender(h) ? 1 : 0);
    });
    Object.keys(L.veh).forEach(function(id){
      if(vivos[id]) return;
      var v = L.veh[id];
      // Salió de producción (regresó a En espera de armado): se va por el principio de la banda y desaparece
      if(animar && v.etapa==='armado'){ v.ir = [p('armado'), [6, 0]]; v.anim = true; v.borrar = true; v.etapa = 'fuera'; }
      else { v.g.remove(); delete L.veh[id]; }
    });
    acomodar(animar);
    dibujarLetreros(); pintarPanel();
  }
  function refrescar(){
    if(!L || !document.body.contains(L.caja)) return;
    H.rpc('inv_produccion', {p_bodega: E.verBodega}).then(function(l){ cargar(l, true) })
      .catch(function(err){ H.prod.aviso('No se pudo', H.mensaje(err)); });
  }
  function acomodar(animar){
    Object.keys(POS).forEach(function(id){
      var ls = lugares(id);
      var vs = Object.keys(L.veh).map(function(k){ return L.veh[k] }).filter(function(v){ return v.etapa===id && !v.borrar })
        .sort(function(a, b){ return (atender(b.h)?1:0) - (atender(a.h)?1:0) || String(a.h.etapa_desde).localeCompare(String(b.h.etapa_desde)) });
      vs.forEach(function(v, i){
        v.g.style.display = i < ls.length ? '' : 'none';
        if(v.anim) return;   // al llegar a su estación se acomoda en su lugar
        var dest = ls[i % ls.length];
        if(animar) v.ir = [dest.slice()];
        else { v.x = dest[0]; v.y = dest[1]; v.r = GIRO[POS[id][2]]; poner(v); }
      });
    });
  }
  function motocarro(h){
    var c = H.prod.colorHex(h.color_id) || '#bbb';
    var g = el('g', {class: 'ln-veh', 'data-veh': h.id, filter: 'url(#lnSombraVeh)'}, L.capaVeh);
    el('rect', {x: -2.5, y: -1.2, width: 5, height: 2.4, rx: .5, fill: '#3a3a3d'}, g);
    el('rect', {x: -2.4, y: -1.15, width: 2.9, height: 2.3, rx: .35, fill: h.especial ? '#f7f7f4' : c, stroke: 'rgba(0,0,0,.18)', 'stroke-width': .12}, g);
    el('rect', {x: .7, y: -1, width: 1.75, height: 2, rx: .55, fill: c, stroke: 'rgba(0,0,0,.18)', 'stroke-width': .12}, g);
    el('rect', {x: 1.95, y: -.75, width: .32, height: 1.5, rx: .15, fill: '#cfe4ff'}, g);
    el('circle', {class: 'ln-aro', r: 3.3, fill: 'none', stroke: '#e5533d', 'stroke-width': .4, 'stroke-dasharray': '1 .6', opacity: 0}, g);
    return g;
  }
  function poner(v){ v.g.setAttribute('transform', 'translate('+v.x+' '+v.y+') rotate('+v.r+')') }
  function arrancar(){
    corriendo = true;
    var antes = performance.now();
    function paso(ahora){
      var dt = Math.min((ahora - antes)/1000, .05); antes = ahora;
      if(L && document.body.contains(L.caja)) Object.keys(L.veh).forEach(function(k){
        var v = L.veh[k]; if(!v.ir || !v.ir.length) return;
        var t = v.ir[0], dx = t[0]-v.x, dy = t[1]-v.y, d = Math.hypot(dx, dy), vel = 38*dt;
        if(d > .05){ var ang = Math.atan2(dy, dx)*180/Math.PI, dif = ((ang - v.r + 540) % 360) - 180; v.r += dif*Math.min(1, dt*14); }
        if(d <= vel){
          v.x = t[0]; v.y = t[1]; v.ir.shift();
          if(!v.ir.length){
            if(v.borrar){ v.g.remove(); delete L.veh[k]; return; }
            v.r = GIRO[POS[v.etapa][2]]; if(v.anim){ v.anim = false; acomodar(true); }
          }
        } else { v.x += dx/d*vel; v.y += dy/d*vel; }
        poner(v);
      });
      requestAnimationFrame(paso);
    }
    requestAnimationFrame(paso);
  }

  // ---------------------------------------------------------------- Letreros (nombre y conteo; en rojo los que hay que atender)
  function dibujarLetreros(){
    if(!L) return;
    var capa = L.letreros; capa.innerHTML = '';
    Object.keys(POS).forEach(function(id){
      var c = cajaArea(id), lado = POS[id][2], g = el('g', {class: 'ln-area', 'data-ln': id}, capa), n, rojos = 0, txtRojo = '';
      var vs = L.lista.filter(function(h){ return h.etapa===id }); n = vs.length;
      var f = vs.filter(function(h){ return h.faltantes }).length, np = vs.filter(function(h){ return h.no_paso }).length;
      if(f){ rojos = f; txtRojo = f + (f>1 ? ' faltan' : ' falta'); }
      else if(np){ rojos = np; txtRojo = np + (np>1 ? ' no pasaron' : ' no pasó'); }
      var rama = lado==='rama', lat = lado==='lateral';
      var x0 = rama ? POS[id][0] + 4.6 : c.x + 1.2, y0 = rama ? c.y + 3.4 : lat ? c.y - 1.5 : lado==='abajo' ? c.y + c.h + 3.2 : c.y - 2;
      var t = el('text', {class: 'ln-nombre', x: x0, y: y0}, g); t.textContent = H.prod.etapa(id).corto || nombreEtapa(id);
      var cx = x0 + t.getComputedTextLength() + 2.2;
      el('rect', {x: cx-1.7, y: y0-2.35, width: 3.4, height: 3, rx: 1.5, class: n ? 'ln-pill' : 'ln-pill cero'}, g);
      el('text', {class: 'ln-cuenta', x: cx, y: y0-.85}, g).textContent = n;
      if(rojos){
        // Abajo no cabe a un lado (se encima con el de junto): va en un segundo renglón
        var w = txtRojo.length * .78 + 1.6, rx = lado==='abajo' ? x0 : cx + 2.6, ry = lado==='abajo' ? y0 + 1.6 : y0 - 2.35;
        el('rect', {x: rx, y: ry, width: w, height: 3, rx: 1.5, fill: '#e5533d'}, g);
        el('text', {class: 'ln-falta', x: rx + w/2, y: ry + 1.5}, g).textContent = txtRojo;
      }
      var sub = lat ? 'no pasaron la revisión' : rama ? 'solo especiales' : id==='revision' ? 'mecánica y activación' : '';
      if(sub) el('text', {class: 'ln-sub', x: x0, y: y0+2.1}, g).textContent = sub;
      // Si hay más vehículos de los que caben dibujados, "+N" en la esquina del área
      var ocultos = n - lugares(id).length;
      if(ocultos > 0){
        var tx = '+'+ocultos, ww = tx.length * 1.2 + 2, bx = c.x + c.w - ww - .8, by = lado==='abajo' ? c.y + .8 : c.y + c.h - 3.8;
        el('rect', {x: bx, y: by, width: ww, height: 3, rx: 1.5, class: 'ln-mas'}, g);
        el('text', {class: 'ln-mas-t', x: bx + ww/2, y: by + 1.5}, g).textContent = tx;
      }
    });
    L.svg.querySelectorAll('.ln-area').forEach(function(a){ a.classList.toggle('sel', a.dataset.ln===L.abierta) });
  }

  // ---------------------------------------------------------------- Panel de arriba: los vehículos del área con sus pasos
  function abrir(id){ L.abierta = (L.abierta===id ? null : id); dibujarLetreros(); pintarPanel(); }
  function alTerminar(id, msg){ H.prod.refrescarCuentas(); if(msg) H.avisar(msg); refrescar(); }
  function pintarPanel(){
    if(!L || !L.panel) return;
    var id = L.abierta, P = H.prod, escribe = H.puedeEscribir();
    // Sin área abierta no se muestra nada: la pista "Pica un área…" quitaba espacio (pedido del usuario, 26-nov-2026)
    L.panel.hidden = !id;
    if(!id){ L.panel.innerHTML = ''; return; }
    var html = '<div class="ln-cab"><span class="ln-ico" style="background:'+COLOR[id]+'"></span><b>'+esc(nombreEtapa(id))+'</b>';
    var vs = L.lista.filter(function(h){ return h.etapa===id })
      .sort(function(a, b){ return (atender(b)?1:0) - (atender(a)?1:0) || String(a.etapa_desde).localeCompare(String(b.etapa_desde)) });
    html += '<small>'+vs.length+(vs.length===1 ? ' vehículo' : ' vehículos')+'</small><button type="button" class="t-x" data-lp="cerrar" aria-label="Cerrar">✕</button></div>';
    // La producción empieza en Armado: de aquí se mete un vehículo de una orden
    if(id==='armado' && escribe) html += '<div class="botones" style="margin:0 0 6px"><button type="button" class="btn prin" data-lp="entrar">+ Entrar a producción</button></div>';
    if(!vs.length) html += '<p class="ln-pista">No hay vehículos en esta área.</p>';
    html += '<div class="ln-filas">'+vs.map(function(h){
      var r = P.rutaDe(h), i = P.indice(h), sig = P.siguiente(h), ant = P.anterior(h);
      // Pasos: el anterior regresa, el siguiente avanza (pedido del usuario: poder seleccionar los pasos)
      var pasos = r.map(function(x, k){
        var cl = k < i ? 'hecho' : k===i ? (atender(h) ? 'ahora falta' : 'ahora') : '';
        var accion = !escribe ? '' : (k===i-1 ? 'regresar' : (k===i+1 && !atender(h) && h.etapa!=='revision' && h.etapa!=='revision_final' && !(h.etapa==='armado' && !h.serie) ? 'avanzar' : ''));
        return '<button type="button" class="ln-paso '+cl+(accion ? ' accion' : '')+'" '+(accion ? 'data-lp="'+accion+'" data-id="'+h.id+'" title="'+(accion==='regresar' ? 'Regresar a '+esc(x.nombre) : 'Pasar a '+esc(x.nombre))+'"' : 'disabled')+'>'+
          (k < i ? '✓ ' : '')+esc(x.nombre)+'</button>';
      }).join('<span class="ln-sep">›</span>');
      var t = P.textoPaso(h), bot = '';
      if(escribe){
        if(t) bot += '<button type="button" class="btn prin" data-lp="paso" data-id="'+h.id+'">'+esc(t)+'</button>';
        if(h.etapa==='revision_final' && !h.faltantes) bot += '<button type="button" class="btn" data-lp="nopasa" data-id="'+h.id+'">No pasa</button>';
        bot += '<button type="button" class="btn" data-lp="regresar" data-id="'+h.id+'">↩ Regresar a '+esc(ant ? ant.nombre : 'En espera de armado')+'</button>';
      }
      bot += '<button type="button" class="btn" data-lp="ficha" data-id="'+h.id+'">Ver ficha</button>';
      return '<div class="ln-vh'+(atender(h) ? ' atender' : '')+'"><div class="ln-vh-1"><span class="pt" style="background:'+(P.colorHex(h.color_id)||'#bbb')+'"></span>'+
        '<b>'+esc(P.idVeh(h))+'</b><span class="ln-n">'+esc(P.nombreVeh(h))+' · '+P.paraDe(h)+(h.venta && h.venta.especial_que ? ' · '+esc(h.venta.especial_que) : '')+'</span>'+
        (h.faltantes ? '<span class="etq rojo chica">Faltan piezas</span>' : '')+(h.no_paso ? '<span class="etq rojo chica">No pasó la revisión final</span>' : '')+(h.mecanica_pendiente ? '<span class="etq pend chica">Falta mecánica</span>' : '')+
        '<span class="dias">'+esc(P.dias(h.etapa_desde))+'</span></div>'+
        '<div class="ln-pasos">'+pasos+'</div><div class="botones">'+bot+'</div></div>';
    }).join('')+'</div>';
    L.panel.innerHTML = html;
  }
  function alClicPanel(ev){
    var b = ev.target.closest('[data-lp]'); if(!b) return;
    var a = b.dataset.lp, P = H.prod, h = L.lista.filter(function(x){ return x.id===+b.dataset.id })[0];
    if(a==='cerrar'){ L.abierta = null; dibujarLetreros(); pintarPanel(); return; }
    if(a==='entrar'){ P.entrar(null, function(){ refrescar() }); return; }
    if(!h) return;
    if(a==='ficha'){ P.abrirFichaVeh(h.id); return; }
    if(a==='paso'){ b.disabled = true; P.pasoPrincipal(h, alTerminar); return; }
    if(a==='avanzar'){ b.disabled = true; P.avanzar(h, {}, alTerminar); return; }
    if(a==='nopasa'){ P.noPasa(h, alTerminar); return; }
    if(a==='regresar'){ P.regresar(h, alTerminar); return; }
  }

  H.linea = {dibujar: dibujar, refrescar: refrescar};
})();
