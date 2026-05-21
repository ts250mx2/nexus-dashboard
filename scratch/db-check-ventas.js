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

        const [cols] = await connection.execute('DESCRIBE tblVentas');
        console.log('\n--- tblVentas COLUMNS ---');
        cols.forEach(col => console.log(`${col.Field} - ${col.Type}`));

    } catch (err) {
        console.error('ERROR:', err);
    } finally {
        await connection.end();
    }
}

main();
