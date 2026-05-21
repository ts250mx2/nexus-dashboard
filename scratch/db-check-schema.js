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

        const tablesToCheck = ['tblAperturasCierres', 'tblCancelaciones', 'tblDetalleCancelaciones', 'tblTiendas', 'tblSucursales'];
        for (const t of tablesToCheck) {
            try {
                const [cols] = await connection.execute(`DESCRIBE ${t}`);
                console.log(`\n--- ${t} COLUMNS ---`);
                cols.forEach(col => console.log(`${col.Field} - ${col.Type}`));
            } catch (e) {
                console.log(`\nTable ${t} does not exist:`, e.message);
            }
        }

    } catch (err) {
        console.error('ERROR:', err);
    } finally {
        await connection.end();
    }
}

main();
