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

        const [cols] = await connection.execute('DESCRIBE tblUsuarios');
        console.log('\n--- tblUsuarios COLUMNS ---');
        cols.forEach(col => console.log(`${col.Field} - ${col.Type}`));

        const [rows] = await connection.execute('SELECT * FROM tblUsuarios LIMIT 3');
        console.log('\n--- tblUsuarios SAMPLE ---');
        console.log(rows);

    } catch (err) {
        console.error('ERROR:', err);
    } finally {
        await connection.end();
    }
}

main();
