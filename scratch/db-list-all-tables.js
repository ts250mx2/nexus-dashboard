const mysql = require('mysql2/promise');

const poolConfig = {
    host: 'nexusmty.ddns.net',
    port: 3306,
    user: 'kyk',
    password: 'merkurio',
    database: 'BDNexus',
};

async function main() {
    const connection = await mysql.createConnection(poolConfig);
    try {
        console.log('CONNECTED TO DATABASE.');

        const [tables] = await connection.execute('SHOW TABLES');
        const list = tables.map(t => Object.values(t)[0]);
        
        console.log('\n--- FILTERED TABLES ---');
        const filtered = list.filter(t => t.toLowerCase().includes('cancel') || t.toLowerCase().includes('apertura') || t.toLowerCase().includes('usuario') || t.toLowerCase().includes('caja'));
        console.log(filtered);

    } catch (err) {
        console.error('ERROR:', err);
    } finally {
        await connection.end();
    }
}

main();
