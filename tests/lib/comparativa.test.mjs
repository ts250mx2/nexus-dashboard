import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { baseComparativa, periodoComparativo } from '../../src/lib/periodos.ts';

describe('periodoComparativo · anterior', () => {
    it('toma el bloque de los mismos días justo antes', () => {
        // Arrange: del 1 al 16 de octubre son 16 días.
        // Act
        const r = periodoComparativo('2026-10-01', '2026-10-16', 'anterior');

        // Assert: los 16 días que terminan la víspera.
        assert.deepEqual(r, { inicio: '2026-09-15', fin: '2026-09-30' });
    });

    it('funciona con un rango de un solo día', () => {
        const r = periodoComparativo('2026-10-16', '2026-10-16', 'anterior');
        assert.deepEqual(r, { inicio: '2026-10-15', fin: '2026-10-15' });
    });

    it('cruza el cambio de año sin perderse', () => {
        const r = periodoComparativo('2027-01-01', '2027-01-10', 'anterior');
        assert.deepEqual(r, { inicio: '2026-12-22', fin: '2026-12-31' });
    });
});

describe('periodoComparativo · mes', () => {
    it('toma las mismas fechas del mes anterior', () => {
        const r = periodoComparativo('2026-10-01', '2026-10-16', 'mes');
        assert.deepEqual(r, { inicio: '2026-09-01', fin: '2026-09-16' });
    });

    it('recorta el día cuando el mes anterior es más corto', () => {
        // Arrange: el 31 de octubre no existe en septiembre.
        const r = periodoComparativo('2026-10-01', '2026-10-31', 'mes');

        // Assert
        assert.deepEqual(r, { inicio: '2026-09-01', fin: '2026-09-30' });
    });

    it('recorta contra febrero, que es el caso que suele romperse', () => {
        const r = periodoComparativo('2026-03-29', '2026-03-31', 'mes');
        assert.deepEqual(r, { inicio: '2026-02-28', fin: '2026-02-28' });
    });

    it('retrocede de enero a diciembre del año anterior', () => {
        const r = periodoComparativo('2027-01-05', '2027-01-20', 'mes');
        assert.deepEqual(r, { inicio: '2026-12-05', fin: '2026-12-20' });
    });
});

describe('periodoComparativo · anio', () => {
    it('toma las mismas fechas del año anterior', () => {
        const r = periodoComparativo('2026-10-01', '2026-10-16', 'anio');
        assert.deepEqual(r, { inicio: '2025-10-01', fin: '2025-10-16' });
    });

    it('recorta el 29 de febrero cuando el año anterior no es bisiesto', () => {
        // Arrange: 2028 es bisiesto, 2027 no.
        const r = periodoComparativo('2028-02-29', '2028-02-29', 'anio');

        // Assert
        assert.deepEqual(r, { inicio: '2027-02-28', fin: '2027-02-28' });
    });
});

describe('baseComparativa', () => {
    it('acepta las tres bases conocidas', () => {
        assert.equal(baseComparativa('anterior'), 'anterior');
        assert.equal(baseComparativa('mes'), 'mes');
        assert.equal(baseComparativa('anio'), 'anio');
    });

    it('cae en el deslizante ante cualquier cosa rara', () => {
        assert.equal(baseComparativa(null), 'anterior');
        assert.equal(baseComparativa(''), 'anterior');
        assert.equal(baseComparativa('trimestre'), 'anterior');
    });
});
