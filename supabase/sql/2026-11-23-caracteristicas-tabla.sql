-- 23-nov-2026: las características se escogen en una tabla con casillas.
-- Orden pedido por el usuario: Cabina, Hidráulico, Pick up, Plus, Rodado.
-- Hidráulico pasa de Con/Sin a Sí/No (mismos ids, solo cambia el nombre).
-- Las nuevas (Cabina, Pick up, Plus) van en los 3 modelos; se cambia en Catálogos.

update logistica.inv_opciones set nombre = 'Sí' where caracteristica_id = (select id from logistica.inv_caracteristicas where nombre = 'Hidráulico') and nombre = 'Con';
update logistica.inv_opciones set nombre = 'No' where caracteristica_id = (select id from logistica.inv_caracteristicas where nombre = 'Hidráulico') and nombre = 'Sin';

insert into logistica.inv_caracteristicas (nombre, orden, activo)
select v.nombre, v.orden, true from (values ('Cabina', 1), ('Pick up', 3), ('Plus', 4)) v(nombre, orden)
where not exists (select 1 from logistica.inv_caracteristicas c where c.nombre = v.nombre);

update logistica.inv_caracteristicas set orden = 2 where nombre = 'Hidráulico';
update logistica.inv_caracteristicas set orden = 5 where nombre = 'Rodado';

insert into logistica.inv_opciones (caracteristica_id, nombre, orden, activo)
select c.id, o.nombre, o.orden, true
from logistica.inv_caracteristicas c
cross join (values ('Sí', 1), ('No', 2)) o(nombre, orden)
where c.nombre in ('Cabina', 'Pick up', 'Plus')
  and not exists (select 1 from logistica.inv_opciones x where x.caracteristica_id = c.id and x.nombre = o.nombre);

insert into logistica.inv_modelo_opciones (modelo_id, opcion_id)
select m.id, o.id
from logistica.inv_modelos m
cross join logistica.inv_opciones o
join logistica.inv_caracteristicas c on c.id = o.caracteristica_id
where c.nombre in ('Cabina', 'Pick up', 'Plus')
  and not exists (select 1 from logistica.inv_modelo_opciones x where x.modelo_id = m.id and x.opcion_id = o.id);
