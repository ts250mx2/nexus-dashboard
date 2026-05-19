# Nexus Database Schema (MySQL — BDNexus)

Esquema documentado para uso del agente IA. Todas las consultas son SOLO LECTURA.
Solo se documentan las tablas más relevantes para análisis de negocio.

## VENTAS

### tblVentas — Cabeceras de venta (513K filas)
| Columna | Tipo | Notas |
|---|---|---|
| IdVenta | int | PK |
| IdSucursal | int | FK → tblSucursales |
| FolioVenta | varchar | Folio del ticket |
| FechaVenta | datetime | Fecha y hora del ticket |
| IdUsuarioVenta | int | Cajero (FK → tblUsuarios) |
| IdSocio | int | Profesor/socio asignado (FK → tblSocios) |
| IdCliente | varchar | Identificador de cliente |
| Total | double | Total facturado |
| Pago, Descuentos, Credito, Anticipo, Adeudo | double | Pagos y montos asociados |
| IdTipoPago | int | Forma de pago |
| TipoVenta | int | 1=Mostrador, etc. |
| Status | int | 0=Activa, 1=Cancelada |

### tblDetalleVentas — Renglones (2M filas)
| Columna | Tipo | Notas |
|---|---|---|
| IdVenta, IdSucursal | int | FK compuesta a tblVentas |
| IdArticulo | int | FK → tblArticulos |
| Cantidad | double | Unidades vendidas |
| PrecioVenta | double | **Precio real vendido (usar para revenue)** |
| Precio | double | Precio de lista |
| Descuento | double | Descuento aplicado a la línea |
| IVA | double | IVA de la línea |
| DescripcionVenta | varchar | Descripción al momento de la venta |

**Revenue por línea**: `Cantidad * PrecioVenta - Descuento`
**Total venta**: `tblVentas.Total` ya incluye todo

## CATÁLOGO DE PRODUCTOS

### tblArticulos — Catálogo (4K filas)
| Columna | Tipo | Notas |
|---|---|---|
| IdArticulo | smallint | PK |
| Codigo, CodigoBarras | varchar | Identificadores |
| Producto, Descripcion | varchar | Nombre del producto |
| Marca, Color, Talla, Modelo | varchar | Atributos |
| Depto | varchar | Departamento |
| IdCategoria | tinyint | FK → tblCategorias |
| IdTipoProducto | int | FK → tblTiposProducto |
| IdProveedor | int | Proveedor |
| PrecioBase | double | Precio base global (no es costo) |
| ExiMin | double | Existencia mínima recomendada |
| DiasSurtido, DiasMax | int | Lead time esperado |
| Status | tinyint | 0=Activo |

### tblCategorias, tblTiposProducto, tblMarcas
Catálogos auxiliares.

## COSTOS E INVENTARIO

### tblCostoInventario — Existencias y costo actual por sucursal (53K filas)
**Tabla clave para margen y rotación.**

| Columna | Tipo | Notas |
|---|---|---|
| IdArticulo, IdSucursal | int | PK compuesta |
| Exi | double | Existencia actual |
| Ventas, Recibo, TraspasosEntrada, TraspasosSalida, Devoluciones, AjusteInventario, Consignacion | double | Acumulados de movimientos |
| **PrecioBase** | double | **COSTO UNITARIO promedio para esa sucursal — usar para cost of goods** |

**Costo de una venta**: `tblCostoInventario.PrecioBase × Cantidad` (join por IdArticulo + IdSucursal)

### tblCostoInventarioHistorial — Costos por día (31M filas, usar con cuidado)
Snapshot diario de costos. Útil para reconstruir margen histórico exacto.
Columnas: `Dia, Mes, Anio, Fecha, IdArticulo, IdSucursal, PrecioBase, ...`

## COMPRAS

### tblOrdenesCompra — Cabeceras de orden de compra (104K filas)
| Columna | Tipo | Notas |
|---|---|---|
| IdOrdenCompra | int | PK |
| IdProveedor | int | Proveedor |
| FechaOrdenCompra | datetime | Fecha de creación |
| FechaRecibo, FechaPago, FechaTimbrado | datetime | Hitos |
| IdSucursal | int | Sucursal destino |
| Total, TotalRec, TotalFactura | double | Monto pedido / recibido / facturado |
| FormaPago | varchar | |
| Status | int | Estado de la orden |
| UUID, RFCEmisor, Emisor | varchar | Datos fiscales |

### tblDetalleOrdenesCompra — Líneas de OC (973K filas)
| Columna | Tipo | Notas |
|---|---|---|
| IdOrdenCompra, IdArticulo | int | |
| Cantidad | double | Cantidad pedida |
| Costo | double | **Costo unitario en la orden** |
| Rec | double | Cantidad recibida |
| IVA | double | |

## PRECIOS

### tblListaPrecios — Precio vigente por zona y artículo (20K filas)
| Columna | Tipo | Notas |
|---|---|---|
| IdZona, IdArticulo | int | PK |
| Precio1, Precio2, Precio3, Precio4 | double | Niveles de precio |
| FechaAct | datetime | Última actualización |

### tblListaPreciosHistorial — Histórico de cambios (61M filas, no escanear sin filtros)
Cada cambio de precio queda registrado. Columnas: `IdZona, IdArticulo, Anio, Mes, Dia, Precio1..4, PrecioAnt1..4, PrecioBase, Cambio`.

## TRASPASOS ENTRE SUCURSALES

### tblTraspasos — Cabeceras (71K filas)
| Columna | Tipo | Notas |
|---|---|---|
| IdTraspaso | int | PK |
| IdSucursal | int | Sucursal origen |
| IdSucursalDestino | int | Sucursal destino |
| FechaTraspaso, FechaRecibo | datetime | |
| Total, CantProductos | double | |
| Status | int | |

### tblDetalleTraspasos — Líneas (778K filas)
| Columna | Tipo | Notas |
|---|---|---|
| IdTraspaso, IdArticulo | int | |
| Cantidad | double | |
| Costo | double | Costo unitario del traspaso |

## FACTURAS (CFDI)

### tblFacturas — Cabeceras (26K filas)
| Columna | Tipo | Notas |
|---|---|---|
| IdFactura | int | PK |
| IdCliente | int | |
| FechaFactura | datetime | |
| IdSucursal | int | |
| Total, TotalIva | double | |
| UUID | varchar | Identificador SAT |
| MetodoPago, UsoCFDI, TipoCFDI | varchar | Atributos fiscales |
| Status, Facturado | int | |

### tblDetalleFacturas — Líneas (120K filas)
| Columna | Tipo | Notas |
|---|---|---|
| IdFactura, IdArticulo, IdSucursal | int | |
| Cantidad, Precio, PrecioSinIva | double | |
| IVA, Descuento | double | |

## CONSIGNACIONES

### tblConsignaciones — Cabeceras (801 filas)
| Columna | Tipo | Notas |
|---|---|---|
| IdConsignacion | int | PK |
| IdSucursal | int | |
| FechaConsignacion | datetime | |
| IdSocio | int | Profesor/socio receptor |
| Total, CantProductos | double | |
| Cerrada | int | 1 si ya se cerró |

### tblDetalleConsignaciones (102K filas)
| Columna | Tipo | Notas |
|---|---|---|
| IdConsignacion, IdArticulo, IdSucursal | int | |
| CantidadSalida, CantidadEntrada | double | Lo entregado y lo devuelto |
| Precio | double | Precio acordado |

## OTROS CATÁLOGOS

### tblSucursales (17 filas)
| Columna | Tipo | Notas |
|---|---|---|
| IdSucursal | int | PK |
| Sucursal | varchar | **Usar este nombre** |
| Nombre | varchar | Alias |
| VentasMeta | double | Meta mensual |
| Iniciales | varchar | Abreviación |
| Status | int | |

### tblSocios — Profesores / socios comerciales
Usado para reporte de profesores y consignaciones.

### tblUsuarios — Cajeros / empleados
Tabla de usuarios del sistema.

## REGLAS DE CÁLCULO

- **Venta total (revenue)**: `SUM(tblVentas.Total)` filtrando `Status = 0`.
- **Revenue por línea**: `SUM(tblDetalleVentas.Cantidad * tblDetalleVentas.PrecioVenta)`.
- **Costo de venta**: `SUM(tblDetalleVentas.Cantidad * tblCostoInventario.PrecioBase)` joineando por `IdArticulo` + `IdSucursal`.
- **Margen $**: `Revenue - Costo`.
- **Margen %**: `(Revenue - Costo) / NULLIF(Revenue, 0) * 100`.
- **Ticket promedio**: `SUM(Total) / COUNT(DISTINCT IdVenta)`.
- **Stock muerto**: artículos con `Exi > 0` y sin movimiento de ventas en los últimos 90 días.
- **Días de inventario**: `(Exi / NULLIF(VentasPromedioDiario, 0))`.
- **Lead time real proveedor**: `DATEDIFF(FechaRecibo, FechaOrdenCompra)`.

## REGLAS SQL (MySQL)

- Identificadores entre backticks si tienen espacios: `` `mi col` ``.
- Fechas: `CURDATE()`, `NOW()`, `DATE_SUB(CURDATE(), INTERVAL 7 DAY)`.
- Top N: `LIMIT n` (no usar `TOP`).
- NULL-safe: `IFNULL(x, 0)`.
- Año/mes: `YEAR(FechaVenta)`, `MONTH(FechaVenta)`, `HOUR(FechaVenta)`.
- Casteo a fecha: `DATE(FechaVenta)`.
- Si filtras `tblCostoInventarioHistorial` SIEMPRE filtra por `Fecha` con rango — la tabla tiene 31M filas.
- Si filtras `tblListaPreciosHistorial` SIEMPRE filtra por `Anio` + `Mes` — la tabla tiene 61M filas.
