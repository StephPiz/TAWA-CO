# FASE 1 — Plan Técnico Ejecutable

Este documento traduce el manual funcional a tareas de implementación concretas sobre el repo actual.

## Objetivo de Fase 1

Entregar un núcleo usable para operación diaria:

- Multi-tenant (holding + store)
- Productos con EAN/alias y ficha completa
- Canales dinámicos por tienda
- Almacenes, ubicaciones e inventario por almacén
- Lotes FIFO + movimientos auditables
- Permisos por rol/campo sensible
- Multi-moneda con EUR congelado
- i18n UI base (ES/IT/PT/EN/DE)

## Alcance funcional mínimo

1. Login dual: seleccionar holding y luego tienda.
2. Gestión de tienda: perfil, países, idiomas, monedas, canales, almacenes.
3. Catálogo maestro de productos: tipo, marca, modelo, EAN principal, alias EAN, atributos, estado.
4. Ficha de producto con secciones: datos, canales, inventario, historial, lotes (admin).
5. Recepción manual por escaneo: crea lote + movimientos `IN`.
6. Salida manual por escaneo: valida EAN y descuenta FIFO con movimiento `OUT`.
7. Inventario operativo (sin costos) e inventario admin (con costos).
8. RBAC + restricciones por campo para rol `WAREHOUSE`.
9. Soporte base de divisas/fx con equivalente EUR congelado por transacción.

## Modelo de datos (núcleo)

Tablas mínimas recomendadas (alineadas con Prisma):

- `holdings`
- `stores` (FK `holding_id`)
- `users`
- `user_store_roles` (rol por tienda)
- `store_settings` (moneda base, idiomas, temas)
- `warehouses` (por tienda)
- `warehouse_locations` (pasillo/estante/caja)
- `channels` (por tienda)
- `channel_configs` (fees, payout_terms)
- `products` (maestro)
- `product_ean_aliases`
- `product_translations` (producto+idioma+canal opcional)
- `product_channel_listings` (nombre/URL/precio/estado)
- `inventory_lots` (FIFO, costo unitario EUR)
- `inventory_movements` (`IN`, `OUT`, `ADJUST`, `TRANSFER`)
- `inventory_balances` (resumen por producto+almacén)
- `currencies`
- `fx_rates`
- `money_snapshots` (moneda original + fx + EUR congelado)
- `audit_events`

## API (núcleo)

Endpoints mínimos sugeridos:

- `POST /auth/holding/select`
- `POST /auth/store/select`
- `GET /stores/:id/profile`
- `PATCH /stores/:id/profile`
- `GET /products`
- `POST /products`
- `GET /products/:id`
- `PATCH /products/:id`
- `POST /products/:id/ean-aliases`
- `DELETE /products/:id/ean-aliases/:aliasId`
- `POST /scan/resolve` (EAN principal/alias; fallback crear producto)
- `POST /inventory/receive` (entrada por escaneo)
- `POST /inventory/dispatch` (salida por escaneo + FIFO)
- `GET /inventory?warehouseId=...`
- `GET /inventory/:productId/history`
- `GET /channels`
- `POST /channels`
- `PATCH /channels/:id`

## Reglas de negocio críticas

1. FIFO estricto: toda salida consume lotes más antiguos con stock disponible.
2. Inmutabilidad financiera: el valor EUR congelado no se recalcula.
3. Permisos: usuarios `WAREHOUSE` no pueden consultar ni inferir costos.
4. Trazabilidad: toda mutación de inventario registra `audit_event` + actor.
5. EAN flexible: resolución por `products.ean` y `product_ean_aliases`.

## UI base (apps/web)

Pantallas de Fase 1:

- `select-holding`
- `select-store`
- `store/settings` (perfil tienda, idiomas, monedas, canales, almacenes)
- `store/products` (lista con filtros + selector almacén)
- `store/products/[id]` (ficha completa)
- `store/inventory` (operativo)

Secciones ocultas por rol:

- `ADMIN`: tab costos/lotes/márgenes.
- `WAREHOUSE`: solo operativo.

## Definition of Done (Fase 1)

1. Se puede crear tienda y configurarla.
2. Se puede crear producto con EAN real o interno.
3. Un EAN alias resuelve al producto correcto.
4. Recepción crea lote y aumenta stock del almacén.
5. Salida descuenta FIFO y registra movimiento.
6. Inventario operativo no expone costos para `WAREHOUSE`.
7. Auditoría registra actor, acción, entidad, timestamp.
8. UI cambia idioma por usuario en ES/IT/PT/EN/DE.
9. Multi-moneda guarda original + fx + EUR congelado.

## Orden recomendado de ejecución

1. Cerrar esquema Prisma de Fase 1 y migraciones.
2. Implementar servicios de inventario (`receive`, `dispatchFIFO`).
3. Exponer endpoints de productos/EAN/inventario.
4. Aplicar RBAC en API y vistas.
5. Completar pantallas `store/products`, `store/products/[id]`, `store/inventory`.
6. Añadir tests de negocio para FIFO y permisos.

## Tests obligatorios

- FIFO consume lotes en orden correcto.
- Salida parcial entre lotes.
- Bloqueo de salida sin stock.
- Resolución EAN por alias.
- RBAC: `WAREHOUSE` no recibe campos sensibles.
- Conversión monetaria congela EUR en transacción.
