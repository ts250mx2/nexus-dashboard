import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    TIPO_CORTE,
    TIPO_TODOS,
    calcularSaldos,
    diasEntre,
    etiquetaTipo,
    existenciaActual,
    filtrarPorTipo,
    resumirPorTipo,
} from '../../../src/lib/inventory/movimientos-view.ts';

/** Renglón base de prueba; cada caso sobrescribe lo que necesita. */
const mov = (extra = {}) => ({
    TipoMovimiento: 1,
    Mov: -1,
    FechaMovimiento: '2026-08-20T10:00:00.000Z',
    Dia: '2026-08-20',
    Editado: 0,
    ...extra,
});

describe('diasEntre', () => {
    it('devuelve 0 para el mismo día', () => {
        assert.equal(diasEntre('2026-08-25', '2026-08-25'), 0);
    });

    it('cuenta días calendario entre dos fechas', () => {
        assert.equal(diasEntre('2026-08-01', '2026-08-25'), 24);
    });

    it('devuelve 0 si alguna fecha es inválida', () => {
        assert.equal(diasEntre('no-es-fecha', '2026-08-25'), 0);
    });
});

describe('existenciaActual', () => {
    const corte = { ExiCorte: 740, FechaCorte: '2026-08-25T06:00:00.000Z' };

    it('suma al corte solo los movimientos posteriores a su fecha', () => {
        const rows = [
            mov({ Mov: -5, FechaMovimiento: '2026-08-24T10:00:00.000Z' }),
            mov({ TipoMovimiento: TIPO_CORTE, Mov: 0, FechaMovimiento: corte.FechaCorte }),
            mov({ Mov: -2, FechaMovimiento: '2026-08-25T15:00:00.000Z' }),
            mov({ TipoMovimiento: 2, Mov: 10, FechaMovimiento: '2026-08-25T16:00:00.000Z' }),
        ];
        assert.equal(existenciaActual(rows, corte, 999), 748);
    });

    it('devuelve el corte cuando nada se movió después', () => {
        const rows = [mov({ Mov: -5, FechaMovimiento: '2026-08-24T10:00:00.000Z' })];
        assert.equal(existenciaActual(rows, corte, 999), 740);
    });

    it('usa el respaldo de costo cuando no hay corte', () => {
        assert.equal(existenciaActual([mov()], { ExiCorte: null, FechaCorte: null }, 12), 12);
    });

    it('suma los movimientos listados cuando no hay corte ni respaldo', () => {
        const rows = [mov({ Mov: 3 }), mov({ Mov: -1 })];
        assert.equal(existenciaActual(rows, { ExiCorte: null, FechaCorte: null }, null), 2);
    });
});

describe('calcularSaldos', () => {
    it('recorre hacia atrás desde la existencia actual como el ERP', () => {
        const rows = [
            mov({ TipoMovimiento: 0, Mov: -189 }),
            mov({ Mov: -3 }),
            mov({ TipoMovimiento: 2, Mov: 5 }),
            mov({ TipoMovimiento: TIPO_CORTE, Mov: 0 }),
        ];
        const saldos = calcularSaldos(rows, 2);
        assert.deepEqual(saldos.map(r => r.Exi), [0, -3, 2, 2]);
    });

    it('no muta los renglones de entrada', () => {
        const rows = [mov(), mov({ Mov: 4 })];
        const copia = structuredClone(rows);
        const saldos = calcularSaldos(rows, 5);
        assert.deepEqual(rows, copia);
        assert.notEqual(saldos[0], rows[0]);
    });

    it('redondea el ruido binario de cantidades decimales', () => {
        const saldos = calcularSaldos([mov({ Mov: 0.1 }), mov({ Mov: 0.2 })], 0.3);
        assert.deepEqual(saldos.map(r => r.Exi), [0.1, 0.3]);
    });

    it('devuelve lista vacía sin renglones', () => {
        assert.deepEqual(calcularSaldos([], 10), []);
    });
});

describe('resumirPorTipo', () => {
    const rows = [
        mov({ TipoMovimiento: 0, Mov: -189, FechaMovimiento: '2026-08-01T10:00:00.000Z', Dia: '2026-08-01', Editado: 1 }),
        mov({ TipoMovimiento: 1, Mov: -2, FechaMovimiento: '2026-08-05T10:00:00.000Z', Dia: '2026-08-05' }),
        mov({ TipoMovimiento: 1, Mov: -4, FechaMovimiento: '2026-08-10T10:00:00.000Z', Dia: '2026-08-10', Editado: 1 }),
        mov({ TipoMovimiento: 4, Mov: 10, FechaMovimiento: '2026-08-15T10:00:00.000Z', Dia: '2026-08-15' }),
        mov({ TipoMovimiento: TIPO_CORTE, Mov: 0, FechaMovimiento: '2026-08-21T06:00:00.000Z', Dia: '2026-08-21' }),
    ];
    const resumen = resumirPorTipo(rows);
    const todos = resumen.find(r => r.TipoMovimiento === TIPO_TODOS);
    const ventas = resumen.find(r => r.TipoMovimiento === 1);

    it('pone TODOS primero y luego cada tipo en orden numérico', () => {
        assert.deepEqual(resumen.map(r => r.TipoMovimiento), [TIPO_TODOS, 0, 1, 4]);
        assert.equal(resumen[0].Etiqueta, 'TODOS');
    });

    it('no cuenta el corte como movimiento', () => {
        assert.equal(todos.Folios, 4);
        assert.equal(todos.Cantidad, -185);
    });

    it('totaliza, promedia y cuenta editados por tipo', () => {
        assert.equal(ventas.Folios, 2);
        assert.equal(ventas.Cantidad, -6);
        assert.equal(ventas.PromFolio, -3);
        assert.equal(ventas.FechaMin, '2026-08-05T10:00:00.000Z');
        assert.equal(ventas.FechaMax, '2026-08-10T10:00:00.000Z');
        assert.equal(ventas.Editados, 1);
        assert.equal(todos.Editados, 2);
    });

    it('divide el promedio diario entre los días de toda la lista, corte incluido', () => {
        // 2026-08-01 → 2026-08-21 = 20 días
        assert.equal(todos.PromDia, -185 / 20);
        assert.equal(ventas.PromDia, -6 / 20);
    });

    it('usa al menos un día cuando todo ocurrió el mismo día', () => {
        const mismoDia = resumirPorTipo([mov({ Mov: -3 }), mov({ Mov: -1 })]);
        assert.equal(mismoDia[0].PromDia, -4);
    });

    it('devuelve resumen vacío cuando solo hay corte', () => {
        assert.deepEqual(resumirPorTipo([mov({ TipoMovimiento: TIPO_CORTE, Mov: 0 })]), []);
        assert.deepEqual(resumirPorTipo([]), []);
    });
});

describe('filtrarPorTipo', () => {
    const rows = [mov({ TipoMovimiento: 1 }), mov({ TipoMovimiento: 3 }), mov({ TipoMovimiento: TIPO_CORTE, Mov: 0 })];

    it('TODOS devuelve una copia con todos los renglones, corte incluido', () => {
        const todos = filtrarPorTipo(rows, TIPO_TODOS);
        assert.deepEqual(todos, rows);
        assert.notEqual(todos, rows);
    });

    it('filtra por tipo de movimiento', () => {
        assert.deepEqual(filtrarPorTipo(rows, 3).map(r => r.TipoMovimiento), [3]);
        assert.deepEqual(filtrarPorTipo(rows, 5), []);
    });
});

describe('etiquetaTipo', () => {
    it('traduce los tipos conocidos', () => {
        assert.equal(etiquetaTipo(1), 'VENTAS');
        assert.equal(etiquetaTipo(TIPO_CORTE), 'INVENTARIO A FECHA');
    });

    it('describe los tipos desconocidos', () => {
        assert.equal(etiquetaTipo(7), 'TIPO 7');
    });
});
