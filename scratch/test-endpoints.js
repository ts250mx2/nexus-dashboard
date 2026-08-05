async function runTests() {
    console.log('--- STARTING API ENDPOINT TESTS ---');

    // Test 1: Fetching price history for item AGTAN (Abanico Golden Tiger Aluminio Negro)
    try {
        console.log('Test 1: Fetching history for AGTAN in Zona 1...');
        const response = await fetch('http://localhost:3005/api/precios/historial?zonaId=1&codigo=AGTAN');
        const json = await response.json();
        
        console.log(`Response Status: ${response.status}`);
        console.log(`Success: ${json.success}`);
        console.log(`Records Found: ${json.meta?.recordsFound}`);
        if (json.data && json.data.length > 0) {
            console.log('Sample record from history:', json.data[0]);
        } else {
            console.log('No history records found (which is valid for new or unchanged prices)');
        }
    } catch (err) {
        console.error('Test 1 failed with error:', err.message);
    }

    // Test 2: Simulating editing prices for AGTAN in Zona 1
    // We will set: Público = 925, Profesor = 750, Distribuidor = 750, Dist. Especial = 750 (the original values to avoid changing active data)
    try {
        console.log('\nTest 2: Simulating editing prices for AGTAN in Zona 1...');
        const response = await fetch('http://localhost:3005/api/precios/editar', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                zonaId: 1,
                codigo: 'AGTAN',
                precioPublico: 925,
                precioProfesor: 750,
                precioDistribuidor: 750,
                distribuidoEspecial: 750
            })
        });

        const json = await response.json();
        console.log(`Response Status: ${response.status}`);
        console.log(`Success: ${json.success}`);
        console.log(`Message: ${json.message}`);
    } catch (err) {
        console.error('Test 2 failed with error:', err.message);
    }
}

runTests();
