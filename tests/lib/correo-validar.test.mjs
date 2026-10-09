import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { remitenteValido, validarConfigCorreo } from '../../src/lib/correos.ts';

const sucursales = new Map([[1, 'MONTERREY'], [2, 'SALTILLO']]);

const entrada = (extra = {}) => ({
    smtp: { host: 'smtp.gmail.com', port: 465, user: 'cuenta@x.com', from: 'Nexus <cuenta@x.com>', pass: '' },
    general: 'gerente@x.com',
    sucursales: [{ IdSucursal: 1, correos: 'mty@x.com' }, { IdSucursal: 2, correos: '' }],
    ...extra,
});

describe('validarConfigCorreo', () => {
    it('acepta una configuración completa', () => {
        // Act
        const r = validarConfigCorreo(entrada(), sucursales);

        // Assert
        assert.equal(r.ok, true);
        assert.equal(r.data.smtp.port, 465);
        assert.equal(r.data.sucursales.length, 2);
    });

    it('permite dejar el servidor vacío para usar el del entorno', () => {
        const r = validarConfigCorreo(entrada({ smtp: { host: '', port: 587, user: '', from: '' } }), sucursales);
        assert.equal(r.ok, true);
    });

    it('rechaza un correo mal escrito y dice de qué sucursal es', () => {
        // Act
        const r = validarConfigCorreo(entrada({ sucursales: [{ IdSucursal: 2, correos: 'saltillo@x' }] }), sucursales);

        // Assert
        assert.equal(r.ok, false);
        assert.match(r.error, /SALTILLO/);
    });

    it('rechaza sucursales que no existen', () => {
        const r = validarConfigCorreo(entrada({ sucursales: [{ IdSucursal: 99, correos: '' }] }), sucursales);
        assert.equal(r.ok, false);
    });

    it('rechaza puertos fuera de rango y hosts con caracteres raros', () => {
        assert.equal(validarConfigCorreo(entrada({ smtp: { host: 'smtp.x.com', port: 70000 } }), sucursales).ok, false);
        assert.equal(validarConfigCorreo(entrada({ smtp: { host: 'smtp x;rm', port: 587 } }), sucursales).ok, false);
    });

    it('rechaza saltos de línea en el remitente', () => {
        const r = validarConfigCorreo(entrada({ smtp: { host: 'smtp.x.com', port: 587, from: 'a@x.com\nBcc: otro@y.com' } }), sucursales);
        assert.equal(r.ok, false);
    });
});

describe('remitenteValido', () => {
    it('acepta correo solo, con nombre y con nombre entre comillas', () => {
        assert.equal(remitenteValido('cuenta@x.com'), true);
        assert.equal(remitenteValido('Nexus Inventarios <cuenta@x.com>'), true);
        assert.equal(remitenteValido('"Nexus, Inventarios" <cuenta@x.com>'), true);
    });

    it('rechaza texto que no es un remitente', () => {
        assert.equal(remitenteValido('Nexus Inventarios'), false);
        assert.equal(remitenteValido('Nexus <no-es-correo>'), false);
        assert.equal(remitenteValido('a@x.com <b@y.com> <c@z.com>'), false);
    });
});

describe('validarConfigCorreo · remitente', () => {
    it('rechaza un remitente que no es correo', () => {
        const r = validarConfigCorreo(entrada({ smtp: { host: 'smtp.x.com', port: 587, from: 'Soporte del Banco' } }), sucursales);
        assert.equal(r.ok, false);
        assert.match(r.error, /remitente/);
    });
});
