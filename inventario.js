/* Inventario de bodegas dentro de Logística (fase 1).
   Datos: solo por las funciones public.inv_* de Supabase, que revisan rol y bodega.
   Diseño (pedido del usuario): muy limpio, para gente a la que no se le da la tecnología.
   Nada de <select>: toda elección abre la "lista para escoger" (la misma de la app de Catálogo).
   Nada de filtros regados: se navega con el menú. */
(function(){
  var I = window.Inventario;
  var E = {sb: null, raiz: null, salir: null, rol: null, bodega: null, verBodega: null, seccion: null, cat: null, iniciado: false};
  var BODEGAS = [{valor: 'bodega1', nombre: 'Bodega 1'}, {valor: 'bodega2', nombre: 'Bodega 2'}];

  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] }) }
  function q(sel, base){ return (base||document).querySelector(sel) }
  function nombreBodega(b){ var x = BODEGAS.filter(function(o){ return o.valor===b })[0]; return x ? x.nombre : 'Las dos bodegas' }
  function puedeEscribir(){ return E.rol==='admin' || E.rol==='bodega' }
  // Mensaje de Supabase en palabras: los nuestros ya vienen en español; los demás, uno genérico
  function mensaje(err){
    var m = err && err.message || '';
    if(/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ ]/.test(m) && !/permission|violates|syntax|function|column|relation/i.test(m)) return m;
    return 'No se pudo guardar. Revisa tu conexión e intenta de nuevo.';
  }
  function rpc(nombre, args){
    return E.sb.rpc(nombre, args||{}).then(function(r){ if(r.error) throw r.error; return r.data });
  }
  function fechaLarga(iso){
    if(!iso) return '';
    var d = new Date(iso + (String(iso).length===10 ? 'T12:00:00' : ''));
    return d.toLocaleDateString('es-MX', {day:'numeric', month:'long', year:'numeric'});
  }
  function hoyISO(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0') }

  // ---------------------------------------------------------------- Íconos (líneas, como Logística)
  var ICO = {
    recibir: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7.5 10 4l7 3.5v7L10 18l-7-3.5z"/><path d="M3 7.5 10 11l7-3.5M10 11v7"/></svg>',
    contenedores: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><rect x="2.5" y="4" width="15" height="12" rx="1.5"/><path d="M6 7v6M10 7v6M14 7v6"/></svg>',
    inventario: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h14M3 10h14M3 14h9"/></svg>',
    catalogos: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3.5h9.5L16 6v10.5H4z"/><path d="M7 8h6M7 11h6M7 14h3"/></svg>',
    cambios: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7"/><path d="M10 6v4l3 2"/></svg>',
    flecha: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 3 5 5-5 5"/></svg>'
  };

  // ---------------------------------------------------------------- Secciones del menú
  var SECCIONES = [
    {id: 'recibir',      nombre: 'Recibir contenedor', sub: 'Registrar lo que llegó',        roles: ['admin','bodega']},
    {id: 'contenedores', nombre: 'Contenedores',       sub: 'Revisar y consultar',           roles: ['admin','bodega','lectura']},
    {id: 'inventario',   nombre: 'Inventario',         sub: 'Piezas y vehículos en espera',  roles: ['admin','bodega','lectura']},
    {id: 'catalogos',    nombre: 'Catálogos',          sub: 'Modelos, colores, piezas',      roles: ['admin']},
    {id: 'cambios',      nombre: 'Cambios',            sub: 'Lo que corrigieron las bodegas', roles: ['admin']}
  ];
  var DIBUJAR = {};          // id de sección -> function(main)
  var CUENTA = {};           // id de sección -> número para la burbuja (o '')

  function secciones(){ return SECCIONES.filter(function(s){ return s.roles.indexOf(E.rol) > -1 }) }

  function dibujarMenu(){
    var m = q('.inv-menu', E.raiz); if(!m) return;
    var quien = E.rol==='bodega' ? nombreBodega(E.bodega) : (E.rol==='admin' ? 'Administrador' : 'Consulta');
    var html = '<div class="inv-quien">Inventario<b>'+esc(quien)+'</b></div>';
    if(E.rol!=='bodega'){
      html += '<button type="button" class="elegir" data-accion="bodega" style="margin:0 0 10px">'+
        '<span><span class="et">Viendo</span><span class="va">'+esc(nombreBodega(E.verBodega))+'</span></span><span class="fl">'+ICO.flecha+'</span></button>';
    }
    html += secciones().map(function(s){
      var n = CUENTA[s.id];
      return '<button class="mi" type="button" data-sec="'+s.id+'" aria-current="'+(E.seccion===s.id)+'">'+
        '<span class="ic">'+ICO[s.id]+'</span><span><b>'+esc(s.nombre)+'</b><small>'+esc(s.sub)+'</small></span>'+
        '<span class="c">'+(n ? '<span class="burbuja">'+n+'</span>' : '')+'</span></button>';
    }).join('');
    if(E.rol==='bodega') html += '<div class="inv-pie"><button type="button" data-accion="salir">Salir</button></div>';
    m.innerHTML = html;
  }

  function ir(id){
    E.seccion = id; dibujarMenu();
    var main = q('.inv-main', E.raiz);
    main.innerHTML = '<p class="inv-cargando">Cargando…</p>';
    window.scrollTo({top: 0});
    var f = DIBUJAR[id];
    Promise.resolve(E.cat || cargarCatalogo()).then(function(){
      if(E.seccion !== id) return;
      if(f) f(main); else main.innerHTML = '';
    }).catch(function(err){ main.innerHTML = '<p class="inv-error">'+esc(mensaje(err))+'</p>' });
  }

  function cargarCatalogo(){ return rpc('inv_catalogo').then(function(c){ E.cat = c; return c }) }

  // ---------------------------------------------------------------- Lista para escoger (como Catálogo)
  // abrirLista({titulo, ayuda, grupos:[{titulo, opciones:[{valor, nombre, detalle, n, ico, color}]}], elegido}) -> Promise(valor|null)
  var hoja = null, hojaFin = null, hojaPop = false;
  function hojaEl(){
    if(!hoja){ hoja = document.createElement('div'); hoja.className = 'hoja'; hoja.hidden = true; document.body.appendChild(hoja); }
    return hoja;
  }
  function abrirHoja(htmlCaja, alTerminar){
    cerrarHoja(null);
    var h = hojaEl();
    h.innerHTML = '<div class="hoja-fondo" data-hoja-cerrar></div><div class="hoja-caja" role="dialog" aria-modal="true">'+
      '<div class="hoja-asa" aria-hidden="true"></div>'+htmlCaja+'</div>';
    hojaFin = alTerminar;
    h.hidden = false; document.documentElement.classList.add('hoja-on');
    // "Atrás" del navegador cierra la lista en vez de salir
    history.pushState(Object.assign({}, history.state, {invHoja: true}), '');
    requestAnimationFrame(function(){
      h.classList.add('abierta');
      var s = q('.h-op.sel', h) || q('input,textarea', h) || q('.h-op', h);
      if(s){ s.focus({preventScroll: true}); if(s.classList.contains('sel')) s.scrollIntoView({block: 'center'}); }
    });
  }
  function cerrarHoja(valor, desdeHistorial){
    if(!hojaFin) return;
    var fin = hojaFin; hojaFin = null;
    var h = hojaEl(); h.classList.remove('abierta'); document.documentElement.classList.remove('hoja-on');
    if(!desdeHistorial && history.state && history.state.invHoja){ hojaPop = true; history.back(); }
    setTimeout(function(){ if(!hojaFin){ h.hidden = true; h.innerHTML = ''; } }, 220);
    fin(valor);
  }
  window.addEventListener('popstate', function(){
    if(hojaPop){ hojaPop = false; return; }
    if(hojaFin) cerrarHoja(null, true);
  });
  document.addEventListener('keydown', function(e){ if(e.key==='Escape' && hojaFin){ e.stopPropagation(); cerrarHoja(null); } }, true);

  function cabHoja(titulo, ayuda){
    return '<div class="hoja-cab"><b>'+esc(titulo)+'</b>'+(ayuda ? '<span>'+esc(ayuda)+'</span>' : '')+
      '<button type="button" class="hoja-x" data-hoja-cerrar aria-label="Cerrar">✕</button></div>';
  }

  function abrirLista(o){
    return new Promise(function(res){
      var vals = [], html = '';
      (o.grupos||[]).forEach(function(g){
        var filas = (g.opciones||[]).map(function(op){
          var i = vals.push(op.valor) - 1;
          var ico = op.color ? '<span class="h-punto" style="background:'+esc(op.color)+'"></span>' : (op.ico ? '<span class="h-ico">'+op.ico+'</span>' : '');
          return '<button type="button" class="h-op'+(op.valor===o.elegido ? ' sel' : '')+'" data-hoja-i="'+i+'">'+ico+
            '<span class="h-nom">'+esc(op.nombre)+(op.detalle ? '<small>'+esc(op.detalle)+'</small>' : '')+'</span>'+
            (op.n!=null && op.n!=='' ? '<span class="h-n">'+esc(op.n)+'</span>' : '')+'</button>';
        }).join('');
        if(filas) html += '<div class="h-grupo">'+(g.titulo ? '<div class="h-tit-grupo">'+esc(g.titulo)+'</div>' : '')+filas+'</div>';
      });
      abrirHoja(cabHoja(o.titulo, o.ayuda)+'<div class="hoja-lista">'+html+'</div>', res);
      hojaEl().onclick = function(e){
        if(e.target.closest('[data-hoja-cerrar]')){ cerrarHoja(null); return; }
        var b = e.target.closest('[data-hoja-i]'); if(b) cerrarHoja(vals[+b.dataset.hojaI]);
      };
    });
  }

  // Pide un texto (motivo, nombre…) en la misma caja. -> Promise(texto|null)
  function pedirTexto(o){
    return new Promise(function(res){
      abrirHoja(cabHoja(o.titulo, o.ayuda)+'<form class="hoja-cuerpo" novalidate>'+
        '<label class="campo" style="max-width:none"><span>'+esc(o.etiqueta||'')+'</span>'+
        (o.largo ? '<textarea name="t" maxlength="300"></textarea>' : '<input name="t" maxlength="80" autocomplete="off">')+'</label>'+
        '<p class="inv-error" hidden></p>'+
        '<div class="acciones" style="margin-top:8px"><button type="button" class="btn" data-hoja-cerrar>Cancelar</button>'+
        '<button type="submit" class="btn prin der">'+esc(o.boton||'Guardar')+'</button></div></form>', res);
      var h = hojaEl(), f = q('form', h), t = f.elements.t;
      t.value = o.valor || '';
      h.onclick = function(e){ if(e.target.closest('[data-hoja-cerrar]')) cerrarHoja(null) };
      f.onsubmit = function(e){
        e.preventDefault();
        var v = t.value.trim();
        if(!v){ var er = q('.inv-error', f); er.textContent = o.falta || 'Escribe algo para continuar.'; er.hidden = false; t.focus(); return; }
        cerrarHoja(v);
      };
    });
  }

  // Pide una cantidad con − / + grandes. -> Promise(número|null)
  function pedirCantidad(o){
    return new Promise(function(res){
      abrirHoja(cabHoja(o.titulo, o.ayuda)+'<form class="hoja-cuerpo" novalidate>'+
        '<div style="display:flex;justify-content:center;margin:8px 0 4px">'+contador('n', o.valor==null ? 1 : o.valor, o.min==null ? 1 : o.min)+'</div>'+
        '<p class="inv-error" hidden></p>'+
        '<div class="acciones"><button type="button" class="btn" data-hoja-cerrar>Cancelar</button>'+
        '<button type="submit" class="btn prin der">'+esc(o.boton||'Listo')+'</button></div></form>', res);
      var h = hojaEl(), f = q('form', h), min = o.min==null ? 1 : o.min;
      h.onclick = function(e){ if(e.target.closest('[data-hoja-cerrar]')) cerrarHoja(null) };
      f.onsubmit = function(e){
        e.preventDefault();
        var v = valorContador(q('.contador', f));
        if(v < min){ var er = q('.inv-error', f); er.textContent = 'La cantidad debe ser '+min+' o más.'; er.hidden = false; return; }
        cerrarHoja(v);
      };
      setTimeout(function(){ var i = q('.contador input', h); if(i){ i.focus(); i.select(); } }, 60);
    });
  }

  // Pregunta sí/no con botones grandes. -> Promise(true|false)
  function confirmar(o){
    return new Promise(function(res){
      abrirHoja(cabHoja(o.titulo, o.ayuda)+'<div class="hoja-cuerpo"><div class="acciones" style="margin-top:0">'+
        '<button type="button" class="btn" data-hoja-cerrar>'+esc(o.no||'Cancelar')+'</button>'+
        '<button type="button" class="btn prin der" data-si>'+esc(o.si||'Sí')+'</button></div></div>', function(v){ res(!!v) });
      hojaEl().onclick = function(e){
        if(e.target.closest('[data-si]')){ cerrarHoja(true); return; }
        if(e.target.closest('[data-hoja-cerrar]')) cerrarHoja(false);
      };
    });
  }

  // Botón − número + . Regresa HTML; leer con valorContador(el)
  function contador(nombre, valor, min){
    return '<span class="contador" data-contador="'+esc(nombre)+'" data-min="'+(min||0)+'">'+
      '<button type="button" data-paso="-1" aria-label="Uno menos">−</button>'+
      '<input type="text" inputmode="numeric" value="'+(valor||0)+'" aria-label="Cantidad">'+
      '<button type="button" data-paso="1" aria-label="Uno más">+</button></span>';
  }
  document.addEventListener('click', function(e){
    var b = e.target.closest('.contador [data-paso]'); if(!b) return;
    var c = b.closest('.contador'), inp = q('input', c), min = +c.dataset.min || 0;
    var v = Math.max(min, (parseInt(inp.value, 10) || 0) + (+b.dataset.paso));
    inp.value = v; inp.dispatchEvent(new Event('input', {bubbles: true}));
  });
  document.addEventListener('input', function(e){
    var inp = e.target; if(!inp.closest || !inp.closest('.contador')) return;
    var limpio = inp.value.replace(/\D/g, ''); if(limpio !== inp.value) inp.value = limpio;
  });
  function valorContador(c){ return parseInt(q('input', c).value, 10) || 0 }

  // ---------------------------------------------------------------- Eventos del menú
  function alClic(e){
    var s = e.target.closest('[data-sec]'); if(s){ ir(s.dataset.sec); return; }
    var a = e.target.closest('[data-accion]'); if(!a) return;
    if(a.dataset.accion==='salir'){ if(E.salir) E.salir(); return; }
    if(a.dataset.accion==='bodega'){
      abrirLista({titulo: 'Qué bodega ver', grupos: [{opciones: [{valor: '', nombre: 'Las dos bodegas'}].concat(BODEGAS)}],
        elegido: E.verBodega || ''}).then(function(v){
          if(v==null) return; E.verBodega = v || null; ir(E.seccion);
        });
    }
  }

  // ---------------------------------------------------------------- Arranque
  function iniciar(o){
    E.sb = o.sb; E.raiz = o.contenedor; E.salir = o.salir;
    var listo = o.sesion ? Promise.resolve(o.sesion) : rpc('inv_sesion');
    if(E.iniciado){ E.raiz.hidden = false; return listo; }
    E.iniciado = true;
    E.raiz.innerHTML = '<div class="inv"><nav class="inv-menu" aria-label="Menú de inventario"></nav><section class="inv-main" aria-live="polite"></section></div>';
    E.raiz.addEventListener('click', alClic);
    return listo.then(function(s){
      E.rol = s.rol; E.bodega = s.bodega || null;
      E.verBodega = E.rol==='bodega' ? E.bodega : null;
      ir(puedeEscribir() && E.rol==='bodega' ? 'recibir' : 'contenedores');
    }).catch(function(err){ q('.inv-main', E.raiz).innerHTML = '<p class="inv-error">'+esc(mensaje(err))+'</p>' });
  }
  function cerrar(){
    cerrarHoja(null);
    if(E.raiz){ E.raiz.innerHTML = ''; E.raiz.hidden = true; }
    E.iniciado = false; E.cat = null; E.rol = null; E.bodega = null; E.verBodega = null; E.seccion = null;
    Object.keys(CUENTA).forEach(function(k){ delete CUENTA[k] });
  }

  // Lo que usan las secciones (Tareas 4-6)
  var H = {E: E, I: I, esc: esc, q: q, rpc: rpc, mensaje: mensaje, ir: ir, dibujarMenu: dibujarMenu, cargarCatalogo: cargarCatalogo,
    abrirLista: abrirLista, pedirTexto: pedirTexto, pedirCantidad: pedirCantidad, confirmar: confirmar, contador: contador, valorContador: valorContador,
    abrirHoja: abrirHoja, cerrarHoja: cerrarHoja, cabHoja: cabHoja, hojaEl: hojaEl,
    nombreBodega: nombreBodega, puedeEscribir: puedeEscribir, fechaLarga: fechaLarga, hoyISO: hoyISO, ICO: ICO, BODEGAS: BODEGAS,
    DIBUJAR: DIBUJAR, CUENTA: CUENTA};

  // Secciones todavía sin pantalla: un aviso amable
  ['recibir','contenedores','inventario','catalogos','cambios'].forEach(function(id){
    DIBUJAR[id] = function(main){
      var s = SECCIONES.filter(function(x){ return x.id===id })[0];
      main.innerHTML = '<header class="inv-cab"><h1>'+esc(s.nombre)+'</h1><p>'+esc(s.sub)+'</p></header>'+
        '<div class="inv-vacio"><b>En construcción</b>Esta pantalla está por llegar.</div>';
    };
  });

  window.InventarioApp = {iniciar: iniciar, cerrar: cerrar, abrirLista: abrirLista, _h: H};
})();
