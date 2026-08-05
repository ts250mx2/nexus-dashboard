import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
}

const config = {
    host: process.env.DB_SERVER || '100.65.202.81',
    user: process.env.DB_USER || 'kyk',
    password: process.env.DB_PASSWORD || 'merkurio',
    database: process.env.DB_NAME || 'BDNexus',
    port: parseInt(process.env.DB_PORT || '3306'),
    connectTimeout: 8000
};

const conn = await mysql.createConnection(config);
console.log('conectado a', config.host);

// 1. ¿Hay permisos de DDL? (las tablas del agente se crean al vuelo)
try {
    await conn.execute('CREATE TABLE IF NOT EXISTS tblTmpPermCheck (Id INT PRIMARY KEY)');
    await conn.execute('DROP TABLE tblTmpPermCheck');
    console.log('DDL (CREATE/DROP TABLE): OK');
} catch (e) {
    console.log('DDL FALLÓ:', e.message);
}

// 2. Catálogos que usan el visor y el prompt del agente
const [suc] = await conn.execute('SELECT IdSucursal, Sucursal FROM tblSucursales ORDER BY Sucursal LIMIT 10');
console.log('sucursales:', suc.length, JSON.stringify(suc.slice(0, 3)));

try {
    const [dep] = await conn.execute(
        `SELECT DISTINCT Depto FROM tblArticulos WHERE Depto IS NOT NULL AND Depto <> '' AND Status = 0 ORDER BY Depto LIMIT 10`
    );
    console.log('deptos:', dep.length, JSON.stringify(dep.map(d => d.Depto)));
} catch (e) {
    console.log('deptos FALLÓ:', e.message);
}

// 3. SQL típico que generará el agente (ventas por sucursal del mes)
const [ventas] = await conn.execute(`
    SELECT S.Sucursal, SUM(V.Total) AS \`Venta Total\`, COUNT(*) AS Tickets
    FROM tblVentas V
    INNER JOIN tblSucursales S ON V.IdSucursal = S.IdSucursal
    WHERE V.Status = 0 AND V.FechaVenta >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
    GROUP BY S.Sucursal
    ORDER BY \`Venta Total\` DESC
    LIMIT 5
`);
console.log('ventas por sucursal (30d):', JSON.stringify(ventas, null, 1));

const [tabs] = await conn.execute("SHOW TABLES LIKE 'tblAgent%'");
console.log('tablas tblAgent* existentes:', JSON.stringify(tabs));

await conn.end();
