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
        
        console.log('--- DEPARTMENTS IN tblArticulos ---');
        const [deptos] = await connection.execute("SELECT DISTINCT Depto FROM tblArticulos");
        console.log(deptos.map(d => d.Depto));

        console.log('\n--- CATEGORIES IN tblCategorias ---');
        const [cats] = await connection.execute("SELECT DISTINCT Categoria FROM tblCategorias");
        console.log(cats.map(c => c.Categoria));

        console.log('\n--- SEARCH FOR "fut" IN tblSocios ---');
        const [socios] = await connection.execute("SELECT IdSocio, Socio FROM tblSocios WHERE Socio LIKE '%fut%' LIMIT 10");
        console.log(socios);

        await connection.end();
    } catch (error) {
        console.error('ERROR:', error);
    }
}

main();
