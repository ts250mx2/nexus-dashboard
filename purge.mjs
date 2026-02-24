import mysql from 'mysql2/promise';

async function purgeConnections() {
    console.log('Intenta conectarse y purgar conexiones fantasma de MySQL...');
    try {
        const connection = await mysql.createConnection({
            host: 'nexusmty.ddns.net',
            user: 'kyk',
            password: 'merkurio',
            database: 'BDNexus'
        });

        console.log('Conexión adquirida exitosamente. Consultando procesos...');

        const [rows] = await connection.query('SHOW PROCESSLIST');
        const processes = rows;

        let killCount = 0;

        for (const process of processes) {
            if (process.Command === 'Sleep' && process.Time > 10 && process.User === 'kyk') {
                console.log(`Killing sleeping process ${process.Id} (Time: ${process.Time})`);
                try {
                    await connection.query(`KILL ${process.Id}`);
                    killCount++;
                } catch (killErr) {
                    console.error(`No se pudo matar el proceso ${process.Id}:`, killErr.message);
                }
            }
        }

        console.log(`Completado. Se cerraron ${killCount} conexiones dormidas.`);
        await connection.end();
    } catch (err) {
        console.error('Error general al purgar:', err.message);
    }
}

purgeConnections();
