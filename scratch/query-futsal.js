const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');

const envPath = path.resolve(process.cwd(), '.env.local');
let envConfig = {};
if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) envConfig[key.trim()] = value.trim();
    });
}

async function main() {
    const config = {
        host: envConfig.DB_SERVER || 'nexusmty.ddns.net',
        port: parseInt(envConfig.DB_PORT || '3306'),
        user: envConfig.DB_USER || 'kyk',
        password: envConfig.DB_PASSWORD || 'merkurio',
        database: envConfig.DB_NAME || 'BDNexus',
        connectTimeout: 5000
    };

    try {
        const connection = await mysql.createConnection(config);
        
        console.log('--- SEARCH IN tblSocios ---');
        const [socios] = await connection.execute("SELECT IdSocio, Socio, Status, EsMayoreo, Credito, LimiteCredito FROM tblSocios WHERE Socio LIKE '%futsal%'");
        console.log('Socios found:', socios);

        console.log('\n--- SEARCH IN tblArticulos ---');
        const [articulos] = await connection.execute("SELECT IdArticulo, Codigo, Producto, Descripcion, Depto, IdCategoria FROM tblArticulos WHERE Producto LIKE '%futsal%' OR Descripcion LIKE '%futsal%' OR Depto LIKE '%futsal%'");
        console.log('Articulos found:', articulos);

        console.log('\n--- SEARCH IN tblCategorias ---');
        const [cats] = await connection.execute("SELECT * FROM tblCategorias WHERE Categoria LIKE '%futsal%'");
        console.log('Categories found:', cats);

        await connection.end();
    } catch (error) {
        console.error('ERROR:', error);
    }
}

main();
