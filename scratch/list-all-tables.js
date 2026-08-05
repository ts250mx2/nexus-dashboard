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
        const [tables] = await connection.execute('SHOW TABLES');
        const list = tables.map(t => Object.values(t)[0]);
        
        const keywords = ['futsal', 'deuda', 'adeudo', 'corriente', 'socio', 'profesor', 'pago', 'mes', 'mensual', 'estatus', 'status'];
        console.log('MATCHING TABLES:');
        list.forEach(t => {
            const lower = t.toLowerCase();
            const matches = keywords.filter(k => lower.includes(k));
            if (matches.length > 0) {
                console.log(`- ${t} (matched: ${matches.join(', ')})`);
            }
        });
        await connection.end();
    } catch (error) {
        console.error('ERROR:', error);
    }
}

main();
