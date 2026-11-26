/* Mapa de la bodega (26-nov-2026). Viene de la propuesta prototipos/bodega-mapa.html, que el usuario pidió como inicio de las bodegas.
   La bodega vista desde arriba (solo SVG): afuera el camión en la puerta del andén (Recibir contenedor), adentro los
   contenedores por contar, el inventario, la línea de producción y el mostrador (ventas), con datos reales y su conteo.
   Al picar un área, su pantalla de siempre se abre ENCIMA del mapa, en un panel con pestañas (no saca de la pantalla
   principal; ✕, el fondo, Esc o "atrás" regresan al mapa). Solo en pantallas de 900 px o más; en chicas, el menú normal. */
(function(){
  var H = window.InventarioApp._h, E = H.E, esc = H.esc, q = H.q;
  var NS = 'http://www.w3.org/2000/svg';
  var ANCHO_MIN = 900;
  function cabe(){ return window.innerWidth >= ANCHO_MIN }
  H.mapaCabe = cabe;

  // Área del mapa -> pantalla que abre
  var ZONAS = {
    recibir:      {nombre: 'Recibir', sub: 'contenedor', color: '#e0a92c', sec: 'recibir'},
    contenedores: {nombre: 'Contenedores por contar', color: '#4b63d6', sec: 'contenedores'},
    inventario:   {nombre: 'Inventario', color: '#26a889', sec: 'vehiculos'},
    linea:        {nombre: 'Línea de producción', color: '#f08a4b', sec: 'produccion'},
    mostrador:    {nombre: 'Ventas', color: '#e7698a', sec: 'ventas'}
  };
  var CAJAS = {
    recibir: {x: 38, y: 7, w: 24, h: 44}, contenedores: {x: 64, y: 7, w: 50, h: 44}, inventario: {x: 116, y: 7, w: 78, h: 44},
    linea: {x: 38, y: 55, w: 96, h: 50}, mostrador: {x: 136, y: 55, w: 58, h: 50}
  };
  var COL_LINEA = ['#f08a4b', '#26a889', '#6c7a91', '#9a6ee0', '#e0a92c', '#e7698a', '#3f9f5d', '#7d848e'];
  var CONT_COLORES = ['#4b63d6', '#e0793c', '#2a9d8f', '#7a5cc4', '#c4512f', '#3f9f5d'];

  function el(tag, attrs, padre){ var n = document.createElementNS(NS, tag); for(var k in attrs) n.setAttribute(k, attrs[k]); if(padre) padre.appendChild(n); return n; }
  function menosMov(){ return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches }
  function colorDe(id){ return (H.prod && H.prod.colorHex(id)) || '#b9bcc2' }

  // ---------------------------------------------------------------- Lugar del mapa y del panel en la página
  var M = {sobre: false, datos: null};   // sobre: las pantallas se abren encima del mapa
  function partes(){
    var inv = q('.inv', E.raiz); if(!inv) return null;
    var mapa = q('.inv-mapa', inv), panel = q('.inv-panel', inv), main = q('.inv-main', inv);
    if(!mapa){
      mapa = document.createElement('div'); mapa.className = 'inv-mapa'; inv.insertBefore(mapa, main);
      var velo = document.createElement('div'); velo.className = 'inv-velo'; inv.insertBefore(velo, main);
      velo.addEventListener('click', cerrarPanel);
      panel = document.createElement('div'); panel.className = 'inv-panel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Pantalla abierta sobre el mapa');
      panel.innerHTML = '<div class="mp-cab"><div class="mp-pest" role="tablist"></div><button type="button" class="mp-x" aria-label="Regresar al mapa">✕</button></div>';
      inv.insertBefore(panel, main); panel.appendChild(main);
      q('.mp-x', panel).addEventListener('click', cerrarPanel);
      panel.addEventListener('click', function(e){ var t = e.target.closest('[data-mp-sec]'); if(t) H.ir(t.dataset.mpSec); });
    }
    return {inv: inv, mapa: mapa, panel: panel, main: main};
  }

  // Al cambiar de pantalla: el mapa se queda abajo y la pantalla se abre encima, o todo vuelve a la normalidad
  H.alIr.push(function(id, antes){
    var p = partes(); if(!p) return;
    if(id==='mapa') M.sobre = cabe();
    var encima = M.sobre && id!=='mapa' && cabe();
    p.inv.classList.toggle('en-mapa', id==='mapa');
    p.inv.classList.toggle('sobre-mapa', encima);
    p.inv.classList.toggle('con-mapa', id==='mapa' || encima);
    if(encima){
      pestanas(id);
      // "Atrás" del navegador regresa al mapa
      if(!(history.state && history.state.invPanel)) history.pushState(Object.assign({}, history.state, {invPanel: true}), '');
      p.panel.scrollTop = 0;
      setTimeout(function(){ var x = q('.mp-pest [aria-selected="true"]', p.panel) || q('.mp-x', p.panel); if(x) x.focus({preventScroll: true}); }, 30);
    }
    if(id!=='mapa' && !encima) M.sobre = false;
  });
  function cerrarPanel(){
    if(history.state && history.state.invPanel) history.back();
    else H.ir('mapa');
  }
  window.addEventListener('popstate', function(){
    var p = E.raiz && q('.inv.sobre-mapa', E.raiz);
    if(p && !(history.state && history.state.invPanel)) H.ir('mapa');
  });
  document.addEventListener('keydown', function(e){
    if(e.key!=='Escape' || !E.raiz || !q('.inv.sobre-mapa', E.raiz)) return;
    if(document.documentElement.classList.contains('hoja-on')) return;        // primero se cierra la lista abierta
    var insp = document.getElementById('insp'); if(insp && insp.classList.contains('on')) return;
    cerrarPanel();
  });
  // Pestañas del módulo (Contenedores: Recibir · Lista; Ventas: Nueva · Lista; Inventario: Vehículos · Piezas)
  function pestanas(id){
    var p = partes(), todas = H.secciones(), s = todas.filter(function(x){ return x.id===id })[0];
    var hermanas = s ? todas.filter(function(x){ return x.grupo===s.grupo }) : [];
    q('.mp-pest', p.panel).innerHTML = hermanas.length > 1 ? hermanas.map(function(x){
      var n = H.CUENTA[x.id];
      return '<button type="button" role="tab" aria-selected="'+(x.id===id)+'" data-mp-sec="'+x.id+'">'+esc(x.nombre)+(n ? ' <i>'+n+'</i>' : '')+'</button>';
    }).join('') : '<b class="mp-tit">'+esc(s ? s.nombre : '')+'</b>';
  }

  // ---------------------------------------------------------------- Dibujo
  H.DIBUJAR.mapa = function(main){
    main.innerHTML = '';
    var p = partes(); if(!p) return;
    if(!q('svg', p.mapa)) p.mapa.innerHTML = '<p class="inv-cargando">Cargando…</p>';
    medir();
    Promise.all([
      H.rpc('inv_contenedores', {p_bodega: E.verBodega}),
      H.rpc('inv_inventario', {p_bodega: E.verBodega}),
      H.rpc('inv_produccion', {p_bodega: E.verBodega}),
      H.rpc('inv_ventas', {p_bodega: E.verBodega})
    ]).then(function(r){
      if(E.seccion!=='mapa') return;
      M.datos = {cont: r[0].filter(function(c){ return c.estado==='recibido' }), inv: r[1], prod: r[2], ventas: r[3]};
      dibujar(p.mapa);
    }).catch(function(err){ p.mapa.innerHTML = '<p class="inv-error">'+esc(H.mensaje(err))+'</p>' });
  };
  function medir(){
    var p = partes(); if(!p || !p.inv.classList.contains('con-mapa')) return;
    var top = p.mapa.getBoundingClientRect().top;
    p.mapa.style.height = Math.max(420, window.innerHeight - Math.max(top, 0) - 16) + 'px';
  }
  window.addEventListener('resize', function(){
    if(!E.raiz) return; medir();
    // Si la ventana se achica con una pantalla encima del mapa, se queda la pantalla sola
    if(q('.inv.sobre-mapa', E.raiz) && !cabe()){ var p = partes(); p.inv.classList.remove('sobre-mapa', 'con-mapa'); M.sobre = false; }
  });

  function conteos(d){
    var espera = (d.inv.espera||[]).reduce(function(s, x){ return s + (+x.cantidad||0) }, 0);
    var piezasMal = (d.inv.piezas||[]).filter(function(x){ return +x.danadas > 0 || +x.disponibles < 0 }).length + (d.inv.faltantes||[]).length;
    var enLinea = d.prod.length, atender = d.prod.filter(function(h){ return h.faltantes || h.no_paso }).length;
    var porId = {};
    d.ventas.forEach(function(u){ (porId[u.id] = porId[u.id] || []).push(u) });
    var ventas = Object.keys(porId).filter(function(k){ return porId[k].some(function(u){ return u.estado_venta!=='lista' }) }).length;
    var porArmar = d.ventas.filter(function(u){ return u.estado_venta==='por_armar' }).length;
    return {recibir: {n: null}, contenedores: {n: d.cont.length}, inventario: {n: espera, alerta: piezasMal},
      linea: {n: enLinea, alerta: atender}, mostrador: {n: ventas, alerta: porArmar}};
  }

  function dibujar(caja){
    var d = M.datos, k = conteos(d);
    caja.innerHTML = '';
    var svg = el('svg', {viewBox: '0 0 200 112', preserveAspectRatio: 'xMidYMid meet', class: 'mapa-svg', role: 'img', 'aria-label': 'Mapa de la bodega'}, caja);
    el('defs', {}, svg).innerHTML =
      '<filter id="mpSombra" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy=".4" stdDeviation=".5" flood-color="#000" flood-opacity=".16"/></filter>'+
      '<filter id="mpSombraC" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy=".25" stdDeviation=".25" flood-color="#000" flood-opacity=".28"/></filter>'+
      '<pattern id="mpRayas" width="2" height="2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="1" height="2" fill="#e0a92c" fill-opacity=".35"/></pattern>';

    // Patio con su camino, piso y muros (puerta del andén a la izquierda y de clientes abajo)
    el('rect', {x: 0, y: 14, width: 34, height: 30, class: 'mp-camino'}, svg);
    for(var x = 2; x < 32; x += 6) el('rect', {x: x, y: 28.7, width: 3, height: .5, fill: '#fff', 'fill-opacity': .5}, svg);
    el('rect', {x: 36, y: 4, width: 160, height: 104, rx: 2, class: 'mp-piso', filter: 'url(#mpSombra)'}, svg);
    el('path', {d: 'M 36 18 V 4 H 196 V 108 H 176 M 158 108 H 36 V 40', class: 'mp-muro'}, svg);
    for(var y = 18.6; y < 40; y += 1.4) el('line', {x1: 35.5, x2: 36.5, y1: y, y2: y, class: 'mp-cortina'}, svg);
    el('path', {d: 'M 158 108 A 9 9 0 0 1 167 99 M 176 108 A 9 9 0 0 0 167 99', class: 'mp-abre'}, svg);
    el('line', {x1: 167, y1: 108, x2: 167, y2: 99, class: 'mp-hoja-puerta'}, svg);

    var capaZ = el('g', {}, svg), capaC = el('g', {}, svg), capaL = el('g', {}, svg);
    Object.keys(CAJAS).forEach(function(id){
      if(id==='recibir' && !H.puedeEscribir()) return;
      var c = CAJAS[id], z = ZONAS[id];
      var g = el('g', {class: 'mp-zona', 'data-zona': id, tabindex: 0, role: 'button', 'aria-label': z.nombre+(k[id].n!=null ? ': '+k[id].n : '')}, capaZ);
      el('rect', {class: 'fondo', x: c.x, y: c.y, width: c.w, height: c.h, rx: 2.4, fill: id==='recibir' ? 'url(#mpRayas)' : z.color, 'fill-opacity': id==='recibir' ? 1 : .12}, g);
      el('rect', {class: 'orilla', x: c.x, y: c.y, width: c.w, height: c.h, rx: 2.4, fill: 'none', stroke: z.color}, g);
    });

    // Camión con su contenedor, pegado a la puerta del andén
    if(H.puedeEscribir()){
      var cam = el('g', {class: 'mp-zona', 'data-zona': 'recibir', filter: 'url(#mpSombra)'}, capaC);
      el('rect', {x: 2.5, y: 22.8, width: 7, height: 12.4, rx: 1.6, fill: '#e8e6df', stroke: 'rgba(0,0,0,.2)', 'stroke-width': .15}, cam);
      el('rect', {x: 3.2, y: 23.8, width: 1.8, height: 10.4, rx: .6, fill: '#9cc3e6'}, cam);
      el('rect', {x: 9.8, y: 27.6, width: 1.2, height: 2.8, fill: '#55575c'}, cam);
      el('rect', {x: 11, y: 21.2, width: 24, height: 15.6, rx: .6, fill: '#c4512f', stroke: 'rgba(0,0,0,.25)', 'stroke-width': .15}, cam);
      for(var cx = 12.5; cx < 34.5; cx += 1.6) el('line', {x1: cx, x2: cx, y1: 21.6, y2: 36.4, stroke: '#000', 'stroke-opacity': .13, 'stroke-width': .25}, cam);
      var pat = el('g', {filter: 'url(#mpSombraC)', transform: 'translate(50 44)'}, capaC);
      el('rect', {x: -2, y: -1.4, width: 3.4, height: 2.8, rx: .5, fill: '#f2b53a'}, pat);
      el('rect', {x: 1.4, y: -1.1, width: 2.4, height: .5, fill: '#55575c'}, pat);
      el('rect', {x: 1.4, y: .6, width: 2.4, height: .5, fill: '#55575c'}, pat);
    }

    // Contenedores por contar (los que todavía no se revisan), con su número
    var gc = el('g', {class: 'mp-zona', 'data-zona': 'contenedores'}, capaC);
    d.cont.slice(0, 6).forEach(function(c, i){
      var px = 67 + (i % 2) * 23.5, py = 15 + Math.floor(i / 2) * 11, g = el('g', {filter: 'url(#mpSombraC)'}, gc);
      el('rect', {x: px, y: py, width: 21, height: 8.6, rx: .5, fill: CONT_COLORES[i % CONT_COLORES.length], stroke: 'rgba(0,0,0,.22)', 'stroke-width': .15}, g);
      for(var lx = px + 1.2; lx < px + 20.5; lx += 1.3) el('line', {x1: lx, x2: lx, y1: py+.4, y2: py+8.2, stroke: '#000', 'stroke-opacity': .12, 'stroke-width': .22}, g);
      el('rect', {x: px+3, y: py+2.9, width: 15, height: 2.8, rx: 1.4, fill: 'rgba(0,0,0,.35)'}, g);
      var t = el('text', {class: 'mp-num', x: px+10.5, y: py+4.35}, g); t.textContent = String(c.numero).slice(0, 14);
    });
    if(d.cont.length > 6){ var mas = el('text', {class: 'mp-chico', x: 111, y: 49, 'text-anchor': 'end'}, gc); mas.textContent = '+'+(d.cont.length - 6)+' más'; }
    if(!d.cont.length){ var nada = el('text', {class: 'mp-chico', x: 89, y: 31, 'text-anchor': 'middle'}, gc); nada.textContent = 'Nada por contar'; }

    // Inventario: anaqueles con las piezas (una caja por pieza, punto rojo si hay dañadas o faltan) y los motocarros en espera
    var gi = el('g', {class: 'mp-zona', 'data-zona': 'inventario'}, capaC);
    var tonos = ['#c9a36b', '#b98d55', '#d6b47e'];
    var piezas = (d.inv.piezas||[]), faltan = {};
    (d.inv.faltantes||[]).forEach(function(f){ faltan[f.pieza_id] = 1 });
    [14.5, 23.5].forEach(function(ry, r){
      el('rect', {x: 119, y: ry, width: 72, height: 5.6, rx: .6, class: 'mp-anaquel'}, gi);
      for(var i = 0; i < 18; i++){
        var pz = piezas[r*18 + i]; if(!pz) break;
        el('rect', {x: 119.8 + i*3.98, y: ry+.8, width: 3.3, height: 4, rx: .3, fill: tonos[(i+r) % 3], 'fill-opacity': +pz.disponibles > 0 ? 1 : .35, filter: 'url(#mpSombraC)'}, gi);
        if(+pz.danadas > 0 || faltan[pz.pieza_id] || +pz.disponibles < 0) el('circle', {class: 'mp-respira', cx: 119.8 + i*3.98 + 3, cy: ry+1, r: .65, fill: 'var(--neg)'}, gi);
      }
    });
    if(!piezas.length){ var sp = el('text', {class: 'mp-chico', x: 155, y: 21, 'text-anchor': 'middle'}, gi); sp.textContent = 'Sin piezas todavía'; }
    var motos = [];
    (d.inv.espera||[]).forEach(function(e){ for(var j = 0; j < (+e.cantidad||0); j++) motos.push(e.color_id) });
    motos.slice(0, 16).forEach(function(c, i){ motocarro(122 + (i % 8) * 8.6, 36 + Math.floor(i / 8) * 6, colorDe(c), gi) });
    if(motos.length > 16){ var mm = el('text', {class: 'mp-chico', x: 191, y: 49, 'text-anchor': 'end'}, gi); mm.textContent = '+'+(motos.length - 16)+' más'; }
    if(!motos.length){ var sm = el('text', {class: 'mp-chico', x: 155, y: 41, 'text-anchor': 'middle'}, gi); sm.textContent = 'Ninguno en espera de armado'; }

    // Línea de producción en U, con sus estaciones y los vehículos que hay en ella
    var gl = el('g', {class: 'mp-zona', 'data-zona': 'linea'}, capaC);
    var U = 'M 44 68 H 124 V 96 H 48';
    el('path', {d: U, fill: 'none', class: 'mp-banda', 'stroke-width': 3.4, 'stroke-linejoin': 'round', filter: 'url(#mpSombra)'}, gl);
    el('path', {d: 'M 48.5 93.2 L 43.5 96 L 48.5 98.8 Z', class: 'mp-banda-f'}, gl);
    el('path', {class: 'mp-flujo', d: U}, gl);
    var etapas = (H.prod ? H.prod.ETAPAS : []).slice(0, 8);
    var est = [[56,68],[76,68],[96,68],[116,68],[116,96],[96,96],[76,96],[56,96]];
    etapas.forEach(function(et, i){
      var pt = est[i], col = COL_LINEA[i];
      el('rect', {x: pt[0]-4.5, y: pt[1]-2.6, width: 9, height: 5.2, rx: .8, fill: '#fff', stroke: col, 'stroke-width': .35}, gl);
      for(var r2 = 1; r2 < 7; r2++) el('line', {x1: pt[0]-4.5+r2*9/7, x2: pt[0]-4.5+r2*9/7, y1: pt[1]-2, y2: pt[1]+2, stroke: col, 'stroke-width': .18, 'stroke-opacity': .8}, gl);
      var n = d.prod.filter(function(h){ return h.etapa===et.id }).length;
      var t = el('text', {class: 'mp-chico', x: pt[0], y: pt[1] < 80 ? pt[1]+5.4 : pt[1]-4, 'text-anchor': 'middle'}, gl);
      t.textContent = et.nombre.replace(' y pintura', '') + (n ? ' · '+n : '');
    });
    if(!menosMov()){
      d.prod.slice(0, 6).forEach(function(h, i){
        var m = motocarro(0, 0, colorDe(h.color_id), gl);
        el('animateMotion', {dur: '18s', begin: (-i * 3) + 's', repeatCount: 'indefinite', rotate: 'auto', path: U}, m);
      });
    }

    // Mostrador: barra en L, caja, la remisión, vendedor, cliente y dos motocarros de exhibición
    var gm = el('g', {class: 'mp-zona', 'data-zona': 'mostrador'}, capaC);
    el('path', {d: 'M 150 72 H 186 V 92', fill: 'none', stroke: '#b07a55', 'stroke-width': 4, 'stroke-linejoin': 'round', filter: 'url(#mpSombra)'}, gm);
    el('rect', {x: 172, y: 70.6, width: 5, height: 2.8, rx: .4, fill: '#3a3a3d'}, gm);
    el('rect', {x: 173, y: 71.1, width: 3, height: 1.4, rx: .2, fill: '#7fd3a8'}, gm);
    el('rect', {x: 158, y: 70.6, width: 6.5, height: 2.8, rx: .3, fill: '#f4f4f1', stroke: 'rgba(0,0,0,.15)', 'stroke-width': .12}, gm);
    for(var l = 0; l < 3; l++) el('line', {x1: 159, x2: 163.5, y1: 71.3+l*.7, y2: 71.3+l*.7, stroke: '#999', 'stroke-width': .15}, gm);
    el('circle', {cx: 176, cy: 66.5, r: 1.8, fill: '#4b63d6', filter: 'url(#mpSombraC)'}, gm); el('circle', {cx: 176, cy: 66.5, r: .9, fill: '#f0c8a0'}, gm);
    el('circle', {cx: 167, cy: 80, r: 1.8, fill: '#e7698a', filter: 'url(#mpSombraC)'}, gm); el('circle', {cx: 167, cy: 80, r: .9, fill: '#d8a77f'}, gm);
    motocarro(144, 82, '#d9483b', gm, -90); motocarro(144, 94, '#3f6fd8', gm, -90);

    // Letreros con el nombre y el conteo de cada área
    Object.keys(CAJAS).forEach(function(id){
      if(id==='recibir' && !H.puedeEscribir()) return;
      var c = CAJAS[id], z = ZONAS[id], g = el('g', {class: 'mp-zona', 'data-zona': id}, capaL);
      var x0 = c.x + 2, y0 = c.y + 5;
      var t = el('text', {class: 'mp-nombre', x: x0, y: y0}, g); t.textContent = z.nombre;
      if(z.sub){ var s = el('text', {class: 'mp-chico', x: x0, y: y0+2.8}, g); s.textContent = z.sub; }
      var kk = k[id]; if(kk.n==null) return;
      var ancho = String(kk.n).length > 1 ? 4.6 : 3.6, bx = x0 + t.getComputedTextLength() + 2.8;
      el('rect', {x: bx-ancho/2, y: y0-2.8, width: ancho, height: 3.4, rx: 1.7, class: kk.n ? 'mp-globo' : 'mp-globo cero'}, g);
      var tn = el('text', {class: 'mp-cuenta', x: bx, y: y0-1.1}, g); tn.textContent = kk.n;
      if(kk.alerta) el('circle', {class: 'mp-respira', cx: bx+ancho/2+1.6, cy: y0-1.1, r: 1, fill: 'var(--neg)'}, g);
    });

    svg.addEventListener('click', function(e){ var z = e.target.closest('.mp-zona'); if(z) abrirZona(z.dataset.zona); });
    svg.addEventListener('keydown', function(e){
      if(e.key!=='Enter' && e.key!==' ') return;
      var z = e.target.closest && e.target.closest('.mp-zona'); if(z){ e.preventDefault(); abrirZona(z.dataset.zona); }
    });
  }
  function abrirZona(id){
    var sec = ZONAS[id].sec;
    if(sec==='recibir' && !H.puedeEscribir()) sec = 'contenedores';
    H.ir(sec);
  }
  function motocarro(x, y, color, padre, giro){
    var g = el('g', {filter: 'url(#mpSombraC)', transform: 'translate('+x+' '+y+') rotate('+(giro||0)+')'}, padre);
    el('rect', {x: -2.5, y: -1.2, width: 5, height: 2.4, rx: .5, fill: '#3a3a3d'}, g);
    el('rect', {x: -2.4, y: -1.15, width: 2.9, height: 2.3, rx: .35, fill: color, stroke: 'rgba(0,0,0,.18)', 'stroke-width': .12}, g);
    el('rect', {x: .7, y: -1, width: 1.75, height: 2, rx: .55, fill: color, stroke: 'rgba(0,0,0,.18)', 'stroke-width': .12}, g);
    el('rect', {x: 1.95, y: -.75, width: .32, height: 1.5, rx: .15, fill: '#cfe4ff'}, g);
    return g;
  }
})();
