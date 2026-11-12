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

  // manuales: las rutas que armó el usuario arrastrando lugares ([{lugar, grupo, orden}], de logistica_rutas_lugares())
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
    // Cada parada lleva [nombre, palabras, lugar]; "lugar" es la clave con que se guarda en una ruta armada.
    // Las fijas se copian para poder marcar las paradas que el usuario pasó a una ruta armada.
    var fijas = RUTAS.map(function(ru){
      return Object.assign({}, ru, {paradas: ru.paradas.map(function(p){ return [p[0], p[1], 'F|'+ru.id+'|'+p[1][0]] })});
    });
    var porId = {}; fijas.forEach(function(ru){ porId[ru.id] = ru });
    var prov = provisionales(U);
    prov.forEach(function(ru){ porId[ru.id] = ru });
    U.forEach(function(u){ if(u.ruta && porId[u.ruta]) u.lugar = porId[u.ruta].paradas[u.parada][2] });
    var sueltas = locales(U);
    var armadas = armar(U, manuales||[], fijas.concat(prov, sueltas));
    var vivas = function(lista){ return lista.filter(function(ru){ return !ru.vacia }) };
    // Orden (pedido del usuario): rutas locales armadas y locales sueltas primero; luego las rutas armadas con lugares
    // foráneos, las individuales fijas, las provisionales y al final las fijas de varias paradas
    var unaParada = function(ru){ return ru.paradas.length===1 };
    var rutas = armadas.filter(function(ru){ return ru.local }).concat(vivas(sueltas), armadas.filter(function(ru){ return !ru.local }),
      vivas(fijas.filter(unaParada)), vivas(prov), fijas.filter(function(ru){ return !unaParada(ru) }));
    // Prioridad del flete: la venta más antigua sale primero
    U.filter(function(u){return u.estado==='flete'})
     .sort(function(a,b){ return (a.f||0)-(b.f||0) || a.i-b.i })
     .forEach(function(u,n){ u.prioridad = n+1 });
    return {unidades:U, corte:CORTE, rutas:rutas};
  }

  // Rutas armadas a mano (12-nov-2026): el usuario arrastra lugares (con todas sus remisiones), locales o de cualquier
  // ruta, para juntarlos en una ruta nueva con las paradas en el orden que decide. Si todos sus lugares son locales se
  // llama "Ruta local N"; si no, "Ruta foránea N". El lugar sale de su tarjeta original: en una ruta fija su parada
  // dice en qué ruta quedó; una tarjeta de un solo lugar se esconde.
  function armar(U, manuales, origen){
    var parada = {}; // lugar -> {ruta, k}
    origen.forEach(function(ru){ ru.paradas.forEach(function(p,k){ parada[p[2]] = {ruta:ru, k:k} }) });
    var conUnidades = {}; U.forEach(function(u){ if(u.lugar && u.hoja!=='entregado') (conUnidades[u.lugar] = conUnidades[u.lugar] || []).push(u) });
    // Lugares de cada ruta armada, en su orden (los que ya no tienen unidades no cuentan)
    var porGrupo = {};
    manuales.forEach(function(m){ if(conUnidades[m.lugar] && parada[m.lugar]) (porGrupo[m.grupo] = porGrupo[m.grupo] || []).push(m) });
    // Una ruta que se quedó con un solo lugar (los otros ya se entregaron) no se muestra como ruta
    Object.keys(porGrupo).forEach(function(g){ if(porGrupo[g].length<2) delete porGrupo[g] });
    var n = {local:0, foranea:0};
    return Object.keys(porGrupo).map(Number).sort(function(a,b){ return a-b }).map(function(g){
      var id = 'rl-'+g, lugares = porGrupo[g].sort(function(a,b){ return a.orden-b.orden }).map(function(m){ return m.lugar });
      var local = lugares.every(function(k){ return conUnidades[k][0].local });
      var nombre = local ? 'Ruta local '+(++n.local) : 'Ruta foránea '+(++n.foranea);
      var paradas = lugares.map(function(k,i){
        var o = parada[k];
        conUnidades[k].forEach(function(u){ u.ruta = id; u.parada = i });
        // Marca la parada original: en una ruta fija dice dónde quedó; una tarjeta de un solo lugar se esconde
        o.ruta.paradas[o.k] = o.ruta.paradas[o.k].slice(0,3).concat([nombre]);
        if(o.ruta.paradas.length===1) o.ruta.vacia = true;
        return [o.ruta.paradas[o.k][0], o.ruta.paradas[o.k][1], k];
      });
      return {id:id, local:local, armada:true, grupo:g, provisional:true, nombre:nombre, paradas:paradas};
    });
  }

  var ESTADO_MX = /( (JAL|JALISCO|NAY|NAYARIT|MICH|MICHOACAN|GTO|GUANAJUATO|COL|COLIMA|SIN|SINALOA|SON|SONORA|ZAC|ZACATECAS|DGO|AGS|QRO|SLP|NL|BC|BCS|GRO|OAX|VER|CHIS|CHIH|COAH|TAMPS|HGO|MOR|PUE|TLAX|TAB|YUC|QROO|CAMP|EDO DE MEX|EDOMEX|MEX))+ $/;
  function titulo(k){ return k.toLowerCase().replace(/(^| )(\S)/g,function(m,a,b){ return a+b.toUpperCase() }) }
  // Envíos locales (12-nov-2026): lo de Guadalajara y alrededores que no cae en ninguna ruta. Una tarjeta por lugar
  // ("Tlaquepaque"). No van las que se recogen en granja ni las que no tienen destino.
  // El lugar de una local es su destino normalizado sin estado.
  function locales(U){
    var porLugar = {};
    U.forEach(function(u){
      if(u.hoja==='entregado' || u.ruta || u.z==='granja' || u.z==='sin') return;
      var d = normaDestino(u.destino);
      if(/ (GRANJA|PENDIENTE|RECOGE) /.test(d)) return;
      if(['cerca','lejos','distribuidor'].indexOf(u.z)<0 && !LOCAL.test(d) && !/^\s*(semi\s*)?local\s*$/i.test(u.tipo_destino||'')) return;
      var clave = d.replace(ESTADO_MX,' ').trim(); if(!clave) return;
      u.local = true; u.lugar = clave;
      (porLugar[clave] = porLugar[clave] || []).push(u);
    });
    return Object.keys(porLugar).sort().map(function(k){
      var id = 'local-'+k.toLowerCase().replace(/ /g,'-');
      porLugar[k].forEach(function(u){ u.ruta = id; u.parada = 0 });
      return {id:id, local:true, provisional:true, nombre:titulo(k), paradas:[[titulo(k),[k],k]]};
    });
  }
  var LOCAL = / (WASH|WASHINGTON|SUC|AMERICAS|GDL|GUADALAJARA|ZMG|ZAPOPAN|TLAQUEPAQUE|TONALA|TLAJOMULCO|TLAJO|VALLE DE LOS MOLINOS|COLONIA|LOCAL|GRANJA|PENDIENTE) /;
  // Rutas provisionales (12-nov-2026): si 2 o más unidades de Ventas van al mismo destino que no está en
  // ninguna ruta, se arma una ruta para ese destino. No cuentan las locales (zona naranja, distribuidor,
  // granja, sin destino, TIPO DE DESTINO "Local" o lugares de la zona metropolitana).
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
      return {id:id, provisional:true, nombre:'Por fletera - '+lugar, paradas:[[lugar,[k],'F|'+id]]};
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
