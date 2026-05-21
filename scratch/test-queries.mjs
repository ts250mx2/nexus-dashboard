import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

// Parse .env.local manually to get DB connection details
const envPath = path.resolve(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
        const parts = trimmed.split('=');
        if (parts.length >= 2) {
            const key = parts[0].trim();
            const value = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
            envVars[key] = value;
        }
    }
});

const config = {
    host: envVars.DB_SERVER || 'nexusmty.ddns.net',
    user: envVars.DB_USER,
    password: envVars.DB_PASSWORD,
    database: envVars.DB_NAME,
    port: parseInt(envVars.DB_PORT || '3306'),
    connectTimeout: 10000
};

async function run() {
    const connection = await mysql.createConnection(config);
    console.log('Connected to database.');

    const idArticulo = 1517; // Piso Tatami Coreano
    const startDate = '2025-11-21 00:00:00'; // 6 months ago from 2026-05-21
    const endDate = '2026-05-21 23:59:59';

    console.log('\n--- 1. GROUP BY DIA ---');
    const [rowsDia] = await connection.execute(`
        SELECT 
            DATE(V.FechaVenta) as Fecha,
            SUM(DV.Cantidad) as Cantidad,
            SUM(DV.PrecioVenta * DV.Cantidad) as Total,
            COUNT(DISTINCT V.IdVenta) as NumeroTickets
        FROM tblDetalleVentas DV
        INNER JOIN tblVentas V ON DV.IdVenta = V.IdVenta AND DV.IdSucursal = V.IdSucursal
        WHERE V.Status = 0
          AND DV.IdArticulo = ?
          AND V.FechaVenta BETWEEN ? AND ?
        GROUP BY DATE(V.FechaVenta)
        ORDER BY Fecha ASC
        LIMIT 5
    `, [idArticulo, startDate, endDate]);
    console.table(rowsDia);

    console.log('\n--- 2. GROUP BY SEMANA ---');
    const [rowsSemana] = await connection.execute(`
        SELECT 
            DATE_SUB(DATE(V.FechaVenta), INTERVAL WEEKDAY(V.FechaVenta) DAY) as Fecha,
            SUM(DV.Cantidad) as Cantidad,
            SUM(DV.PrecioVenta * DV.Cantidad) as Total,
            COUNT(DISTINCT V.IdVenta) as NumeroTickets
        FROM tblDetalleVentas DV
        INNER JOIN tblVentas V ON DV.IdVenta = V.IdVenta AND DV.IdSucursal = V.IdSucursal
        WHERE V.Status = 0
          AND DV.IdArticulo = ?
          AND V.FechaVenta BETWEEN ? AND ?
        GROUP BY DATE_SUB(DATE(V.FechaVenta), INTERVAL WEEKDAY(V.FechaVenta) DAY)
        ORDER BY Fecha ASC
        LIMIT 5
    `, [idArticulo, startDate, endDate]);
    console.table(rowsSemana);

    console.log('\n--- 3. GROUP BY MES ---');
    const [rowsMes] = await connection.execute(`
        SELECT 
            DATE_FORMAT(V.FechaVenta, "%Y-%m-01") as Fecha,
            SUM(DV.Cantidad) as Cantidad,
            SUM(DV.PrecioVenta * DV.Cantidad) as Total,
            COUNT(DISTINCT V.IdVenta) as NumeroTickets
        FROM tblDetalleVentas DV
        INNER JOIN tblVentas V ON DV.IdVenta = V.IdVenta AND DV.IdSucursal = V.IdSucursal
        WHERE V.Status = 0
          AND DV.IdArticulo = ?
          AND V.FechaVenta BETWEEN ? AND ?
        GROUP BY DATE_FORMAT(V.FechaVenta, "%Y-%m-01")
        ORDER BY Fecha ASC
        LIMIT 5
    `, [idArticulo, startDate, endDate]);
    console.table(rowsMes);

    await connection.end();
}

run().catch(console.error);
