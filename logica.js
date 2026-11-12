/* Reglas de negocio de Logística, compartidas por las dos propuestas.
   Entra lo que viene del Excel (window.VENTAS) y sale una lista de unidades ya interpretadas. */
(function(){
  var MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  var PASOS = [['A','Armado'],['H','Herrería'],['F','Forrado'],['P','Pintura'],['R','Revisión']];

  // El flujo de una unidad
  var ESTADOS = [
    {id:'piezas',    nombre:'Esperando piezas', corto:'Sin vehículo o piezas para empezar'},
    {id:'empezar',   nombre:'No iniciado',      corto:'Ya hay piezas, falta arrancar'},
    {id:'taller',    nombre:'En proceso',       corto:'Armado a revisión'},
    {id:'flete',     nombre:'Completo',         corto:'Los 5 pasos en OK'},
    {id:'camino',    nombre:'En camino',        corto:'Rumbo a su destino'},
    {id:'entregada', nombre:'Entregada',        corto:'Llegó a su destino'}
  ];

  // Tipos como los cataloga sunldemexico.com
  var TIPOS = [
    {id:'mc150', nombre:'Motocarro 150 cc'},{id:'mc200', nombre:'Motocarro 200 cc'},
    {id:'mc300dr', nombre:'Motocarro 300 cc doble rodado'},{id:'mc300cc', nombre:'Motocarro 300 cc cabina cerrada'},
    {id:'mc300', nombre:'Motocarro 300 cc'},{id:'mc350', nombre:'Motocarro 350 cc'},{id:'mototaxi', nombre:'Mototaxis'},
    {id:'atv', nombre:'ATV o cuatrimotos'},{id:'utv', nombre:'UTV o tipo razer'},{id:'minimoto', nombre:'Minimotos'},
    {id:'arenero', nombre:'Areneros o go karts'},{id:'otro', nombre:'Accesorios y otros'}
  ];

  // Zona de destino (color de la columna destino en el Excel)
  var ZONAS = [
    {id:'cerca', nombre:'Local cerca'},{id:'lejos', nombre:'Local más lejos'},{id:'foranea', nombre:'Foránea · tráiler'},
    {id:'sucursal', nombre:'Sucursales'},{id:'distribuidor', nombre:'Distribuidores'},{id:'granja', nombre:'Recoge en granja'},
    {id:'sin', nombre:'Sin destino'}
  ];

  // Bodega donde se arma (columna Activación). S. Cruz = Bodega 1, "Granja".
  var BODEGAS = [{id:'granja', nombre:'Granja', largo:'Bodega 1 · Granja'},{id:'b2', nombre:'Bodega 2', largo:'Bodega 2'}];
  function bodega(txt){ return /bodega\s*2/i.test(txt||'') ? 'b2' : 'granja' }

  var ABREV = {'PK':'pick up','CAB':'cabina','SIN/HIDR':'sin hidráulico','CON/HIDR':'con hidráulico','PTAS':'puertas','PTAS.':'puertas','C/C':'con','S/E':'sin','BCO':'blanco','BCO.':'blanco'};
  function cap(s){ return s ? s.charAt(0).toUpperCase()+s.slice(1) : s }
  function nombre(v){
    var m = /^(\d+)\s+(.*)$/.exec(v||''); var cant = m?+m[1]:1; var t = m?m[2]:(v||'');
    var mm = /^(TOLDO MC \d+|MC \d+(?:cc)?(?: (?:PLUS|DR))?|MOTOTAXI \d+\s?cc|MINI ?ATV[^ ]* ?\d*cc|UTV \w+|MINICROSS \d+cc)\s*(.*)$/i.exec(t);
    var modelo = mm ? mm[1] : t.split(' ').slice(0,2).join(' ');
    var resto = (mm ? mm[2] : t.split(' ').slice(2).join(' ')).replace(/\*+/g,'').trim();
    var det = resto.split(/\s+/).filter(Boolean).map(function(w){ return ABREV[w.toUpperCase()] || w.toLowerCase() }).join(' ');
    return {cant:cant, modelo:modelo, detalle:cap(det)};
  }
  function tipo(v){
    v = (v||'').toUpperCase();
    if(/^\d+\s+TOLDO/.test(v)) return 'otro';
    if(/MOTOTAXI/.test(v)) return 'mototaxi';
    if(/MINI ?ATV|\bATV\b|CUATRI/.test(v)) return 'atv';
    if(/\bUTV\b|RAZER|RAIZER/.test(v)) return 'utv';
    if(/MINICROSS|MINIMOTO/.test(v)) return 'minimoto';
    if(/ARENERO|GO ?KART/.test(v)) return 'arenero';
    if(/MC\s*350/.test(v)) return 'mc350';
    if(/MC\s*300/.test(v)){ if(/CABINA CERRADA|CAB\/CERRADA/.test(v)) return 'mc300cc'; if(/\bDR\b|HIDR/.test(v)) return 'mc300dr'; return 'mc300'; }
    if(/MC\s*200/.test(v)) return 'mc200';
    if(/MC\s*150/.test(v)) return 'mc150';
    return 'otro';
  }
  // Rutas de entrega de lo que no es local (decididas con el usuario, 10-nov-2026). Salen de la granja.
  // Cada parada: [nombre, palabras que la reconocen en la columna DESTINO]. Las paradas van en el orden del viaje.
  var RUTAS = [
    {id:'centro', nombre:'Ruta Centro', rumbo:'Autopista a México', paradas:[
      ['Naucalpan',['NAUCALPAN']], ['Estado de México',['EDO DE MEX','ESTADO DE MEXICO','EDOMEX']], ['Vallejo, CDMX',['VALLEJO','CDMX']],
      ['Tultepec',['TULTEPEC']], ['Puebla · sucursal',['PUEBLA']], ['Tecamachalco',['TECAMACHALCO']]]},
    {id:'bajio-norte', nombre:'Ruta Bajío Norte', rumbo:'Bajío y Aguascalientes', paradas:[
      ['Irapuato',['IRAPUATO']], ['Cuerámaro',['CUERAMARO']], ['San Francisco del Rincón',['SAN FRANCISCO DEL RINCON']],
      ['León',['LEON']], ['Aguascalientes · sucursal',['AGS','AGUASCALIENTES']]]},
    {id:'bajio-sur', nombre:'Ruta Bajío Sur', rumbo:'Ribera de Chapala y Michoacán', paradas:[
      ['El Refugio · Tizapán el Alto',['REFUGIO','TIZAPAN']], ['Zamora',['ZAMORA']], ['Morelia',['MORELIA']],
      ['Tototlán',['TOTOTLAN']], ['Rancho Nuevo · Juanacatlán',['RANCHO NUEVO','JUANACATLAN']], ['El Salto',['EL SALTO']]]},
    {id:'pacifico', nombre:'Ruta Pacífico', rumbo:'Nayarit y Sinaloa', paradas:[
      ['El Arenal',['ARENAL']], ['La Estanzuela · Teuchitlán',['ESTANZUELA','TEUCHITLAN']], ['Etzatlán',['ETZATLAN']],
      ['Tepic · sucursal',['TEPIC']], ['Mazatlán',['MAZATLAN']], ['Culiacán',['CULIACAN']], ['Los Mochis',['MOCHIS']]]},
    {id:'costa-sur', nombre:'Ruta Costa Sur', rumbo:'Sur de Jalisco y Colima', paradas:[
      ['Villa de los Niños · Acatlán',['VILLA DE LOS NINOS','ACATLAN']], ['Tuxpan',['TUXPAN']], ['Colima',['COLIMA']],
      ['Tecomán',['TECOMAN']]]},
    // Individuales: un solo destino, van por fletera (12-nov-2026). En la pestaña salen primero (ver cargar()).
    // Durango (por Zacatecas) y Monterrey (por SLP y Saltillo) van en direcciones distintas.
    // Amatlán (sierra, al sur de Ixtlán del Río), Carácuaro (Tierra Caliente, al sur de Morelia) y Autlán (carretera 80)
    // se sacaron de sus rutas porque se desvían mucho de la carretera.
    {id:'durango', nombre:'Por fletera - Durango', paradas:[['Durango',['DURANGO']]]},
    {id:'monterrey', nombre:'Por fletera - Monterrey', paradas:[['Monterrey',['MONTERREY']]]},
    {id:'aparte-amatlan', nombre:'Por fletera - Amatlán de Cañas', paradas:[['Amatlán de Cañas',['AMATLAN']]]},
    {id:'aparte-caracuaro', nombre:'Por fletera - Carácuaro', paradas:[['Carácuaro',['CARACUARO']]]},
    {id:'aparte-autlan', nombre:'Por fletera - Autlán de Navarro', paradas:[['Autlán de Navarro',['AUTLAN']]]},
    {id:'fletera', nombre:'Por fletera - Tijuana', paradas:[['Tijuana',['TIJUANA']]]}
  ];
  function normaDestino(t){ return ' '+String(t||'').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Z0-9]+/g,' ').trim()+' ' }
  // Ruta y parada de un destino: gana la palabra que aparece primero (así "TULTEPEC EDO. DE MEX." va a Tultepec);
  // si empiezan igual, la más larga
  function rutaDe(destino){
    var d = normaDestino(destino), mejor = null;
    RUTAS.forEach(function(ru){ ru.paradas.forEach(function(p,k){ p[1].forEach(function(w){
      var at = d.indexOf(' '+w+' ');
      if(at>-1 && (!mejor || at<mejor.at || (at===mejor.at && w.length>mejor.largo))) mejor = {ruta:ru.id, parada:k, at:at, largo:w.length};
    }) }) });
    return mejor;
  }

  // Celda del vehículo pintada en el Excel = no hay vehículo o piezas para empezar
  function esperaPiezas(r){ return !!r.color_vehiculo && r.color_vehiculo !== 'theme0' }

  // manuales: las rutas locales que armó el usuario arrastrando remisiones ([{remision, grupo}], de logistica_rutas_locales())
  function cargar(ventas, corte, manuales){
    var CORTE = corte ? new Date(corte+'T12:00:00') : new Date();
    var U = (ventas||[]).map(function(r,i){
      var f = r.fecha ? new Date(r.fecha+'T12:00:00') : null;
      var ok = r.pasos.filter(function(x){return x==='ok'}).length;
      var dist = /MOTOPLAZA/i.test(r.destino||'') ? 'Motoplaza' : '';
      var z = dist ? 'distribuidor' : (r.zona==='motoplaza' ? 'distribuidor' : r.zona==='pacifico' ? 'sucursal' : (r.zona||'sin'));
      var ru = r.hoja==='entregado' ? null : rutaDe(r.destino);
      var estado = r.hoja==='entregado' ? 'entregada' : ok===5 ? 'flete' : esperaPiezas(r) ? 'piezas' : ok>0 || r.pasos.indexOf('x')>-1 ? 'taller' : 'empezar';
      return Object.assign({}, r, nombre(r.vehiculo), {
        i:i, f:f, dias: f ? Math.round((CORTE-f)/864e5) : null, ok:ok, estado:estado,
        tipo:tipo(r.vehiculo), z:z, distribuidor:dist, bodega:bodega(r.activacion),
        ruta: ru ? ru.ruta : null, parada: ru ? ru.parada : null
      });
    });
    // Primero las individuales (un solo destino) para que no se pierdan, luego las provisionales y al final las de varias paradas
    var unaParada = function(ru){ return ru.paradas.length===1 };
    var prov = provisionales(U);
    // Las locales van primero (pedido del usuario, 12-nov-2026)
    var rutas = locales(U, manuales||[]).concat(RUTAS.filter(unaParada), prov, RUTAS.filter(function(ru){ return !unaParada(ru) }));
    // Prioridad del flete: la venta más antigua sale primero
    U.filter(function(u){return u.estado==='flete'})
     .sort(function(a,b){ return (a.f||0)-(b.f||0) || a.i-b.i })
     .forEach(function(u,n){ u.prioridad = n+1 });
    return {unidades:U, corte:CORTE, rutas:rutas};
  }

  // Rutas provisionales (12-nov-2026): si 2 o más unidades de Ventas van al mismo destino que no está en
  // ninguna ruta, se arma una ruta para ese destino. No cuentan las locales (zona naranja, distribuidor,
  // granja, sin destino, TIPO DE DESTINO "Local" o lugares de la zona metropolitana).
  var ESTADO_MX = /( (JAL|JALISCO|NAY|NAYARIT|MICH|MICHOACAN|GTO|GUANAJUATO|COL|COLIMA|SIN|SINALOA|SON|SONORA|ZAC|ZACATECAS|DGO|AGS|QRO|SLP|NL|BC|BCS|GRO|OAX|VER|CHIS|CHIH|COAH|TAMPS|HGO|MOR|PUE|TLAX|TAB|YUC|QROO|CAMP|EDO DE MEX|EDOMEX|MEX))+ $/;
  function titulo(k){ return k.toLowerCase().replace(/(^| )(\S)/g,function(m,a,b){ return a+b.toUpperCase() }) }
  // Envíos locales (12-nov-2026): lo de Guadalajara y alrededores que no cae en ninguna ruta. Una tarjeta por destino
  // ("Local - Tlaquepaque"); si el usuario junta remisiones arrastrándolas, esas salen en "Ruta local 1", "Ruta local 2"…
  // con una parada por destino. No van las que se recogen en granja ni las que no tienen destino.
  function locales(U, manuales){
    var grupoDe = {}; manuales.forEach(function(m){ grupoDe[m.remision] = m.grupo });
    var porDestino = {}, porGrupo = {};
    U.forEach(function(u){
      if(u.hoja==='entregado' || u.ruta || u.z==='granja' || u.z==='sin') return;
      var d = normaDestino(u.destino);
      if(/ (GRANJA|PENDIENTE|RECOGE) /.test(d)) return;
      if(['cerca','lejos','distribuidor'].indexOf(u.z)<0 && !LOCAL.test(d) && !/^\s*(semi\s*)?local\s*$/i.test(u.tipo_destino||'')) return;
      var clave = d.replace(ESTADO_MX,' ').trim(); if(!clave) return;
      // Se juntan por remisión. Las que no tienen ("S/N" o vacía) se reconocen por vehículo, destino y fecha de venta,
      // para que dos S/N distintas no se muevan juntas
      var sinRem = !u.remision || /^\s*s\s*\/?\s*n\s*$/i.test(u.remision);
      u.local = true; u.claveLocal = clave; u.juntable = true;
      u.claveRuta = sinRem ? 'S/N|'+normaDestino(u.vehiculo).trim()+'|'+clave+'|'+(u.fecha||'') : u.remision;
      var g = grupoDe[u.claveRuta];
      if(g!=null) (porGrupo[g] = porGrupo[g] || []).push(u);
      else (porDestino[clave] = porDestino[clave] || []).push(u);
    });
    // Si una ruta armada se quedó con una sola remisión (las otras ya se entregaron), esa vuelve a su destino
    Object.keys(porGrupo).forEach(function(g){
      var rems = {}; porGrupo[g].forEach(function(u){ rems[u.claveRuta] = 1 });
      if(Object.keys(rems).length<2){ porGrupo[g].forEach(function(u){ (porDestino[u.claveLocal] = porDestino[u.claveLocal] || []).push(u) }); delete porGrupo[g]; }
    });
    var armadas = Object.keys(porGrupo).map(Number).sort(function(a,b){ return a-b }).map(function(g,n){
      var id = 'rl-'+g, lugares = [];
      porGrupo[g].forEach(function(u){
        var k = lugares.indexOf(u.claveLocal); if(k<0){ k = lugares.length; lugares.push(u.claveLocal) }
        u.ruta = id; u.parada = k;
      });
      return {id:id, local:true, grupo:g, provisional:true, nombre:'Ruta local '+(n+1), paradas:lugares.map(function(k){ return [titulo(k),[k]] })};
    });
    var sueltas = Object.keys(porDestino).sort().map(function(k){
      var id = 'local-'+k.toLowerCase().replace(/ /g,'-');
      porDestino[k].forEach(function(u){ u.ruta = id; u.parada = 0 });
      return {id:id, local:true, provisional:true, nombre:'Local - '+titulo(k), paradas:[[titulo(k),[k]]]};
    });
    return armadas.concat(sueltas);
  }
  var LOCAL = / (WASH|WASHINGTON|SUC|AMERICAS|GDL|GUADALAJARA|ZMG|ZAPOPAN|TLAQUEPAQUE|TONALA|TLAJOMULCO|TLAJO|VALLE DE LOS MOLINOS|COLONIA|LOCAL|GRANJA|PENDIENTE) /;
  function provisionales(U){
    var grupos = {};
    U.forEach(function(u){
      if(u.hoja==='entregado' || u.ruta) return;
      if(['cerca','distribuidor','granja','sin'].indexOf(u.z)>-1 || /^\s*local\s*$/i.test(u.tipo_destino||'')) return;
      var d = normaDestino(u.destino), clave = d.replace(ESTADO_MX,' ').trim();
      if(!clave || LOCAL.test(d)) return;
      (grupos[clave] = grupos[clave] || []).push(u);
    });
    return Object.keys(grupos).sort().filter(function(k){ return grupos[k].length>=2 }).map(function(k){
      var id = 'prov-'+k.toLowerCase().replace(/ /g,'-'), lugar = titulo(k);
      grupos[k].forEach(function(u){ u.ruta = id; u.parada = 0 });
      return {id:id, provisional:true, nombre:'Por fletera - '+lugar, paradas:[[lugar,[k]]]};
    });
  }

  window.Logistica = {
    cargar:cargar, RUTAS:RUTAS, rutaDe:rutaDe, ESTADOS:ESTADOS, TIPOS:TIPOS, ZONAS:ZONAS, BODEGAS:BODEGAS, PASOS:PASOS, MESES:MESES,
    cap:cap, nombre:nombre,
    fecha:function(d){ return d ? d.getDate()+' '+MESES[d.getMonth()] : '—' },
    esc:function(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]}) },
    lugar:function(u){ return cap((u.destino||'Sin destino').toLowerCase()) },
    nombreDe:function(lista,id){ var x = lista.find(function(e){return e.id===id}); return x ? x.nombre : id }
  };
})();
