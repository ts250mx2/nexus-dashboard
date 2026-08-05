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
        
        console.log('--- INDEXES ON tblListaPreciosHistorial ---');
        const [indexes] = await connection.execute("SHOW INDEX FROM tblListaPreciosHistorial");
        console.log(indexes.map(idx => ({
            Table: idx.Table,
            Non_unique: idx.Non_unique,
            Key_name: idx.Key_name,
            Seq_in_index: idx.Seq_in_index,
            Column_name: idx.Column_name
        })));

        await connection.end();
    } catch (error) {
        console.error('ERROR:', error);
    }
}

main();
