import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
    HlClienteError,
    configProxy,
    hlConfigurado,
    leerConfigHl,
    limpiarCacheAgente,
    obtenerAgente,
    sdkDeProveedor,
} from '../../src/lib/hl-cliente.ts';

const KEY = `hl_${'a'.repeat(48)}`;
const UUID = '00000000-1111-2222-3333-444444444444';

const env = (extra = {}) => ({
    HL_URL: 'http://localhost:3055',
    HL_API_KEY: KEY,
    HL_AGENTE: UUID,
    ...extra,
});

/** Respuesta típica de /api/ws/llave: la llave viaja cifrada y aquí ni se mira. */
const respuestaOk = (modelo = 'claude-sonnet-5', proveedor = 'claude', api = 'anthropic') => ({
    ok: true,
    status: 200,
    json: async () => ({
        success: true,
        error: null,
        data: {
            uuid: UUID,
            agente: 'Agente Nexus',
            proveedor,
            api,
            modelo,
            llaveCifrada: 'iv.tag.cifrado',
            caducidad: null,
        },
    }),
});

describe('leerConfigHl', () => {
    it('lee la configuración y quita la diagonal final de la URL', () => {
        // Arrange / Act
        const config = leerConfigHl(env({ HL_URL: 'http://localhost:3055/', HL_TTL_MIN: '5' }));

        // Assert
        assert.equal(config.url, 'http://localhost:3055');
        assert.equal(config.agente, UUID);
        assert.equal(config.ttlMinutos, 5);
    });

    it('usa 30 minutos de cache cuando HL_TTL_MIN no es un número positivo', () => {
        assert.equal(leerConfigHl(env({ HL_TTL_MIN: 'x' })).ttlMinutos, 30);
        assert.equal(leerConfigHl(env({ HL_TTL_MIN: '-1' })).ttlMinutos, 30);
    });

    it('rechaza una key que no tenga el formato hl_ + 48 hex', () => {
        assert.throws(() => leerConfigHl(env({ HL_API_KEY: 'hl_corta' })), HlClienteError);
    });

    it('rechaza un agente que no sea UUID', () => {
        assert.throws(() => leerConfigHl(env({ HL_AGENTE: 'no-es-uuid' })), HlClienteError);
    });

    it('rechaza la falta de URL', () => {
        assert.throws(() => leerConfigHl(env({ HL_URL: '' })), HlClienteError);
    });
});

describe('hlConfigurado', () => {
    it('es falso mientras falte cualquiera de las tres variables', () => {
        assert.equal(hlConfigurado(env()), true);
        assert.equal(hlConfigurado(env({ HL_AGENTE: '' })), false);
        assert.equal(hlConfigurado({}), false);
    });
});

describe('configProxy', () => {
    it('apunta el SDK al proxy del agente y manda la key en el header', () => {
        // Act
        const { baseURL, headers } = configProxy(env());

        // Assert
        assert.equal(baseURL, `http://localhost:3055/api/ws/proxy/${UUID}`);
        assert.deepEqual(headers, { 'X-HL-Key': KEY });
    });
});

describe('obtenerAgente', () => {
    beforeEach(() => limpiarCacheAgente());

    it('pide proveedor y modelo a HL una sola vez mientras el cache siga vigente', async () => {
        // Arrange
        let llamadas = 0;
        const fetchDoble = async () => {
            llamadas += 1;
            return respuestaOk();
        };

        // Act
        const primera = await obtenerAgente({ env: env(), fetch: fetchDoble, ahora: () => 0 });
        const segunda = await obtenerAgente({ env: env(), fetch: fetchDoble, ahora: () => 60_000 });

        // Assert
        assert.equal(primera.modelo, 'claude-sonnet-5');
        assert.equal(primera.proveedor, 'claude');
        assert.equal(primera.nombre, 'Agente Nexus');
        assert.equal(segunda.modelo, 'claude-sonnet-5');
        assert.equal(llamadas, 1);
    });

    it('vuelve a preguntar cuando vence el cache', async () => {
        // Arrange
        let llamadas = 0;
        const fetchDoble = async () => {
            llamadas += 1;
            return respuestaOk(llamadas === 1 ? 'claude-sonnet-5' : 'claude-opus-5');
        };

        // Act
        await obtenerAgente({ env: env({ HL_TTL_MIN: '1' }), fetch: fetchDoble, ahora: () => 0 });
        const despues = await obtenerAgente({ env: env({ HL_TTL_MIN: '1' }), fetch: fetchDoble, ahora: () => 61_000 });

        // Assert
        assert.equal(despues.modelo, 'claude-opus-5');
        assert.equal(llamadas, 2);
    });

    it('reutiliza lo anterior si HL deja de contestar', async () => {
        // Arrange: primero contesta, luego se cae.
        let llamadas = 0;
        const fetchDoble = async () => {
            llamadas += 1;
            if (llamadas === 1) return respuestaOk();
            throw new Error('fetch failed');
        };

        // Act
        await obtenerAgente({ env: env({ HL_TTL_MIN: '1' }), fetch: fetchDoble, ahora: () => 0 });
        const conHlCaido = await obtenerAgente({ env: env({ HL_TTL_MIN: '1' }), fetch: fetchDoble, ahora: () => 61_000 });

        // Assert
        assert.equal(conHlCaido.modelo, 'claude-sonnet-5');
    });

    it('sube el error de HL cuando no hay nada previo en cache', async () => {
        // Arrange
        const fetchDoble = async () => ({
            ok: false,
            status: 403,
            json: async () => ({ success: false, error: 'IP no autorizada', data: null }),
        });

        // Act / Assert
        await assert.rejects(
            () => obtenerAgente({ env: env(), fetch: fetchDoble }),
            (error) => error instanceof HlClienteError && error.status === 403
        );
    });

    it('rechaza una respuesta sin proveedor o sin modelo', async () => {
        // Arrange
        const fetchDoble = async () => ({
            ok: true,
            status: 200,
            json: async () => ({ success: true, error: null, data: { uuid: UUID, agente: 'X' } }),
        });

        // Act / Assert
        await assert.rejects(() => obtenerAgente({ env: env(), fetch: fetchDoble }), HlClienteError);
    });
});

describe('sdkDeProveedor', () => {
    it('manda el campo api que envía HL', () => {
        assert.equal(sdkDeProveedor('lo-que-sea', 'anthropic'), 'anthropic');
        assert.equal(sdkDeProveedor('lo-que-sea', 'openai'), 'openai');
        assert.equal(sdkDeProveedor('gemini', 'gemini'), null);
    });

    it('deduce por el nombre cuando HL no manda api', () => {
        assert.equal(sdkDeProveedor('claude'), 'anthropic');
        assert.equal(sdkDeProveedor('GLM'), 'openai');
        assert.equal(sdkDeProveedor('deepseek'), 'openai');
        assert.equal(sdkDeProveedor('otro'), null);
    });
});
