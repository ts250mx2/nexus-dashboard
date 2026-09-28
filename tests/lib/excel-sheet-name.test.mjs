import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sheetName } from '../../src/lib/excel-helpers.ts';

describe('sheetName', () => {
    it('deja intacto un nombre que Excel acepta', () => {
        // Arrange
        const usados = new Set();

        // Act
        const nombre = sheetName('BODEGA MONTERREY', usados);

        // Assert
        assert.equal(nombre, 'BODEGA MONTERREY');
    });

    it('quita los caracteres que Excel prohibe en una pestaña', () => {
        // Arrange: los siete prohibidos son : \ / ? * [ ]
        const usados = new Set();

        // Act
        const nombre = sheetName('MTY: norte/sur [A]*?\\centro', usados);

        // Assert
        assert.equal(nombre, 'MTY norte sur A centro');
    });

    it('recorta a los 31 caracteres que permite Excel', () => {
        // Arrange
        const usados = new Set();

        // Act
        const nombre = sheetName('X'.repeat(40), usados);

        // Assert
        assert.equal(nombre.length, 31);
    });

    it('numera los repetidos para que el archivo pueda abrirse', () => {
        // Arrange: dos hojas con el mismo nombre rompen el xlsx.
        const usados = new Set();

        // Act
        const primera = sheetName('SUCURSAL', usados);
        const segunda = sheetName('SUCURSAL', usados);
        const tercera = sheetName('SUCURSAL', usados);

        // Assert
        assert.equal(primera, 'SUCURSAL');
        assert.equal(segunda, 'SUCURSAL (2)');
        assert.equal(tercera, 'SUCURSAL (3)');
    });

    it('trata los repetidos sin distinguir mayúsculas, igual que Excel', () => {
        // Arrange
        const usados = new Set();

        // Act
        sheetName('Sucursal', usados);
        const segunda = sheetName('SUCURSAL', usados);

        // Assert
        assert.equal(segunda, 'SUCURSAL (2)');
    });

    it('mantiene el largo maximo al numerar un repetido', () => {
        // Arrange
        const usados = new Set();
        const largo = 'Y'.repeat(40);

        // Act
        sheetName(largo, usados);
        const segunda = sheetName(largo, usados);

        // Assert
        assert.equal(segunda.length, 31);
        assert.ok(segunda.endsWith(' (2)'));
    });

    it('da un nombre utilizable cuando llega vacío o solo con prohibidos', () => {
        // Arrange
        const usados = new Set();

        // Act
        const vacio = sheetName('', usados);
        const soloProhibidos = sheetName('///', usados);

        // Assert
        assert.equal(vacio, 'Hoja');
        assert.equal(soloProhibidos, 'Hoja (2)');
    });
});
