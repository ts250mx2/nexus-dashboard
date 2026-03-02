import mysql from 'mysql2/promise';

const poolConfig = {
    host: process.env.DB_SERVER || 'nexusmty.ddns.net',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'kyk',
    password: process.env.DB_PASSWORD || 'merkurio',
    database: process.env.DB_NAME || 'BDNexus',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 10000 // 10 seconds
};

declare global {
    var mysqlPool: mysql.Pool | undefined;
}

const pool = globalThis.mysqlPool || mysql.createPool(poolConfig);

if (process.env.NODE_ENV !== 'production') {
    globalThis.mysqlPool = pool;
}

export async function getPool() {
    return pool;
}

export async function query(queryString: string, params: any[] = []) {
    let connection;
    try {
        connection = await pool.getConnection();
        const [rows] = await connection.execute(queryString, params);
        return rows as any[];
    } catch (error) {
        console.error('Database Error:', error);
        throw error;
    } finally {
        if (connection) {
            connection.release();
        }
    }
}
