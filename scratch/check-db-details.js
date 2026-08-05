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
        
        console.log('--- TRIGGERS ON tblListaPrecios ---');
        const [triggers] = await connection.execute("SHOW TRIGGERS LIKE 'tblListaPrecios'");
        console.log(triggers);

        console.log('\n--- tblListaPreciosHistorial COLUMNS ---');
        const [historyCols] = await connection.execute("DESCRIBE tblListaPreciosHistorial");
        console.log(historyCols.map(c => `${c.Field} - ${c.Type}`));

        await connection.end();
    } catch (error) {
        console.error('ERROR:', error);
    }
}

main();
