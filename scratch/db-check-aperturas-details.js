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

        // Get 5 sample rows from tblAperturasCierres
        const [rows] = await connection.execute('SELECT * FROM tblAperturasCierres ORDER BY FechaApertura DESC LIMIT 5');
        console.log('\n--- tblAperturasCierres SAMPLE ---');
        console.log(rows);

        // Get 5 sample rows from tblVentas with IdApertura
        const [ventas] = await connection.execute('SELECT IdVenta, IdSucursal, IdComputadora, IdApertura, FechaVenta, Total, IdUsuarioVenta FROM tblVentas WHERE IdApertura IS NOT NULL AND IdApertura <> 0 ORDER BY FechaVenta DESC LIMIT 5');
        console.log('\n--- tblVentas SAMPLE WITH IdApertura ---');
        console.log(ventas);

    } catch (err) {
        console.error('ERROR:', err);
    } finally {
        await connection.end();
    }
}

main();
