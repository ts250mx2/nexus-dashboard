-- Esquema propio del portal para los CIERRES DE INVENTARIO.
-- El portal lo crea solo la primera vez (src/lib/inventory/cierres.ts, ensureCierresSchema);
-- este archivo es la referencia y sirve para crearlo a mano o para revisar los permisos.

CREATE DATABASE IF NOT EXISTS BDNexusWeb CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS BDNexusWeb.inventario_cierre (
    IdCierre        INT AUTO_INCREMENT PRIMARY KEY,
    Fecha           DATE         NOT NULL,           -- día del cierre (CURDATE() del servidor)
    IdSucursal      INT          NOT NULL,
    Sucursal        VARCHAR(80)  NOT NULL,
    GeneradoEn      DATETIME     NOT NULL,           -- hora exacta en que se tomó la foto
    FechaCorteERP   DATETIME     NULL,               -- corte tipo 99 del ERP que sirvió de existencia inicial
    CorteGeneradoEn DATETIME     NULL,               -- UPDATE_TIME de tblReporteMovimientos en ese momento
    Articulos       INT          NOT NULL DEFAULT 0,
    ConExistencia   INT          NOT NULL DEFAULT 0,
    Negativos       INT          NOT NULL DEFAULT 0,
    ConMovimiento   INT          NOT NULL DEFAULT 0,
    Unidades        DOUBLE       NOT NULL DEFAULT 0, -- suma de existencia final
    Entradas        DOUBLE       NOT NULL DEFAULT 0,
    Salidas         DOUBLE       NOT NULL DEFAULT 0,
    Valor           DOUBLE       NOT NULL DEFAULT 0, -- existencia final × costo
    DuracionMs      INT          NOT NULL DEFAULT 0,
    Ok              TINYINT      NOT NULL DEFAULT 0, -- 1 = cierre completo; 0 = falló (ver Error)
    Error           TEXT         NULL,
    UNIQUE KEY uq_fecha_sucursal (Fecha, IdSucursal)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS BDNexusWeb.inventario_cierre_detalle (
    IdCierre            INT          NOT NULL,
    IdArticulo          INT          NOT NULL,
    Codigo              VARCHAR(60)  NOT NULL,
    Descripcion         VARCHAR(200) NOT NULL,
    Marca               VARCHAR(80)  NOT NULL DEFAULT '',
    Depto               VARCHAR(80)  NOT NULL DEFAULT '',
    ExiInicial          DOUBLE       NOT NULL,       -- corte del ERP (o conteo físico posterior)
    Entradas            DOUBLE       NOT NULL,       -- documentos posteriores al corte, en vivo
    Salidas             DOUBLE       NOT NULL,
    ExiFinal            DOUBLE       NOT NULL,       -- ExiInicial + Entradas - Salidas
    Costo               DOUBLE       NOT NULL,
    Consignacion        DOUBLE       NOT NULL DEFAULT 0,
    UltimaActualizacion DATETIME     NULL,
    Fuente              VARCHAR(20)  NOT NULL DEFAULT 'movimientos',
    PRIMARY KEY (IdCierre, IdArticulo),
    KEY ix_articulo (IdArticulo),
    CONSTRAINT fk_cierre_detalle FOREIGN KEY (IdCierre)
        REFERENCES BDNexusWeb.inventario_cierre (IdCierre) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Recomendado: un usuario del portal que solo lea el ERP y solo escriba en su esquema.
-- CREATE USER 'nexus_web'@'%' IDENTIFIED BY '<contraseña>';
-- GRANT SELECT ON BDNexus.* TO 'nexus_web'@'%';
-- GRANT SELECT, INSERT, UPDATE, DELETE, CREATE ON BDNexusWeb.* TO 'nexus_web'@'%';

-- Retención: el portal conserva hoy + 3 días; la purga corre tras cada cierre:
-- DELETE FROM BDNexusWeb.inventario_cierre WHERE Fecha < DATE_SUB(CURDATE(), INTERVAL 3 DAY);

-- Tarea programada (23:55, todos los días), desde el servidor del portal:
-- curl -X POST -H "x-cierre-token: <CIERRE_TOKEN de .env.local>" http://localhost:3012/api/inventarios/cierres
