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

        const [rows] = await connection.execute('SELECT Status, COUNT(*) as qty, SUM(Total) as sum_total FROM tblVentas GROUP BY Status');
        console.log('\n--- tblVentas Status DISTRIBUTION ---');
        console.log(rows);

    } catch (err) {
        console.error('ERROR:', err);
    } finally {
        await connection.end();
    }
}

main();
