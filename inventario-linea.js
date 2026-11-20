/* Producción vista como línea (21-nov-2026). Viene del prototipo prototipos/linea-produccion-svg.html, que el usuario escogió.
   Banda en U vista desde arriba, solo SVG (sin librerías): arriba En espera de armado, Armado, Revisión 1 y Mecánica;
   abajo, de derecha a izquierda, Detallado y pintura, Revisión final y Listo. Herrería y Forrado son una rama aparte
   (por fuera, a la derecha) que sale después de Mecánica y vuelve en Detallado y pintura.
   Junto a cada estación hay un área con su nombre y conteo; al picarla se abre una tarjeta con sus vehículos y el botón
   para pasarlos a la siguiente etapa (el motocarro recorre la banda). */
(function(){
  var H = window.InventarioApp._h, E = H.E, esc = H.esc;
  var NS = 'http://www.w3.org/2000/svg';
  // Posición de cada estación sobre la banda
  var POS = {
    espera: [12,0,'arriba'], armado: [37,0,'arriba'], revision1: [62,0,'arriba'], mecanica: [87,0,'arriba'],
    herreria: [120,11,'rama'], forrado: [120,29,'rama'],
    detallado: [87,40,'abajo'], revision_final: [62,40,'abajo'], listo: [37,40,'abajo']
  };
  var COLOR = {espera:'#4b63d6', armado:'#f08a4b', revision1:'#26a889', mecanica:'#e0a92c', herreria:'#6c7a91', forrado:'#9a6ee0',
    detallado:'#e7698a', revision_final:'#3f9f5d', listo:'#7d848e'};
  function ruta(a, b){
    var p = function(id){ return POS[id].slice(0, 2) };
    var R = {
      'espera>armado': [p('espera'), p('armado')], 'armado>revision1': [p('armado'), p('revision1')], 'revision1>mecanica': [p('revision1'), p('mecanica')],
      'mecanica>detallado': [p('mecanica'), [100,0], [100,40], p('detallado')],
      'mecanica>herreria': [p('mecanica'), [100,0], [120,0], p('herreria')], 'herreria>forrado': [p('herreria'), p('forrado')],
      'forrado>detallado': [p('forrado'), [120,40], [100,40], p('detallado')],
      'detallado>revision_final': [p('detallado'), p('revision_final')], 'revision_final>listo': [p('revision_final'), p('listo')]
    };
    return (R[a+'>'+b] || []).map(function(x){ return x.slice() });
  }
  function nombreEtapa(id){ return id==='espera' ? 'En espera de armado' : H.prod.etapa(id).nombre }
  function el(tag, attrs, padre){ var n = document.createElementNS(NS, tag); for(var k in attrs) n.setAttribute(k, attrs[k]); if(padre) padre.appendChild(n); return n; }

  var L = null;   // la línea en pantalla
  var corriendo = false;   // un solo ciclo de animación para toda la vida de la página

  function dibujar(caja, lista){
    L = {caja: caja, veh: {}, abierta: null};
    var svg = el('svg', {viewBox: '-16 -16 160 76', class: 'linea', role: 'img', 'aria-label': 'Línea de producción'});
    caja.appendChild(svg); L.svg = svg;
    var defs = el('defs', {}, svg);
    defs.innerHTML = '<filter id="lnSombra" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy=".35" stdDeviation=".45" flood-color="#000" flood-opacity=".14"/></filter>'+
      '<filter id="lnSombraVeh" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy=".25" stdDeviation=".25" flood-color="#000" flood-opacity=".25"/></filter>';
    L.areas = el('g', {}, svg); var banda = el('g', {}, svg); var rod = el('g', {}, svg);
    L.capaVeh = el('g', {}, svg); L.letreros = el('g', {}, svg);

    Object.keys(POS).forEach(function(id){
      var c = cajaArea(id), g = el('g', {class: 'ln-area', 'data-ln': id}, L.areas);
      el('rect', {class: 'fondo', x: c.x, y: c.y, width: c.w, height: c.h, rx: 2.2, fill: COLOR[id], 'fill-opacity': .13}, g);
      el('rect', {class: 'orilla', x: c.x, y: c.y, width: c.w, height: c.h, rx: 2.2, fill: 'none', stroke: COLOR[id], 'stroke-opacity': .45, 'stroke-width': .25,
        'stroke-dasharray': POS[id][2]==='rama' ? '1 .7' : 'none'}, g);
    });
    var U = 'M -6 0 H 100 V 40 H 3', RAMA = 'M 100 0 H 120 V 40 H 100';
    el('path', {d: RAMA, fill: 'none', stroke: '#2c5f6c', 'stroke-width': 4.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'stroke-opacity': .85, filter: 'url(#lnSombra)'}, banda);
    el('path', {d: U, fill: 'none', stroke: '#2c5f6c', 'stroke-width': 4.2, 'stroke-linejoin': 'round', filter: 'url(#lnSombra)'}, banda);
    el('path', {d: 'M 3.2 36.4 L -3.5 40 L 3.2 43.6 Z', fill: '#2c5f6c'}, banda);
    el('path', {class: 'ln-flujo', d: U}, banda);
    el('path', {class: 'ln-flujo', d: RAMA}, banda);
    Object.keys(POS).forEach(function(id){
      var x = POS[id][0], y = POS[id][1], vert = POS[id][2]==='rama', w = vert ? 7 : 11, h = vert ? 11 : 7;
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
      cerrar();
    });
    if(!L.tarjeta){ L.tarjeta = document.createElement('div'); L.tarjeta.className = 'ln-tarjeta'; L.tarjeta.setAttribute('role', 'dialog'); }
    caja.appendChild(L.tarjeta);
    L.tarjeta.addEventListener('click', alClicTarjeta);
    cargar(lista, false);
    if(!corriendo) arrancar();
    if(document.fonts) document.fonts.ready.then(function(){ if(L) dibujarLetreros(); });
  }

  function cajaArea(id){
    var x = POS[id][0], y = POS[id][1], lado = POS[id][2];
    if(lado==='arriba') return {x: x-11.5, y: y-9, w: 23, h: 26};
    if(lado==='abajo') return {x: x-11.5, y: y-17, w: 23, h: 26};
    return {x: x-6, y: y-8, w: 26, h: 16};
  }
  function lugares(id){
    var x = POS[id][0], y = POS[id][1], lado = POS[id][2], res = [];
    if(lado==='arriba') [7.5, 13.5].forEach(function(fy){ [-6.5, 0, 6.5].forEach(function(fx){ res.push([x+fx, y+fy]) }) });
    else if(lado==='abajo') [-7.5, -13.5].forEach(function(fy){ [-6.5, 0, 6.5].forEach(function(fx){ res.push([x+fx, y+fy]) }) });
    else [1, 5.2].forEach(function(fy){ [8, 14].forEach(function(fx){ res.push([x+fx, y+fy]) }) });
    return res;
  }
  var GIRO = {arriba: 0, abajo: 180, rama: 90};

  // ---------------------------------------------------------------- Datos: vehículos y lo que hay en espera
  // animar = true: los que cambiaron de etapa recorren la banda; los nuevos salen de En espera de armado.
  function cargar(lista, animar){
    L.lista = lista;
    var vivos = {};
    lista.forEach(function(h){
      vivos[h.id] = true;
      var v = L.veh[h.id];
      if(!v){
        v = L.veh[h.id] = {id: h.id, etapa: animar ? 'espera' : h.etapa};
        v.g = motocarro(h);
        var ini = animar ? POS.espera : lugares(h.etapa)[0];
        v.x = ini[0]; v.y = ini[1]; v.r = 0;
      }
      v.h = h;
      if(v.etapa !== h.etapa){ v.ir = ruta(v.etapa, h.etapa); v.anim = true; v.etapa = h.etapa; }
      v.g.querySelector('.ln-aro').setAttribute('opacity', h.faltantes ? 1 : 0);
    });
    Object.keys(L.veh).forEach(function(id){ if(!vivos[id]){ L.veh[id].g.remove(); delete L.veh[id]; } });
    acomodar(animar);
    H.rpc('inv_espera_armado', {p_bodega: E.verBodega}).then(function(esp){ L.espera = esp; dibujarLetreros(); if(L.abierta) abrir(L.abierta); })
      .catch(function(){ L.espera = []; dibujarLetreros(); });
    dibujarLetreros();
  }
  function refrescar(){
    if(!L || !document.body.contains(L.caja)) return;
    H.rpc('inv_produccion', {p_bodega: E.verBodega}).then(function(l){ cargar(l, true); if(L.abierta) abrir(L.abierta); })
      .catch(function(err){ H.prod.aviso('No se pudo', H.mensaje(err)); });
  }

  function acomodar(animar){
    Object.keys(POS).forEach(function(id){
      var ls = lugares(id);
      var vs = Object.keys(L.veh).map(function(k){ return L.veh[k] }).filter(function(v){ return v.etapa===id })
        .sort(function(a, b){ return (b.h.faltantes?1:0) - (a.h.faltantes?1:0) || String(a.h.etapa_desde).localeCompare(String(b.h.etapa_desde)) });
      vs.forEach(function(v, i){
        v.g.style.display = i < ls.length ? '' : 'none';
        var dest = ls[i % ls.length];
        if(v.anim) return;   // al llegar a su estación se acomoda en su lugar
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
    el('circle', {class: 'ln-aro', r: 3.3, fill: 'none', stroke: '#e5533d', 'stroke-width': .35, 'stroke-dasharray': '1 .6', opacity: 0}, g);
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
        if(d <= vel){ v.x = t[0]; v.y = t[1]; v.ir.shift(); if(!v.ir.length){ v.r = GIRO[POS[v.etapa][2]]; if(v.anim){ v.anim = false; acomodar(true); } } }
        else { v.x += dx/d*vel; v.y += dy/d*vel; }
        poner(v);
      });
      requestAnimationFrame(paso);
    }
    requestAnimationFrame(paso);
  }

  // ---------------------------------------------------------------- Letreros: nombre y conteo de cada área
  function dibujarLetreros(){
    if(!L) return;
    var capa = L.letreros; capa.innerHTML = '';
    Object.keys(POS).forEach(function(id){
      var c = cajaArea(id), lado = POS[id][2], g = el('g', {class: 'ln-area', 'data-ln': id}, capa), n, falta = 0;
      if(id==='espera') n = (L.espera||[]).reduce(function(s, x){ return s + (+x.cantidad||0) }, 0);
      else { var vs = L.lista.filter(function(h){ return h.etapa===id }); n = vs.length; falta = vs.filter(function(h){ return h.faltantes }).length; }
      var rama = lado==='rama', x0 = rama ? POS[id][0] + 4.6 : c.x + 1.2, y0 = rama ? c.y + 3.4 : lado==='abajo' ? c.y + c.h + 3.2 : c.y - 2;
      var t = el('text', {class: 'ln-nombre', x: x0, y: y0}, g); t.textContent = id==='espera' ? 'En espera' : nombreEtapa(id);
      var cx = x0 + t.getComputedTextLength() + 2.2;
      el('rect', {x: cx-1.7, y: y0-2.35, width: 3.4, height: 3, rx: 1.5, class: n ? 'ln-pill' : 'ln-pill cero'}, g);
      el('text', {class: 'ln-cuenta', x: cx, y: y0-.85}, g).textContent = n;
      if(falta){
        cx += 2.6;
        el('rect', {x: cx, y: y0-2.35, width: 7.4, height: 3, rx: 1.5, fill: '#e5533d'}, g);
        el('text', {class: 'ln-falta', x: cx+3.7, y: y0-.85}, g).textContent = falta + (falta>1 ? ' faltan' : ' falta');
      }
      if(rama || id==='espera') el('text', {class: 'ln-sub', x: x0, y: y0+2.1}, g).textContent = id==='espera' ? 'de armado' : 'solo especiales';
    });
    L.svg.querySelectorAll('.ln-area').forEach(function(a){ a.classList.toggle('sel', a.dataset.ln===L.abierta) });
  }

  // ---------------------------------------------------------------- Tarjeta flotante con los vehículos del área
  function abrir(id){
    L.abierta = id;
    L.svg.querySelectorAll('.ln-area').forEach(function(a){ a.classList.toggle('sel', a.dataset.ln===id) });
    var color = COLOR[id], html = '<div class="t-cab"><div class="t-ico" style="background:'+color+'22"><i style="background:'+color+'"></i></div><div><h2>'+esc(nombreEtapa(id))+'</h2>';
    var escribe = H.puedeEscribir();
    if(id==='espera'){
      var esp = L.espera || [], n = esp.reduce(function(s, x){ return s + (+x.cantidad||0) }, 0);
      html += '<small>'+n+' por armar</small></div><button type="button" class="t-x" data-ln-cerrar aria-label="Cerrar">✕</button></div><div class="t-lista">'+
        (esp.length ? esp.map(function(x){
          return '<div class="ln-esp"><span class="pt" style="background:'+(H.prod.colorHex(x.color_id)||'#bbb')+'"></span><span>'+esc(H.prod.nombreVeh(x))+
            (E.rol!=='bodega' && !E.verBodega ? ' · '+esc(H.nombreBodega(x.bodega)) : '')+'</span><b>'+x.cantidad+'</b></div>' }).join('')
          : '<div class="t-vacio">No hay vehículos en espera. Aparecen cuando se revisa un contenedor.</div>')+
        (escribe && esp.length ? '<div class="botones"><button type="button" class="btn prin" data-ln-entrar>+ Entrar a producción</button></div>' : '')+'</div>';
    } else {
      var vs = L.lista.filter(function(h){ return h.etapa===id })
        .sort(function(a, b){ return (b.faltantes?1:0) - (a.faltantes?1:0) || String(a.etapa_desde).localeCompare(String(b.etapa_desde)) });
      html += '<small>'+vs.length+(vs.length===1 ? ' vehículo' : ' vehículos')+'</small></div><button type="button" class="t-x" data-ln-cerrar aria-label="Cerrar">✕</button></div><div class="t-lista">';
      if(!vs.length) html += '<div class="t-vacio">No hay vehículos en esta área.</div>';
      html += vs.map(function(h){
        var sig = H.prod.siguiente(h), bot = '';
        if(escribe){
          if(h.faltantes) bot = '<button type="button" class="btn prin" data-ln-falt="'+h.id+'">✓ Ya se pusieron las piezas</button>';
          else if(id==='revision1') bot = '<button type="button" class="btn prin" data-ln-rev1="'+h.id+'">Hacer la Revisión 1</button>';
          else if(id==='revision_final') bot = '<button type="button" class="btn prin" data-ln-final="si" data-id="'+h.id+'">✓ Pasa</button><button type="button" class="btn" data-ln-final="no" data-id="'+h.id+'">No pasa</button>';
          else if(sig) bot = '<button type="button" class="btn prin" data-ln-mover="'+h.id+'">Pasar a '+esc(sig.nombre)+'</button>';
        }
        bot += '<button type="button" class="btn" data-ln-ficha="'+h.id+'">Ver ficha</button>';
        return '<div class="ln-vh"><div class="ln-vh-1"><span class="pt" style="background:'+(H.prod.colorHex(h.color_id)||'#bbb')+'"></span><b>Serie '+esc(h.serie)+'</b>'+
          (h.especial ? '<span class="etq azul chica">Especial</span>' : '')+(h.faltantes ? '<span class="etq rojo chica">Faltantes</span>' : '')+
          '<span class="dias">'+esc(H.prod.dias(h.etapa_desde))+'</span></div>'+
          '<div class="d">'+esc(H.prod.nombreVeh(h))+' · '+(h.venta ? 'Venta '+esc(h.venta.remision)+(h.venta.especial_que ? ' · '+esc(h.venta.especial_que) : '') : 'Showroom')+
          (E.rol!=='bodega' && !E.verBodega ? ' · '+esc(H.nombreBodega(h.bodega)) : '')+'</div>'+
          '<div class="botones">'+bot+'</div></div>';
      }).join('') + '</div>';
    }
    L.tarjeta.innerHTML = html;
    colocar(id);
    L.tarjeta.classList.add('abierta');
  }
  function colocar(id){
    var c = cajaArea(id), m = L.svg.getScreenCTM(), pt = L.svg.createSVGPoint();
    pt.x = c.x + c.w; pt.y = c.y; var s = pt.matrixTransform(m);
    var W = innerWidth, Hh = innerHeight, tw = Math.min(400, W - 20), th = L.tarjeta.offsetHeight || 300;
    var x = s.x + 12, y = s.y;
    if(x + tw > W - 16){ pt.x = c.x; x = pt.matrixTransform(m).x - tw - 12; }
    x = Math.max(12, Math.min(x, W - tw - 12)); y = Math.max(12, Math.min(y, Hh - th - 12));
    L.tarjeta.style.left = x+'px'; L.tarjeta.style.top = y+'px';
  }
  function cerrar(){
    if(!L) return;
    L.abierta = null; L.tarjeta.classList.remove('abierta');
    L.svg.querySelectorAll('.ln-area').forEach(function(a){ a.classList.remove('sel') });
  }
  function alClicTarjeta(ev){
    var b = ev.target.closest('button'); if(!b) return;
    var P = H.prod;
    if(b.hasAttribute('data-ln-cerrar')){ cerrar(); return; }
    if(b.hasAttribute('data-ln-entrar')){ P.entrar(null, refrescar); return; }
    if(b.dataset.lnFicha){ cerrar(); P.abrirFichaVeh(+b.dataset.lnFicha); return; }
    if(b.dataset.lnMover){ b.disabled = true; P.avanzar(+b.dataset.lnMover, {}, refrescar); return; }
    if(b.dataset.lnRev1){ P.revision1(+b.dataset.lnRev1, refrescar); return; }
    if(b.dataset.lnFalt){
      b.disabled = true;
      H.rpc('inv_vehiculo_faltantes_listos', {p_id: +b.dataset.lnFalt}).then(function(){ P.refrescarCuentas(); refrescar(); })
        .catch(function(err){ P.aviso('No se pudo', H.mensaje(err)); });
      return;
    }
    if(b.dataset.lnFinal){
      var id = +b.dataset.id;
      if(b.dataset.lnFinal==='si'){ b.disabled = true; P.avanzar(id, {pasa: true}, refrescar); }
      else H.pedirTexto({titulo: '¿Por qué no pasa?', ayuda: 'Se queda en revisión final hasta que se corrija', etiqueta: 'Qué hay que corregir', largo: true,
        boton: 'Guardar', falta: 'Escribe qué hay que corregir.'}).then(function(t){ if(t!=null) P.avanzar(id, {pasa: false, nota: t}, refrescar); });
    }
  }
  addEventListener('resize', function(){ if(L && L.abierta && document.body.contains(L.caja)) colocar(L.abierta); });
  document.addEventListener('keydown', function(e){ if(e.key==='Escape' && L && L.abierta && !document.querySelector('.hoja.abierta')) cerrar(); });

  H.linea = {dibujar: dibujar, refrescar: refrescar};
})();
