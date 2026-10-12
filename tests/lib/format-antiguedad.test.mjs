import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { diasDesde, formatAntiguedad } from '../../src/lib/format.ts';

const HOY = new Date(2026, 9, 12, 15, 0, 0); // 12 de octubre de 2026, 3 de la tarde

describe('diasDesde', () => {
    it('cuenta días de calendario, no bloques de 24 horas', () => {
        // Arrange: anoche a las 11, menos de 24 horas atrás, pero es otro día.
        const anoche = new Date(2026, 9, 11, 23, 0, 0);

        // Act / Assert
        assert.equal(diasDesde(anoche, HOY), 1);
    });

    it('da cero para una venta de hoy, a cualquier hora', () => {
        assert.equal(diasDesde(new Date(2026, 9, 12, 0, 1, 0), HOY), 0);
        assert.equal(diasDesde(new Date(2026, 9, 12, 23, 59, 0), HOY), 0);
    });

    it('cuenta bien a través de un cambio de mes', () => {
        assert.equal(diasDesde(new Date(2026, 8, 30, 10, 0, 0), HOY), 12);
    });

    it('devuelve null cuando no hay fecha o no se entiende', () => {
        assert.equal(diasDesde(null, HOY), null);
        assert.equal(diasDesde('', HOY), null);
        assert.equal(diasDesde('no es fecha', HOY), null);
    });
});

describe('formatAntiguedad', () => {
    it('traduce los casos cercanos a palabras', () => {
        assert.equal(formatAntiguedad(new Date(2026, 9, 12, 9, 0, 0), HOY), 'Hoy');
        assert.equal(formatAntiguedad(new Date(2026, 9, 11, 9, 0, 0), HOY), 'Ayer');
    });

    it('cuenta los días cuando ya hay distancia', () => {
        assert.equal(formatAntiguedad(new Date(2026, 9, 1, 9, 0, 0), HOY), 'Hace 11 días');
    });

    it('marca con raya una sucursal sin ventas', () => {
        assert.equal(formatAntiguedad(null, HOY), '—');
    });
});
