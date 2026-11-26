/* Plan de armado por semana (26-nov-2026, pedido del usuario). Cada bodega tiene el suyo y lo hacen sus gerentes
   (entran con la cuenta de la bodega). Arriba, lo planeado para la semana con su avance; un vehículo cuenta como
   armado cuando sale de Armado (ya tiene número de serie). Lo que no se armó pasa solo a la semana actual.
   Abajo, las recomendaciones: primero las órdenes de clientes y luego las de showroom, de la más antigua a la más
   reciente, diciendo si ya se pueden armar (hay vehículo en espera y alcanzan las piezas) o por qué no.
   Al final, qué se puede armar con lo que hay en el inventario (inv_capacidad). */
(function(){
  var H = window.InventarioApp._h, E = H.E, esc = H.esc, q = H.q;
  var S = {semana: null};   // la semana que se está viendo (lunes, AAAA-MM-DD)

  var MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  function fecha(iso){ return new Date(iso + 'T12:00:00') }
  function iso(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0') }
  function masDias(isoD, n){ var d = fecha(isoD); d.setDate(d.getDate() + n); return iso(d) }
  function nombreSemana(lunes){
    var a = fecha(lunes), b = fecha(masDias(lunes, 6));
    return 'Semana del '+a.getDate()+(a.getMonth()!==b.getMonth() ? ' de '+MESES[a.getMonth()] : '')+' al '+b.getDate()+' de '+MESES[b.getMonth()];
  }
  function diaCorto(isoD){ var d = fecha(isoD); return d.getDate()+' de '+MESES[d.getMonth()] }
  function clave(x){ return [x.bodega, x.modelo_id, (x.opciones||[]).slice().sort(function(a, b){ return a - b }).join(','), x.color_id].join('|') }

  H.DIBUJAR.plan = function(m){
    var P = H.prod;
    Promise.all([
      H.rpc('inv_plan', {p_bodega: E.verBodega, p_semana: S.semana}),
      H.rpc('inv_ventas', {p_bodega: E.verBodega}),
      H.rpc('inv_capacidad', {p_bodega: E.verBodega})
    ]).then(function(r){
      if(E.seccion!=='plan') return;
      var plan = r[0], ventas = r[1], cap = r[2];
      S.semana = plan.semana;
      var actual = plan.semana===plan.actual, pasada = plan.semana < plan.actual, escribe = H.puedeEscribir() && !pasada;
      var items = plan.items || [];
      var hechos = items.filter(function(x){ return x.armado }).length;

      // Cuántos se pueden armar de cada modelo y color: los que hay en espera, o menos si no alcanzan las piezas
      var puede = {}, limita = {};
      cap.forEach(function(c){ var k = clave(c); puede[k] = c.alcanzan==null ? +c.en_espera : Math.min(+c.en_espera, +c.alcanzan); limita[k] = c.alcanzan!=null && +c.alcanzan < +c.en_espera ? c.limita : null; });
      // Lo planeado que todavía no entra a producción ya ocupa lugar
      var libres = Object.assign({}, puede), sobre = {};
      items.filter(function(x){ return !x.vehiculo }).forEach(function(x){
        var k = clave(x); libres[k] = (libres[k]||0) - 1;   // (producción separada del inventario: ya no se avisa si no alcanzan)
      });

      var html = '<header class="inv-cab"><h1>Plan de armado</h1></header>'+
        '<div class="pl-semana"><button type="button" class="btn" data-pl="sem" data-d="-7" aria-label="Semana anterior">‹</button>'+
        '<b>'+esc(nombreSemana(plan.semana))+'</b>'+(actual ? '<span class="etq azul chica">Esta semana</span>' : pasada ? '<span class="etq anul chica">Ya pasó</span>' : '')+
        '<button type="button" class="btn" data-pl="sem" data-d="7" aria-label="Semana siguiente">›</button>'+
        (actual ? '' : '<button type="button" class="btn-link" data-pl="hoy">Ir a esta semana</button>')+'</div>';

      // ---- Lo planeado
      html += '<section class="pl-caja"><div class="pl-cab"><h2>'+(pasada ? 'Lo que se planeó' : 'Lo que se va a armar')+'</h2>'+
        (items.length ? '<span class="pl-avance"><b>'+hechos+' de '+items.length+'</b> armados</span>' : '')+'</div>';
      if(items.length) html += '<div class="pl-barra" aria-hidden="true"><span style="width:'+Math.round(hechos*100/items.length)+'%"></span></div>';
      Object.keys(sobre).forEach(function(k){
        var x = sobre[k], n = items.filter(function(y){ return !y.vehiculo && clave(y)===k }).length;
        html += '<p class="pl-aviso">Planeaste '+n+' '+esc(P.nombreVeh(x))+' y solo se pueden armar '+Math.max(0, puede[k]||0)+
          (limita[k] ? ' (no alcanzan: '+esc(limita[k])+')' : ' (no hay más en espera de armado)')+'.</p>';
      });
      if(!items.length) html += '<div class="inv-vacio"><b>Todavía no hay nada planeado</b>'+(escribe ? 'Agrégalo desde las recomendaciones de abajo.' : '')+'</div>';
      else html += '<div class="tarjetas">'+items.map(function(x){
        var est = x.armado ? '<span class="etq ok chica">✓ Armado'+(x.vehiculo && x.vehiculo.serie ? ' · '+esc(x.vehiculo.serie) : '')+'</span>'
          : x.vehiculo ? '<span class="etq azul chica">En armado</span>'
          : '<span class="etq pend chica">Por empezar</span>';
        var vieja = x.semana < plan.semana ? '<span class="etq rojo chica">Pendiente de la semana del '+esc(diaCorto(x.semana))+'</span>' : '';
        return '<div class="tarjeta"><span class="txt"><b>'+P.puntoColor(x.color_id)+esc(P.nombreVeh(x))+'</b>'+
          '<small>'+esc(P.ordenDe(x))+(x.partes > 1 ? ' · '+x.parte+' de '+x.partes : '')+(x.especial ? ' · Especial: '+esc(x.especial_que) : '')+'</small></span>'+
          vieja+est+(escribe && !x.vehiculo ? '<span class="btns"><button type="button" class="btn" data-pl="quitar" data-u="'+x.unidad_id+'">Quitar</button></span>' : '')+'</div>';
      }).join('')+'</div>';
      html += '</section>';

      // ---- Recomendaciones (las órdenes que todavía no se planean ni entran a producción)
      if(escribe){
        var enPlan = {};
        items.forEach(function(x){ enPlan[x.unidad_id] = 1 });
        var pend = ventas.filter(function(u){ return !u.vehiculo && !enPlan[u.unidad_id] && (u.estado_venta==='por_armar' || u.estado_venta==='esperando') })
          .sort(function(a, b){ return (a.tipo==='showroom') - (b.tipo==='showroom') || String(a.fecha).localeCompare(String(b.fecha)) || a.id - b.id || a.parte - b.parte });
        // Por ahora la producción va separada del inventario (26-nov-2026): se puede armar todo lo que está Por armar;
        // lo que está marcado Esperando piezas sale aparte
        var recs = pend.map(function(u){ var si = u.estado_venta==='por_armar'; return {u: u, si: si, por: si ? '' : 'Esperando piezas'}; });
        html += '<section class="pl-caja"><div class="pl-cab"><h2>Recomendaciones</h2></div>';
        if(!recs.length) html += '<p class="pl-nada">No hay órdenes pendientes de planear.</p>';
        [['Clientes', function(x){ return x.u.tipo!=='showroom' }], ['Showroom', function(x){ return x.u.tipo==='showroom' }]].forEach(function(g){
          var l = recs.filter(g[1]); if(!l.length) return;
          html += '<h3 class="pl-sub">'+g[0]+' <span>· '+l.length+'</span></h3><div class="tarjetas">'+l.map(function(x){
            var u = x.u;
            return '<div class="tarjeta'+(x.si ? '' : ' pl-no')+'"><span class="txt"><b>'+P.puntoColor(u.color_id)+esc(P.nombreVeh(u))+'</b>'+
              '<small>'+esc(P.ordenDe(u))+(u.partes > 1 ? ' · '+u.parte+' de '+u.partes : '')+' · '+esc(P.dias(u.fecha))+(u.especial ? ' · Especial: '+esc(u.especial_que) : '')+'</small>'+
              (x.por ? '<small class="pl-por">'+esc(x.por)+'</small>' : '')+'</span>'+
              (x.si ? '<span class="etq ok chica">Se puede armar</span>' : '')+
              '<span class="btns"><button type="button" class="btn'+(x.si ? ' prin' : '')+'" data-pl="poner" data-u="'+u.unidad_id+'">+ Al plan</button></span></div>';
          }).join('')+'</div>';
        });
        html += '</section>';
      }

      // ---- Qué se puede armar con lo que hay
      if(cap.length) html += '<section class="pl-caja"><div class="pl-cab"><h2>Qué se puede armar con lo que hay</h2></div>'+ '<div class="tarjetas">'+cap.map(function(c){
        var k = clave(c), n = puede[k];
        return '<div class="tarjeta"><span class="cant">'+n+'</span><span class="txt"><b>'+P.puntoColor(c.color_id)+esc(P.nombreVeh(c))+'</b>'+
          '<small>'+c.en_espera+' en espera de armado'+(c.alcanzan==null ? ' · sin lista de piezas' : limita[k] ? ' · alcanzan las piezas para '+c.alcanzan+' (limita: '+esc(limita[k])+')' : ' · alcanzan las piezas')+
          (E.rol!=='bodega' && !E.verBodega ? ' · '+esc(H.nombreBodega(c.bodega)) : '')+'</small></span></div>';
      }).join('')+'</div></section>';
      m.innerHTML = html;
    }).catch(function(err){ m.innerHTML = '<p class="inv-error">'+esc(H.mensaje(err))+'</p>' });
  };

  document.addEventListener('click', function(e){
    if(!E.raiz || !E.raiz.contains(e.target) || E.seccion!=='plan') return;
    var b = e.target.closest('[data-pl]'); if(!b) return;
    var a = b.dataset.pl, m = q('.inv-main', E.raiz);
    if(a==='sem'){ S.semana = masDias(S.semana, +b.dataset.d); H.DIBUJAR.plan(m); return; }
    if(a==='hoy'){ S.semana = null; H.DIBUJAR.plan(m); return; }
    if(a==='poner' || a==='quitar'){
      b.disabled = true;
      var llamada = a==='poner' ? H.rpc('inv_plan_poner', {p_unidad: +b.dataset.u, p_semana: S.semana}) : H.rpc('inv_plan_quitar', {p_unidad: +b.dataset.u});
      llamada.then(function(){ H.avisar(a==='poner' ? 'Se agregó al plan de la semana.' : 'Se quitó del plan.'); contar(); H.DIBUJAR.plan(m); })
        .catch(function(err){ b.disabled = false; H.prod.aviso('No se pudo', H.mensaje(err)); });
    }
  });

  // Burbuja del menú: lo que falta armar del plan de esta semana
  function contar(){
    H.rpc('inv_plan', {p_bodega: E.verBodega, p_semana: null}).then(function(p){
      H.CUENTA.plan = (p.items||[]).filter(function(x){ return !x.armado }).length || ''; H.dibujarMenu();
    }).catch(function(){});
  }
  H.alIniciar.push(contar);
  H.plan = {contar: contar};
})();
