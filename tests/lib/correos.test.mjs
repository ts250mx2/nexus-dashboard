import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { analizarCorreos, normalizarCorreos } from '../../src/lib/correos.ts';
import { cifrar, descifrar } from '../../src/lib/secret-box.ts';

describe('analizarCorreos', () => {
    it('acepta comas, punto y coma y saltos de línea', () => {
        // Act
        const { validos, invalidos } = analizarCorreos('a@x.com, b@y.mx;\nc@z.com.mx');

        // Assert
        assert.deepEqual(validos, ['a@x.com', 'b@y.mx', 'c@z.com.mx']);
        assert.deepEqual(invalidos, []);
    });

    it('separa los que no parecen correo', () => {
        // Act
        const { validos, invalidos } = analizarCorreos('bueno@x.com, sin-arroba, falta@dominio');

        // Assert
        assert.deepEqual(validos, ['bueno@x.com']);
        assert.deepEqual(invalidos, ['sin-arroba', 'falta@dominio']);
    });

    it('quita duplicados sin importar mayúsculas', () => {
        // Act
        const texto = normalizarCorreos('Juan@X.com, juan@x.com,  ana@x.com ');

        // Assert
        assert.equal(texto, 'Juan@X.com, ana@x.com');
    });

    it('lista vacía o nula no truena', () => {
        assert.deepEqual(analizarCorreos(null), { validos: [], invalidos: [] });
        assert.deepEqual(analizarCorreos(' , ; '), { validos: [], invalidos: [] });
    });
});

describe('secret-box', () => {
    const secreto = 'una-llave-de-prueba-suficientemente-larga';

    it('descifra lo que cifra', () => {
        // Act
        const sobre = cifrar('contraseña ñ $3cr3t', secreto);

        // Assert
        assert.doesNotMatch(sobre, /contraseña/);
        assert.equal(descifrar(sobre, secreto), 'contraseña ñ $3cr3t');
    });

    it('cada cifrado es distinto aunque el texto sea igual', () => {
        assert.notEqual(cifrar('x', secreto), cifrar('x', secreto));
    });

    it('falla con otra llave en lugar de devolver basura', () => {
        // Arrange
        const sobre = cifrar('secreto', secreto);

        // Act / Assert
        assert.throws(() => descifrar(sobre, 'otra-llave-distinta-de-la-original'));
    });

    it('exige una llave mínima', () => {
        assert.throws(() => cifrar('x', 'corta'), /CONFIG_SECRET/);
    });
});
