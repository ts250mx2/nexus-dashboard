import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    formatTranscurrido,
    nivelTransmision,
    ordenarPorUrgencia,
    ultimaSenal,
} from '../../src/lib/transmisiones.ts';

const MIN = 60;

describe('nivelTransmision', () => {
    it('hasta 15 minutos está al día', () => {
        assert.equal(nivelTransmision(0), 'ok');
        assert.equal(nivelTransmision(15 * MIN), 'ok');
    });

    it('pasados 15 minutos empieza la alerta y sube con el tiempo', () => {
        assert.equal(nivelTransmision(15 * MIN + 1), 'atencion');
        assert.equal(nivelTransmision(30 * MIN + 1), 'alerta');
        assert.equal(nivelTransmision(60 * MIN + 1), 'grave');
        assert.equal(nivelTransmision(4 * 60 * MIN + 1), 'critico');
    });

    it('más de 7 días sin señal es una sucursal inactiva, no una alerta', () => {
        assert.equal(nivelTransmision(7 * 24 * 60 * MIN + 1), 'inactiva');
    });

    it('sin ninguna señal es inactiva', () => {
        assert.equal(nivelTransmision(null), 'inactiva');
    });
});

describe('formatTranscurrido', () => {
    it('escribe minutos, horas y días', () => {
        assert.equal(formatTranscurrido(30), 'hace menos de 1 min');
        assert.equal(formatTranscurrido(3 * MIN), 'hace 3 min');
        assert.equal(formatTranscurrido(2 * 60 * MIN + 14 * MIN), 'hace 2 h 14 min');
        assert.equal(formatTranscurrido(3 * 24 * 60 * MIN + 4 * 60 * MIN), 'hace 3 d 4 h');
        assert.equal(formatTranscurrido(null), 'sin registro');
    });
});

describe('ultimaSenal', () => {
    it('toma la más reciente de las dos fuentes y dice cuál fue', () => {
        // Satélite: su registro de transmisión se quedó atrás, pero llegaron tickets hoy.
        const r = ultimaSenal({ transmision: '2026-10-29T17:37:31.000Z', ticket: '2026-11-03T16:21:20.000Z' });
        assert.deepEqual(r, { fecha: '2026-11-03T16:21:20.000Z', fuente: 'ticket' });
    });

    it('con una sola fuente usa esa', () => {
        assert.deepEqual(ultimaSenal({ transmision: '2026-11-03T19:00:15.000Z', ticket: null }), {
            fecha: '2026-11-03T19:00:15.000Z',
            fuente: 'transmision',
        });
        assert.deepEqual(ultimaSenal({ transmision: null, ticket: null }), { fecha: null, fuente: null });
    });
});

describe('ordenarPorUrgencia', () => {
    it('pone primero la que lleva más tiempo sin transmitir, y al final las que no tienen señal', () => {
        const r = ordenarPorUrgencia([
            { Sucursal: 'A', segundos: 60 },
            { Sucursal: 'B', segundos: null },
            { Sucursal: 'C', segundos: 5000 },
        ]);
        assert.deepEqual(r.map(x => x.Sucursal), ['C', 'A', 'B']);
    });
});
