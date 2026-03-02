import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';

// Cargar variables de entorno locales if exist
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function checkConnection() {
    const config = {
        host: process.env.DB_SERVER || 'nexusmty.ddns.net',
        port: parseInt(process.env.DB_PORT || '3306'),
        user: process.env.DB_USER || 'kyk',
        password: process.env.DB_PASSWORD || 'merkurio',
        database: process.env.DB_NAME || 'BDNexus',
        connectTimeout: 5000
    };

    console.log('--- INTENTO DE CONEXIÓN ---');
    console.log(`Host: ${config.host}`);
    console.log(`Puerto: ${config.port}`);
    console.log(`Usuario: ${config.user}`);
    console.log(`Base de Datos: ${config.database}`);
    console.log('---------------------------');

    try {
        console.log('Intentando abrir conexión...');
        const connection = await mysql.createConnection(config);
        console.log('¡ÉXITO! Conexión establecida correctamente.');

        console.log('Ejecutando consulta de prueba (SELECT 1)...');
        const [rows] = await connection.execute('SELECT 1 as test');
        console.log('Resultado:', rows);

        await connection.end();
        console.log('Conexión cerrada.');
    } catch (error) {
        console.error('\nERROR DE CONEXIÓN:');
        console.error('Mensaje:', error.message);
        console.error('Código:', error.code);
        console.error('Número de Error:', error.errno);
        console.error('Llamada del Sistema:', error.syscall);

        if (error.code === 'ETIMEDOUT') {
            console.log('\nAnálisis: Se agotó el tiempo de espera. Esto suele significar que el servidor no es alcanzable o un firewall está bloqueando el puerto 3306.');
        } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
            console.log('\nAnálisis: Usuario o contraseña incorrectos.');
        } else if (error.code === 'ENOTFOUND') {
            console.log('\nAnálisis: No se pudo encontrar el host especificado.');
        }
    }
}

checkConnection();
