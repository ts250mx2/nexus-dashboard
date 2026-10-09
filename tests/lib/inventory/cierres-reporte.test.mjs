import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compararCierres } from '../../../src/lib/inventory/cierres-comparar.ts';
import {
    filasReporte,
    filasResumen,
    resumenComparacion,
} from '../../../src/lib/inventory/cierres-reporte.ts';

const articulo = (id, extra = {}) => ({
    IdArticulo: id,
    Codigo: `A${id}`,
    Descripcion: `ARTICULO ${id}`,
    Marca: 'NEXUS',
    Depto: 'CINTAS',
    ExiInicial: 10,
    Entradas: 0,
    Salidas: 0,
    ExiFinal: 10,
    Costo: 25,
    Consignacion: 0,
    ...extra,
});

const cierre = (fecha, detalle, corte = `${fecha}T06:00:00.000Z`) => ({
    fecha,
    generadoEn: `${fecha}T23:55:00.000Z`,
    fechaCorteERP: corte,
    detalle,
});

// 24: art 1 cierra en 8, art 2 en 5. 25: el ERP abre art 1 en 8 (cuadra) y art 2 en 3 (falta 2).
const comparacion = () => compararCierres([
    cierre('2026-08-24', [articulo(1, { Salidas: 2, ExiFinal: 8 }), articulo(2, { ExiInicial: 5, ExiFinal: 5 })]),
    cierre('2026-08-25', [articulo(1, { ExiInicial: 8, ExiFinal: 8 }), articulo(2, { ExiInicial: 3, Entradas: 1, ExiFinal: 4 })]),
], null);

const resultado = {
    fecha: '2026-08-25',
    generadoEn: '2026-08-25T23:55:00.000Z',
    corteGeneradoEn: null,
    purgados: 0,
    sucursales: [
        { IdSucursal: 7, Sucursal: 'MONTERREY', fecha: '2026-08-25', ok: true, articulos: 2, unidades: 12, valor: 300, negativos: 0, conMovimiento: 1, duracionMs: 1, fechaCorteERP: null },
        { IdSucursal: 8, Sucursal: 'SALTILLO', fecha: '2026-08-25', ok: false, error: 'timeout', articulos: 0, unidades: 0, valor: 0, negativos: 0, conMovimiento: 0, duracionMs: 1, fechaCorteERP: null },
    ],
};

describe('filasReporte', () => {
    it('pone primero las diferencias con su valor a costo', () => {
        // Act
        const filas = filasReporte(comparacion());

        // Assert
        assert.equal(filas[0].Codigo, 'A2');
        assert.equal(filas[0].Estado, 'Diferencia');
        assert.equal(filas[0].CierreAnterior, 5);
        assert.equal(filas[0].CorteERP, 3);
        assert.equal(filas[0].CierreHoy, 4);
        assert.equal(filas[0].Diferencia, -2);
        assert.equal(filas[0].ValorDiferencia, -50);
        assert.equal(filas[1].Estado, 'Cuadra');
    });

    it('con un solo cierre deja vacío el anterior y la diferencia', () => {
        // Arrange
        const comp = compararCierres([cierre('2026-08-25', [articulo(1)])], null);

        // Act
        const [fila] = filasReporte(comp);

        // Assert
        assert.equal(fila.CierreAnterior, '');
        assert.equal(fila.Diferencia, '');
        assert.equal(fila.Estado, 'Sin dato');
    });
});

describe('resumenComparacion', () => {
    it('cuenta la última transición y valora la diferencia absoluta', () => {
        // Act
        const r = resumenComparacion(comparacion());

        // Assert
        assert.equal(r.anterior, '2026-08-24');
        assert.equal(r.cuadran, 1);
        assert.equal(r.conDiferencia, 1);
        assert.equal(r.unidadesDiferencia, 2);
        assert.equal(r.valorDiferencia, 50);
    });
});

describe('filasResumen', () => {
    it('reporta la sucursal fallida con su error', () => {
        // Act
        const filas = filasResumen(resultado, new Map([[7, comparacion()]]));

        // Assert
        assert.equal(filas[0].ConDiferencia, 1);
        assert.equal(filas[1].Guardado, 'No');
        assert.match(filas[1].Observaciones, /timeout/);
    });
});
