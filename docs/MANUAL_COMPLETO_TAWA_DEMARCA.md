# MANUAL COMPLETO — TAWA Co / DEMARCA SYSTEM

Sistema interno moderno para gestionar inventario, compras, ventas, devoluciones, logística, finanzas reales y analítica por canal/país/producto. Diseñado para escaneo (EAN) y multi-tienda.

## 1) Visión general

Queremos un sistema privado, rápido y escalable, que reemplace los Excel manuales y conecte todo el flujo real del negocio:

- Compras (proveedores + compras en marketplaces/tiendas)
- Recepción / control de calidad
- Inventario físico (almacenes + ubicaciones)
- Salidas (picking/packing) con escáner
- Devoluciones (tracking + estado del producto + reingreso o no vendible)
- Finanzas reales (ganancia verdadera, conciliación de pagos "payouts", comisiones, CPA, embalaje, envíos, devoluciones)
- Analítica por canal/país/producto (lo más importante)
- Permisos estrictos: almacén NO ve costos, proveedores, márgenes, ganancias

## 2) Estructura corporativa (multi-tenant)

### Nivel 1: Empresa madre (Holding)

Ejemplo: TAWA Co.
Controla usuarios globales y varias tiendas.

### Nivel 2: Tiendas (Brands)

Ejemplo: DEMARCA (ahora).
Luego: DODICI, Vintage, etc.

Regla: Cada tienda tiene la misma estructura de módulos (plantilla), pero configura sus países, canales, almacenes, facturación, etc.

## 3) Login (2 niveles como requisito)

### Login 1 (Holding)

- Selección de empresa: TAWA Co
- Muestra lista de tiendas disponibles (por permisos)

### Login 2 (Tienda)

- Elegir tienda (DEMARCA)
- Usuario/contraseña por tienda
- Idioma UI por usuario (ES/IT/PT/EN/DE)
- Solo `ADMIN_STE` puede: "+ Agregar tienda"

## 4) Ficha de tienda (obligatoria al crear una tienda)

Cuando se crea una tienda (DEMARCA), se completa un perfil:

### Identidad

- Nombre tienda
- Logo (imagen)
- Descripción interna
- Color/tema opcional

### Operación

- Países donde vende (ES, PT, DE, IT…)
- Idiomas del equipo / tienda
- Monedas usadas (EUR, USD, CNY, PEN, TRY…)
- Moneda base interna para cálculos: EUR

### Canales de venta (marketplaces)

- Shopify ES / Shopify AL
- Idealo ES / Idealo DE
- +Agregar canal (manual o API futuro)

Para cada canal:

- Estado (activo/inactivo)
- Comisión/fees (manual)
- CPA/publicidad (si aplica)
- Tiempos de pago (ej: 15 días post-entrega, 20 días hábiles, 1 mes)
- Almacenes vinculados

### Almacenes

- España / Italia / Perú…
- FIFO por defecto: siempre activo

### Facturación

- Prefijo numeración facturas (ej: DEM-2026-000001)
- Plantilla invoice (básica al inicio)

### Roles y permisos

- Qué roles pueden ver finanzas/costos/proveedores
- Qué roles operan almacén

## 5) Principio técnico clave: Producto Maestro vs Lotes (FIFO)

### Producto Maestro

Es la identidad del producto:

- Tipo: reloj / bolso / perfume (y futuro vintage/reparado)
- Marca
- Modelo (AR2434)
- EAN (si existe) o EAN interno generado
- Fotos
- Atributos (color/talla/medidas/género/material)
- Descripción interna para atención al cliente
- Estado (activo/inactivo/archivado)

### Lote (Batch/Lot)

Cada compra real crea un lote:

- Fecha de compra/recepción
- Proveedor (pueden ser varios para mismo producto)
- Cantidad recibida
- Cantidad disponible
- Coste real unitario (incluye prorrateos) en EUR base
- Multi-moneda rastreable

FIFO obligatorio: al vender, se descuenta del lote más antiguo primero.

## 6) Multi-moneda (regla realista)

En compras pueden existir 3 niveles:

- Proveedor cotiza en CNY
- Pago se realiza en USD
- Tarjeta descuenta en EUR

Regla: todo monto se guarda con:

- moneda original
- tipo de cambio usado en ese momento
- equivalente en EUR congelado (para que el histórico no cambie)

La ganancia verdadera siempre se calcula con los equivalentes fijos.

## 7) Multi-idioma (UI y contenido)

### UI (interfaz)

Idioma por usuario: ES/IT/PT/EN/DE.

### Contenido del producto

Un producto puede tener nombres distintos por canal e idioma:

- Shopify: título A
- Idealo DE: título B en alemán
- KuantoKusta: título C en portugués

Se permite guardar textos por:

- (producto + idioma) y/o
- (producto + canal + idioma)

## 8) Menú final del sistema (lado izquierdo)

- Dashboard
- Analytics
- Ventas
- Pedidos (Salidas / Operaciones)
- Inventario
- Compras
- Proveedores
- 3PL / Importación
- Devoluciones
- Clientes
- Tareas / Notificaciones
- Chat / Equipo online
- Configuración (Holding/Tienda/Canales/Almacenes/Permisos/Idiomas/Monedas)

## 9) Módulo Inventario (separación operativa vs analítica)

### 9.1 Inventario Operativo (para almacén)

NO muestra:

- costos
- proveedores
- márgenes
- ganancias
- analítica financiera

SÍ muestra:

- cantidad
- ubicación física
- disponible online (por canal)
- EAN, modelo, tipo, marca
- acciones de escaneo

Lista de inventario: selector por almacén.

Arriba:

- Selector: Almacén: España ▼
- + Agregar almacén
- Buscador: EAN / Modelo / SKU / Marca
- Filtros: Tipo, Marca, Estado, Activo online…
- Botón: + Añadir producto
- Toggle 👁 Mostrar imágenes (ver/no ver foto)

Columnas mínimas:

- Tipo | Marca | Modelo | EAN | Stock (almacén seleccionado) | Ubicación | Estado | Online (iconos)

Regla: si stock en almacén seleccionado = 0 pero hay stock en otro:

- Stock (ES): 0
- Observación: Disponible en IT (3), PE (1)

### 9.2 Inventario Admin (solo ADMIN)

Tabs/panel extra:

- costo promedio / FIFO
- valor de inventario
- margen estimado
- historial de costos por lote
- alertas de cambio de costo (subió/bajó X%)

### 9.3 Analítica de Inventario (solo dentro de Analytics)

En `Analytics → Inventario` se ve:

- Producto con más salidas (top por unidades)
- Producto con más entradas (últimas recepciones)
- Stock agotado / bajo stock
- Productos inmóviles (90 días sin moverse)
- Rotación alta/media/lenta
- Devoluciones por producto

No se mezcla con la lista operativa.

## 10) Ficha interna del producto (pantalla principal)

### A) Header

- Foto principal grande
- Tipo, Marca, Modelo
- EAN (copiar)
- Chips de estado (activo / agotado / en tránsito)
- Acciones rápidas: Escanear entrada / Escanear salida / Transferir / Historial / Alertas

### B) Datos del producto

- Atributos (color, talla, medidas, género)
- Descripción interna para atención al cliente
- Galería de fotos
- Links de referencia (web)

### C) Publicaciones por canal

Para cada canal:

- nombre público (puede ser distinto)
- EAN usado en ese canal (si difiere)
- URL directa al listing
- estado (activo/inactivo)
- precio por canal (si se maneja ahí)

### D) Inventario

- stock por almacén
- ubicaciones físicas
- en tránsito (cuando exista compras conectadas)
- acciones de transferencias

### E) Lotes FIFO (ADMIN only)

- Lista de lotes con fecha/proveedor/costo/cantidad
- El sistema descuenta del más antiguo primero

### F) Historial (audit timeline)

- entradas
- salidas
- movimientos
- devoluciones
- ajustes con motivo y usuario

### G) Devoluciones / no vendibles

- porcentaje de devolución
- motivos principales
- unidades no vendibles / en reparación / vendibles con descuento

## 11) Escaneo (scanner Eyoyo) — flujo real

### 11.1 Reglas generales del escaneo

Al escanear un código:

1. Buscar en `products.ean`
2. Si no existe, buscar en `ean_aliases`
3. Si no existe, ofrecer:
   - Crear producto nuevo
   - Generar EAN interno
   - guardar foto y datos mínimos

### 11.2 Recepción (entradas)

Objetivo: al abrir paquete, confirmar y meter stock.

Pantalla:

- seleccionar PO (pedido de compra) o modo recepción manual
- escanear items uno por uno
- contador por producto con foto grande
- finalizar:
  - Todo correcto → crea lotes + movimientos IN
  - Incidencias → faltante/roto/dañado (registro)

### 11.3 Preparación (salidas)

Objetivo: modo McDonalds.

Pantalla:

- lista de pedidos por preparar
- entrar al pedido:
  - muestra ubicación exacta (almacén/estantería/caja)
  - escanear producto para validar
  - confirmar salida → crea movimiento OUT y descuenta FIFO

## 12) Compras y proveedores (estructura y estados)

### 12.1 Ficha de proveedor (proveedores fijos)

Campos:

- nombre comercial, contacto, ciudad, país
- moneda habitual, método pago (sensible)
- link tienda/catálogo
- vacaciones
- estado activo/inactivo
- métricas (a futuro): tiempo promedio entrega, productos comprados

### 12.2 Pedidos de compra (PO)

Estados sugeridos:

- Borrador → Enviado → Precios recibidos → Pagado → Preparando → Foto/Checklist → Tracking recibido → En tránsito → Recibido → Verificado → Cerrado / Incidencia

Dentro de PO:

- items: modelo/EAN/foto/cantidad
- pagos multi-moneda (con FX)
- tracking y tiempos (pedido→pago, pago→tracking, tracking→llegada, total)
- confirmación de recepción que alimenta inventario

Importante: precio no se guarda fijo en catálogo proveedor, porque cambia. Se guarda en el lote/PO.

## 13) 3PL / Importación (estructura)

Compras con almacenes intermedios (USA, Turquía, China) usando tramos:

- Origen → 3PL → Almacén final

Cada tramo guarda:

- costo (envío/fees/aduana si aplica)
- moneda + FX
- tracking
- peso/dimensiones (si 3PL lo da)

## 14) Ventas y origen de canal (crítico)

Aunque Idealo pase por Shopify técnicamente, se debe guardar:

- Plataforma que procesa (`platform`: Shopify)
- Canal de origen (`source`: Idealo DE / Idealo ES / Orgánico / Ads)

Ejemplo pedido #1168:

- platform: Shopify
- source: Idealo DE
- país cliente: DE

Esto habilita analítica real por canal/país.

## 15) Payouts / Conciliación

Módulo para registrar pagos reales de plataformas:

- fecha pago
- monto
- fees/comisiones
- ajustes/refunds/retenciones
- match con pedidos incluidos

Así se detecta dónde está el problema.

## 16) Devoluciones (RMA) — casos reales

Se escanean 2 cosas:

- Tracking (identifica pedido/cliente)
- Producto (identifica qué entra)

Campos clave:

- motivo (lista + texto)
- quién pagó etiqueta (tú/cliente/marketplace)
- estado del producto (nuevo/abierto/dañado/no vendible)
- recuperación de embalaje (caja reutilizable, burbuja, papel)
- decisión: restock / descuento / reparación / scrap
- costo de devolución (etiqueta + repack + pérdida)

Listas:

- Pendiente revisión
- No vendible
- En reparación
- Re-stock listo

## 17) Roles, privacidad y permisos por campo

Ejemplos:

- `ADMIN_STE`: todo + agregar tiendas + ver costos/proveedores/ganancias
- `ADMIN_ALE`: todo
- `ADMIN_KAT`: sin finanzas, sin proveedores (configurable)
- `ALMACÉN`: inventario operativo, pedidos, recepción/salidas, devoluciones operativas

`ALMACÉN` NO ve costos, márgenes, proveedores, ganancias.

Permisos por:

- módulos (ver/editar)
- campos sensibles (costos, proveedores, márgenes)

## 18) Presencia (quién está conectado) + horas + chat interno

Requisitos:

- ver quién está online
- hora de conexión
- último evento (ej: preparando pedido #1180)
- chat interno por canales (`#almacen`, `#compras`, `#devoluciones`)
- mensajes con enlaces a pedido/producto

## 19) Analytics (decisiones)

Siempre con selector de rango:

- este mes / 30 días / trimestre / 6 meses / año / personalizado

### Analytics → Canales

Ventas / ganancia real / margen / devoluciones por:

- Shopify orgánico
- Idealo DE
- Idealo ES
- KuantoKusta
- etc.

### Analytics → Países

Ventas y margen por país (ES/DE/PT/IT).

### Analytics → Producto

- producto más vendido
- producto más rentable
- producto con más devoluciones
- producto lento (stock muerto)
- recomendación de reposición (cuando haya históricos)

## 20) Roadmap recomendado (implementación por fases)

### Fase 1 (núcleo)

- Holding + Tienda + Usuarios/Permisos base
- Productos + EAN interno + alias
- Canales + precios + links
- Almacenes + ubicaciones
- Lotes FIFO + movimientos (audit)
- Inventario operativa por almacén
- Ficha producto completa (sin ventas automáticas aún)
- Multi-moneda base (`currencies` + `fx_rates`)
- i18n base UI

### Fase 2

- Ventas/pedidos completos
- Payouts (conciliación)
- Facturas (PDF)
- Alertas de stock y backorder formal

### Fase 3

- Compras proveedor completas + 3PL + prorrateos automáticos
- Integraciones: Shopify, AfterShip, SendCloud (asistidas, no ciegas)

## 21) Prompt corto para arranque

> "Estoy construyendo un sistema interno multi-tenant llamado TAWA Co con tiendas como DEMARCA. Necesito implementar Fase 1: productos con EAN real o EAN interno escaneable, alias EAN, canales dinámicos (Shopify/Idealo), precios por canal y URL, almacenes y ubicaciones, inventario por lotes FIFO con movimientos auditables, selector de almacén en lista, y permisos estrictos (almacén no ve costos ni analítica). Incluye multi-moneda (guardar moneda original + FX + EUR base congelado) e i18n (ES/IT/PT/EN/DE). Dame arquitectura repo, esquema BD, endpoints y pantallas base."
