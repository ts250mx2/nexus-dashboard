import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compararCierres, filtrarComparacion } from '../../../src/lib/inventory/cierres-comparar.ts';

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

describe('compararCierres', () => {
    it('marca cuadra cuando el corte del ERP coincide con el cierre anterior', () => {
        // Arrange: cierre del 24 con existencia final 8; el 25 el ERP abre con 8.
        const d24 = cierre('2026-08-24', [articulo(1, { ExiInicial: 10, Salidas: 2, ExiFinal: 8 })]);
        const hoy = {
            fecha: '2026-08-25',
            calculadoEn: '2026-08-25T18:00:00.000Z',
            fechaCorteERP: '2026-08-25T06:00:00.000Z',
            detalle: [articulo(1, { ExiInicial: 8, Salidas: 1, ExiFinal: 7 })],
        };

        // Act
        const r = compararCierres([d24], hoy);

        // Assert
        assert.equal(r.columnas.length, 2);
        assert.equal(r.columnas[1].esHoy, true);
        assert.equal(r.columnas[1].corteRenovado, true);
        assert.equal(r.filas[0].celdas[1].estado, 'cuadra');
        assert.equal(r.filas[0].celdas[1].diferencia, 0);
        assert.equal(r.filas[0].estado, 'cuadra');
        assert.equal(r.kpis.cuadran, 1);
        assert.equal(r.transiciones[0].cuadran, 1);
    });

    it('expone la diferencia cuando el corte del ERP no coincide con el cierre anterior', () => {
        const d24 = cierre('2026-08-24', [articulo(1, { ExiFinal: 8 })]);
        const hoy = {
            fecha: '2026-08-25',
            calculadoEn: '2026-08-25T18:00:00.000Z',
            fechaCorteERP: '2026-08-25T06:00:00.000Z',
            detalle: [articulo(1, { ExiInicial: 11, ExiFinal: 11 })],
        };

        const r = compararCierres([d24], hoy);

        assert.equal(r.filas[0].celdas[1].estado, 'diferencia');
        assert.equal(r.filas[0].celdas[1].diferencia, 3);
        assert.equal(r.filas[0].diferenciaTotal, 3);
        assert.equal(r.kpis.conDiferencia, 1);
        assert.equal(r.kpis.unidadesDiferencia, 3);
        assert.equal(r.kpis.valorDiferencia, 75);
    });

    it('no verifica cuando el ERP no generó un corte nuevo después del cierre anterior', () => {
        // El corte de hoy sigue siendo el del 24 (anterior al cierre de las 23:55 del 24).
        const d24 = cierre('2026-08-24', [articulo(1, { ExiFinal: 8 })]);
        const hoy = {
            fecha: '2026-08-25',
            calculadoEn: '2026-08-25T18:00:00.000Z',
            fechaCorteERP: '2026-08-24T06:00:00.000Z',
            detalle: [articulo(1, { ExiInicial: 10, ExiFinal: 6 })],
        };

        const r = compararCierres([d24], hoy);

        assert.equal(r.columnas[1].corteRenovado, false);
        assert.equal(r.filas[0].celdas[1].estado, 'sin_verificacion');
        assert.equal(r.filas[0].estado, 'sin_verificacion');
        assert.equal(r.transiciones[0].comparados, 0);
    });

    it('ordena los cierres por fecha y marca sin_dato al artículo que falta en una columna', () => {
        const d23 = cierre('2026-08-23', [articulo(1, { ExiFinal: 5 }), articulo(2, { ExiFinal: 3 })]);
        const d24 = cierre('2026-08-24', [articulo(1, { ExiInicial: 5, ExiFinal: 4 })]);

        const r = compararCierres([d24, d23], null);

        assert.deepEqual(r.columnas.map(c => c.clave), ['2026-08-23', '2026-08-24']);
        const fila2 = r.filas.find(f => f.IdArticulo === 2);
        assert.equal(fila2.celdas[1].estado, 'sin_dato');
        assert.equal(fila2.celdas[1].exiFinal, null);
        const fila1 = r.filas.find(f => f.IdArticulo === 1);
        assert.equal(fila1.celdas[1].estado, 'cuadra');
    });

    it('devuelve vacío sin cierres ni hoy', () => {
        const r = compararCierres([], null);
        assert.equal(r.columnas.length, 0);
        assert.equal(r.filas.length, 0);
        assert.equal(r.kpis.articulos, 0);
    });
});

describe('filtrarComparacion', () => {
    const d24 = cierre('2026-08-24', [articulo(1, { ExiFinal: 8 }), articulo(2, { ExiFinal: -2, Descripcion: 'CINTA MORADA' })]);
    const hoy = {
        fecha: '2026-08-25',
        calculadoEn: '2026-08-25T18:00:00.000Z',
        fechaCorteERP: '2026-08-25T06:00:00.000Z',
        detalle: [articulo(1, { ExiInicial: 9, ExiFinal: 9 }), articulo(2, { ExiInicial: -2, ExiFinal: -2, Descripcion: 'CINTA MORADA' })],
    };
    const { filas } = compararCierres([d24], hoy);

    it('solo diferencias', () => {
        const r = filtrarComparacion(filas, { search: '', soloDiferencias: true, soloNegativos: false });
        assert.deepEqual(r.map(f => f.IdArticulo), [1]);
    });

    it('solo negativos', () => {
        const r = filtrarComparacion(filas, { search: '', soloDiferencias: false, soloNegativos: true });
        assert.deepEqual(r.map(f => f.IdArticulo), [2]);
    });

    it('busca por palabras sin acentos ni mayúsculas', () => {
        const r = filtrarComparacion(filas, { search: 'cinta morád', soloDiferencias: false, soloNegativos: false });
        assert.deepEqual(r.map(f => f.IdArticulo), [2]);
    });
});

describe('compararCierres · adyacencia y conteo', () => {
    it('no verifica cuando falta el cierre de un dia intermedio (el corte trae los movimientos del dia perdido)', () => {
        // Cierre del 23; no hay cierre del 24; hoy 25 abre con el corte del 25.
        const d23 = cierre('2026-08-23', [articulo(1, { ExiFinal: 8 })]);
        const hoy = {
            fecha: '2026-08-25',
            calculadoEn: '2026-08-25T18:00:00.000Z',
            fechaCorteERP: '2026-08-25T06:00:00.000Z',
            corteGeneradoEn: '2026-08-25T08:06:00.000Z',
            detalle: [articulo(1, { ExiInicial: 5, ExiFinal: 5 })],
        };

        const r = compararCierres([d23], hoy);

        assert.equal(r.columnas[1].corteRenovado, false);
        assert.equal(r.filas[0].celdas[1].estado, 'sin_verificacion');
        assert.equal(r.kpis.conDiferencia, 0);
    });

    it('verifica un cierre tomado minutos despues de medianoche contra el corte de esa misma medianoche', () => {
        // Cierre del 25 tomado el 26 a las 00:10 (06:10Z); el ERP genero el corte del 26 (00:00 = 06:00Z) a las 02:06 (08:06Z).
        const d25 = { fecha: '2026-08-25', generadoEn: '2026-08-26T06:10:00.000Z', fechaCorteERP: '2026-08-25T06:00:00.000Z', detalle: [articulo(1, { ExiFinal: 8 })] };
        const hoy = {
            fecha: '2026-08-26',
            calculadoEn: '2026-08-26T18:00:00.000Z',
            fechaCorteERP: '2026-08-26T06:00:00.000Z',
            corteGeneradoEn: '2026-08-26T08:06:00.000Z',
            detalle: [articulo(1, { ExiInicial: 8, ExiFinal: 8 })],
        };

        const r = compararCierres([d25], hoy);

        assert.equal(r.columnas[1].corteRenovado, true);
        assert.equal(r.filas[0].celdas[1].estado, 'cuadra');
    });

    it('marca conteo cuando la existencia inicial de hoy viene de un conteo fisico', () => {
        const d24 = cierre('2026-08-24', [articulo(1, { ExiFinal: 8 })]);
        const hoy = {
            fecha: '2026-08-25',
            calculadoEn: '2026-08-25T18:00:00.000Z',
            fechaCorteERP: '2026-08-25T06:00:00.000Z',
            detalle: [articulo(1, { ExiInicial: 20, ExiFinal: 19, Fuente: 'conteo' })],
        };

        const r = compararCierres([d24], hoy);

        assert.equal(r.filas[0].celdas[1].estado, 'conteo');
        assert.equal(r.filas[0].estado, 'sin_verificacion');
        assert.equal(r.transiciones[0].conConteo, 1);
        assert.equal(r.kpis.conDiferencia, 0);
    });
});
