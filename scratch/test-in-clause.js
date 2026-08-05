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
        
        // Generate last 1095 days (3 years)
        const dateList = [];
        const now = new Date();
        for (let i = 0; i < 1095; i++) {
            const d = new Date();
            d.setDate(now.getDate() - i);
            dateList.push([d.getDate(), d.getMonth() + 1, d.getFullYear()]);
        }

        const t0 = Date.now();
        const [rows] = await connection.query(
            'SELECT * FROM tblListaPreciosHistorial WHERE IdZona = ? AND IdArticulo = ? AND (Dia, Mes, Anio) IN (?) ORDER BY Anio DESC, Mes DESC, Dia DESC',
            [1, 1567, dateList]
        );
        console.log(`QUERY WITH 1095 DATES COMPLETED IN ${Date.now() - t0}ms`);
        console.log(`Found ${rows.length} rows`);
        await connection.end();
    } catch (error) {
        console.error('ERROR:', error);
    }
}

main();
