/* Reglas del inventario de bodegas (sin pantalla, para poder probarlas con node --test).
   El catálogo es lo que regresa public.inv_catalogo(). */
(function(raiz){
  function porId(lista, id){ for(var i=0;i<(lista||[]).length;i++){ if(lista[i].id===id) return lista[i]; } return null; }

  // Piezas que debería traer un contenedor: por renglón, la lista base del modelo más lo que agrega
  // o quita cada opción, por la cantidad del renglón. Las piezas que llevan el color del vehículo se
  // separan por color; las demás se juntan. Se quitan las que den 0 o menos.
  function piezasEsperadas(renglones, cat){
    var mapa = {}, orden = [];
    (renglones||[]).forEach(function(r){
      var ops = r.opciones || [];
      (cat.materiales||[]).forEach(function(m){
        var aplica = m.modelo_id!=null ? m.modelo_id===r.modelo_id : ops.indexOf(m.opcion_id) > -1;
        if(!aplica) return;
        var pz = porId(cat.piezas, m.pieza_id); if(!pz) return;
        var color = pz.lleva_color ? r.color_id : null;
        var k = pz.id + '|' + (color==null ? '' : color);
        if(!mapa[k]){
          var c = color==null ? null : porId(cat.colores, color);
          mapa[k] = {pieza_id: pz.id, nombre: pz.nombre, color_id: color, color: c ? c.nombre : null, esperadas: 0};
          orden.push(k);
        }
        mapa[k].esperadas += m.cantidad * (r.cantidad||0);
      });
    });
    return orden.map(function(k){ return mapa[k] }).filter(function(p){ return p.esperadas > 0 })
      .sort(function(a,b){ return a.nombre.localeCompare(b.nombre,'es') || String(a.color||'').localeCompare(String(b.color||''),'es') });
  }

  // Modelos de los renglones que todavía no tienen lista de piezas
  function sinListaDePiezas(renglones, cat){
    var vistos = {}, res = [];
    (renglones||[]).forEach(function(r){
      if(vistos[r.modelo_id]) return; vistos[r.modelo_id] = 1;
      var tiene = (cat.materiales||[]).some(function(m){ return m.modelo_id===r.modelo_id });
      if(!tiene){ var mo = porId(cat.modelos, r.modelo_id); res.push(mo ? mo.nombre : 'Modelo ' + r.modelo_id); }
    });
    return res;
  }

  function diferencia(esperadas, llegaron){
    return {faltan: Math.max(0, esperadas - llegaron), sobran: Math.max(0, llegaron - esperadas)};
  }

  function normaNumero(n){ return String(n==null?'':n).trim().toUpperCase() }

  // Errores en palabras de la bodega; [] si está bien. "existentes": números ya registrados (otros contenedores)
  function validarContenedor(d, existentes){
    var e = [], num = normaNumero(d.numero);
    if(!num) e.push('Escribe el número de contenedor');
    else if((existentes||[]).some(function(x){ return normaNumero(x)===num })) e.push('Ese contenedor ya está registrado');
    if(!d.llegada) e.push('Escribe la fecha de llegada');
    if(!d.renglones || !d.renglones.length) e.push('Agrega al menos un vehículo');
    else if(d.renglones.some(function(r){ return !(r.cantidad >= 1) })) e.push('La cantidad debe ser 1 o más');
    return e;
  }

  function validarPieza(p){
    var e = [];
    if(p.esperadas < 0 || p.llegaron < 0 || (p.danadas||0) < 0) e.push('Las cantidades no pueden ser negativas');
    if((p.danadas||0) > p.llegaron) e.push('No puede haber más dañadas que las que llegaron');
    return e;
  }

  // Totales de la revisión de piezas: faltan, sobran, dañadas y cuántas faltan por revisar
  function resumenRevision(piezas){
    var r = {faltan: 0, sobran: 0, danadas: 0, pendientes: 0, total: (piezas||[]).length};
    (piezas||[]).forEach(function(p){
      if(!p.revisada){ r.pendientes++; return; }
      var d = diferencia(p.esperadas, p.llegaron);
      r.faltan += d.faltan; r.sobran += d.sobran; r.danadas += p.danadas || 0;
    });
    return r;
  }

  // "Con hidráulico", "Sin hidráulico"; las demás: "Rodado sencillo", "Rodado doble"
  function nombreOpcion(caracteristica, opcion){
    if(/^(con|sin)$/i.test(opcion)) return opcion + ' ' + caracteristica.toLowerCase();
    return caracteristica + ' ' + opcion.toLowerCase();
  }

  function nombreVehiculo(r, cat){
    var partes = [], mo = porId(cat.modelos, r.modelo_id);
    partes.push(mo ? mo.nombre : '?');
    (cat.caracteristicas||[]).forEach(function(c){
      (c.opciones||[]).forEach(function(o){ if((r.opciones||[]).indexOf(o.id) > -1) partes.push(nombreOpcion(c.nombre, o.nombre)); });
    });
    var co = porId(cat.colores, r.color_id); if(co) partes.push(co.nombre);
    return partes.join(' · ');
  }

  var api = {piezasEsperadas: piezasEsperadas, sinListaDePiezas: sinListaDePiezas, diferencia: diferencia,
    validarContenedor: validarContenedor, validarPieza: validarPieza, nombreOpcion: nombreOpcion, resumenRevision: resumenRevision,
    nombreVehiculo: nombreVehiculo, porId: porId, normaNumero: normaNumero};
  if(typeof module !== 'undefined' && module.exports) module.exports = api; else raiz.Inventario = api;
})(this);
