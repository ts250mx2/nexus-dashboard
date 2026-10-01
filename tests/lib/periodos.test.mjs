import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { aFechaCalendario, aFechaLocal, coberturaDelPeriodo, finDelPeriodo } from '../../src/lib/periodos.ts';

describe('aFechaCalendario', () => {
    it('lee un Date por sus componentes locales, no por UTC', () => {
        // Arrange: medianoche local del 29 de junio.
        const fecha = new Date(2026, 5, 29, 0, 0, 0);

        // Act / Assert
        assert.equal(aFechaCalendario(fecha), '2026-06-29');
    });

    it('recorta un texto de fecha a YYYY-MM-DD', () => {
        assert.equal(aFechaCalendario('2026-07-01'), '2026-07-01');
        assert.equal(aFechaCalendario('2026-07-01T06:00:00.000Z'), '2026-07-01');
    });
});

describe('finDelPeriodo', () => {
    it('un día termina en sí mismo', () => {
        assert.equal(finDelPeriodo('2026-09-15', 'dia'), '2026-09-15');
    });

    it('una semana termina seis días después', () => {
        assert.equal(finDelPeriodo('2026-09-28', 'semana'), '2026-10-04');
    });

    it('un mes termina en su último día, incluidos los de 30 y febrero', () => {
        assert.equal(finDelPeriodo('2026-10-01', 'mes'), '2026-10-31');
        assert.equal(finDelPeriodo('2026-09-01', 'mes'), '2026-09-30');
        assert.equal(finDelPeriodo('2026-02-01', 'mes'), '2026-02-28');
        assert.equal(finDelPeriodo('2028-02-01', 'mes'), '2028-02-29');
    });
});

describe('coberturaDelPeriodo', () => {
    it('marca completo un mes que cabe entero en el rango', () => {
        // Arrange / Act: septiembre dentro de un rango que va de julio a octubre.
        const c = coberturaDelPeriodo('2026-09-01', 'mes', '2026-07-01', '2026-10-01');

        // Assert
        assert.deepEqual(c, { DiasCubiertos: 30, DiasPeriodo: 30, Parcial: false });
    });

    it('marca parcial el mes en curso, que es el caso que deformaba la gráfica', () => {
        // Arrange / Act: octubre con un solo día corrido.
        const c = coberturaDelPeriodo('2026-10-01', 'mes', '2026-07-01', '2026-10-01');

        // Assert
        assert.deepEqual(c, { DiasCubiertos: 1, DiasPeriodo: 31, Parcial: true });
    });

    it('marca parcial la primera semana cuando el rango empieza a media semana', () => {
        // Arrange / Act: la semana del lunes 29-jun en un rango que abre el 1-jul.
        const c = coberturaDelPeriodo('2026-06-29', 'semana', '2026-07-01', '2026-10-01');

        // Assert: solo entran del 1 al 5 de julio.
        assert.deepEqual(c, { DiasCubiertos: 5, DiasPeriodo: 7, Parcial: true });
    });

    it('marca parcial la última semana cuando el rango cierra a media semana', () => {
        // Arrange / Act
        const c = coberturaDelPeriodo('2026-09-28', 'semana', '2026-07-01', '2026-10-01');

        // Assert: del 28-sep al 1-oct son cuatro días de siete.
        assert.deepEqual(c, { DiasCubiertos: 4, DiasPeriodo: 7, Parcial: true });
    });

    it('nunca marca parcial una agrupación por día', () => {
        const c = coberturaDelPeriodo('2026-09-15', 'dia', '2026-09-01', '2026-09-30');
        assert.deepEqual(c, { DiasCubiertos: 1, DiasPeriodo: 1, Parcial: false });
    });

    it('cuenta una semana completa dentro del rango', () => {
        const c = coberturaDelPeriodo('2026-09-07', 'semana', '2026-07-01', '2026-10-01');
        assert.deepEqual(c, { DiasCubiertos: 7, DiasPeriodo: 7, Parcial: false });
    });

    it('sigue siendo parcial si el rango termina en el futuro y se topó con hoy', () => {
        // Arrange: quien llama topa `hasta` con hoy antes de preguntar.
        const c = coberturaDelPeriodo('2026-10-01', 'mes', '2026-10-01', '2026-10-01');

        // Assert
        assert.equal(c.Parcial, true);
        assert.equal(c.DiasCubiertos, 1);
    });
});

describe('aFechaLocal', () => {
    it('parsea una fecha sola en el calendario local, no en UTC', () => {
        // Arrange: new Date('2026-10-01') da medianoche UTC, que en México es el
        // 30 de septiembre; así se corría un mes la etiqueta del eje.
        const d = aFechaLocal('2026-10-01');

        // Assert
        assert.equal(d.getFullYear(), 2026);
        assert.equal(d.getMonth(), 9);
        assert.equal(d.getDate(), 1);
    });

    it('no corre el mes al etiquetar, que era el síntoma', () => {
        // Arrange / Act
        const etiqueta = (f) => aFechaLocal(f).toLocaleDateString('es-MX', { month: 'short' });

        // Assert
        assert.match(etiqueta('2026-09-01'), /sep/);
        assert.match(etiqueta('2026-10-01'), /oct/);
    });

    it('respeta una marca de tiempo completa tal como viene', () => {
        // Arrange: así llegan las fechas agrupadas por día y por semana.
        const d = aFechaLocal('2026-09-28T06:00:00.000Z');

        // Assert
        assert.equal(d.getTime(), new Date('2026-09-28T06:00:00.000Z').getTime());
    });

    it('deja pasar un Date sin tocarlo', () => {
        const original = new Date(2026, 8, 28);
        assert.equal(aFechaLocal(original), original);
    });
});
