const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');

// Cargar variables manualmente de .env.local si existe
const envPath = path.resolve(process.cwd(), '.env.local');
let envConfig = {};
if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) envConfig[key.trim()] = value.trim();
    });
}

async function checkConnection() {
    const config = {
        host: envConfig.DB_SERVER || 'nexusmty.ddns.net',
        port: parseInt(envConfig.DB_PORT || '3306'),
        user: envConfig.DB_USER || 'kyk',
        password: envConfig.DB_PASSWORD || 'merkurio',
        database: envConfig.DB_NAME || 'BDNexus',
        connectTimeout: 5000
    };

    console.log('--- DETALLES DEL INTENTO DE CONEXIÓN ---');
    console.log(`Host: ${config.host}`);
    console.log(`Puerto: ${config.port}`);
    console.log(`Usuario: ${config.user}`);
    console.log(`Base de Datos: ${config.database}`);
    console.log('---------------------------------------');

    try {
        console.log('Iniciando conexión...');
        const connection = await mysql.createConnection(config);
        console.log('¡Conexión exitosa!');

        const [rows] = await connection.execute('SELECT 1 as test');
        console.log('Consulta de prueba (SELECT 1) exitosa:', rows);

        await connection.end();
        console.log('Conexión finalizada.');
    } catch (error) {
        console.error('\nERROR EN EL INTENTO:');
        console.error('Mensaje:', error.message);
        console.error('Código:', error.code);
        console.error('Syscall:', error.syscall);
    }
}

checkConnection();
