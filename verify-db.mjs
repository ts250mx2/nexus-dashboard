import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';

// Load .env.local if it exists
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function testConnection() {
    console.log('--- Database Connection Verification ---');
    console.log('Host:', process.env.DB_SERVER || 'nexusmty.ddns.net');
    console.log('Port:', process.env.DB_PORT || '3306 (default)');
    console.log('User:', process.env.DB_USER);
    console.log('Database:', process.env.DB_NAME);

    const config = {
        host: process.env.DB_SERVER || 'nexusmty.ddns.net',
        port: parseInt(process.env.DB_PORT || '3306'),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        connectTimeout: 5000
    };

    try {
        console.log('\nAttempting to connect...');
        const connection = await mysql.createConnection(config);
        console.log('SUCCESS: Connected successfully!');

        const [rows] = await connection.execute('SELECT 1 as test');
        console.log('Query result:', rows);

        await connection.end();
        console.log('Connection closed.');
    } catch (error) {
        console.error('\nFAILURE: Connection failed!');
        console.error('Error Code:', error.code);
        console.error('Message:', error.message);
    }
}

testConnection();
