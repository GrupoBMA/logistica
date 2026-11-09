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
  // Celda del vehículo pintada en el Excel = no hay vehículo o piezas para empezar
  function esperaPiezas(r){ return !!r.color_vehiculo && r.color_vehiculo !== 'theme0' }

  function cargar(ventas, corte){
    var CORTE = corte ? new Date(corte+'T12:00:00') : new Date();
    var U = (ventas||[]).map(function(r,i){
      var f = r.fecha ? new Date(r.fecha+'T12:00:00') : null;
      var ok = r.pasos.filter(function(x){return x==='ok'}).length;
      var dist = /MOTOPLAZA/i.test(r.destino||'') ? 'Motoplaza' : '';
      var z = dist ? 'distribuidor' : (r.zona==='motoplaza' ? 'distribuidor' : r.zona==='pacifico' ? 'sucursal' : (r.zona||'sin'));
      var estado = r.hoja==='entregado' ? 'entregada' : ok===5 ? 'flete' : esperaPiezas(r) ? 'piezas' : ok>0 || r.pasos.indexOf('x')>-1 ? 'taller' : 'empezar';
      return Object.assign({}, r, nombre(r.vehiculo), {
        i:i, f:f, dias: f ? Math.round((CORTE-f)/864e5) : null, ok:ok, estado:estado,
        tipo:tipo(r.vehiculo), z:z, distribuidor:dist, bodega:bodega(r.activacion)
      });
    });
    // Prioridad del flete: la venta más antigua sale primero
    U.filter(function(u){return u.estado==='flete'})
     .sort(function(a,b){ return (a.f||0)-(b.f||0) || a.i-b.i })
     .forEach(function(u,n){ u.prioridad = n+1 });
    return {unidades:U, corte:CORTE};
  }

  window.Logistica = {
    cargar:cargar, ESTADOS:ESTADOS, TIPOS:TIPOS, ZONAS:ZONAS, BODEGAS:BODEGAS, PASOS:PASOS, MESES:MESES,
    cap:cap, nombre:nombre,
    fecha:function(d){ return d ? d.getDate()+' '+MESES[d.getMonth()] : '—' },
    esc:function(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]}) },
    lugar:function(u){ return cap((u.destino||'Sin destino').toLowerCase()) },
    nombreDe:function(lista,id){ var x = lista.find(function(e){return e.id===id}); return x ? x.nombre : id }
  };
})();
