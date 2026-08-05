async function testEdit() {
    try {
        console.log('Sending PUT request to edit...');
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
        console.log('Response JSON:', json);
    } catch (err) {
        console.error('Error executing request:', err.message);
    }
}

testEdit();
