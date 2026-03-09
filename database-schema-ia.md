# Nexus Database Schema

## Tablas y Reglas de Negocio

### Tabla: tblVentas
Esta tabla contiene las cabeceras de las ventas.
| Columna | Tipo | Descripción |
| :--- | :--- | :--- |
| IdVenta | int | ID único de la venta. |
| IdSucursal | int | ID de la sucursal. |
| Folio | int | Número de folio de la venta. |
| FechaVenta | datetime | Fecha de la transacción. |
| Total | double | Monto total de la venta. |
| IdCliente | int | ID del cliente. |
| IdUsuario | int | ID del usuario/cajero. |

### Tabla: tblDetalleVentas
Esta tabla contiene los artículos vendidos en cada ticket.
| Columna | Tipo | Descripción |
| :--- | :--- | :--- |
| IdVenta | int | Relación con tblVentas. |
| IdArticulo | int | ID del producto. |
| Cantidad | double | Unidades vendidas. |
| PrecioBase | double | Precio unitario. |
| Total | double | Monto de la línea (Cantidad * Precio). |

### Tabla: tblSucursales
Catálogo de sucursales.
| Columna | Tipo | Descripción |
| :--- | :--- | :--- |
| IdSucursal | int | ID único. |
| Nombre | varchar | Nombre de la sucursal. |

### Tabla: tblArticulos
Catálogo de productos.
| Columna | Tipo | Descripción |
| :--- | :--- | :--- |
| IdArticulo | int | ID único. |
| Producto | varchar | Nombre del producto. |
| Depto | varchar | Departamento/Categoría. |
| CodigoBarras | varchar | Código de barras. |

#### Reglas de Cálculo:
- **Venta Total**: `SUM(V.Total)` de `tblVentas`.
- **Top Artículos**: `SELECT A.Producto, SUM(D.Total) FROM tblDetalleVentas D JOIN tblArticulos A ON D.IdArticulo = A.IdArticulo GROUP BY A.Producto`.
- **Sucursales**: Join con `tblSucursales` para mostrar nombres.
