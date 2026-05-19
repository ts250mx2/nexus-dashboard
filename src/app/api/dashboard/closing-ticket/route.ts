import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const idTienda = searchParams.get('idTienda'); // corresponds to IdSucursal
        const idCaja = searchParams.get('idCaja');
        const idApertura = searchParams.get('idApertura');

        if (!idTienda || !idCaja || !idApertura) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
        }

        // 1. Get opening/closing master data
        const masterSql = `
            SELECT A.*, 
                   C.Usuario AS SupervisorApertura, 
                   D.Usuario AS SupervisorCierre,
                   S.Sucursal AS SucursalName
            FROM tblAperturasCierres A
            INNER JOIN tblSucursales S ON A.IdSucursal = S.IdSucursal
            INNER JOIN tblUsuarios C ON A.IdSupervisor = C.IdUsuario
            LEFT JOIN tblUsuarios D ON A.IdSupervisorCierre = D.IdUsuario
            WHERE A.IdApertura = ? AND A.IdSucursal = ?
        `;
        const masterRows = await query(masterSql, [idApertura, idTienda]) as any[];
        if (!masterRows || masterRows.length === 0) {
            return NextResponse.json({ error: 'Sesión de apertura no encontrada' }, { status: 404 });
        }
        const master = masterRows[0];

        // 2. Get payments breakdown (including Pago1, Pago2, Pago3)
        const paymentsSql = `
            SELECT UPPER(TipoPago) AS TipoPago, SUM(Monto) AS Monto
            FROM (
                SELECT COALESCE(TP.TipoPago, 'EFECTIVO') AS TipoPago, SUM(A.Pago) AS Monto
                FROM tblVentas A
                LEFT JOIN tblTiposPago TP ON A.IdTipoPago = TP.IdTipoPago
                WHERE A.IdApertura = ? AND A.IdSucursal = ? AND A.Status = 0 AND A.Pago > 0
                GROUP BY TP.TipoPago
                UNION ALL
                SELECT COALESCE(TP.TipoPago, 'EFECTIVO') AS TipoPago, SUM(A.Pago2) AS Monto
                FROM tblVentas A
                LEFT JOIN tblTiposPago TP ON A.IdTipoPago2 = TP.IdTipoPago
                WHERE A.IdApertura = ? AND A.IdSucursal = ? AND A.Status = 0 AND A.Pago2 > 0
                GROUP BY TP.TipoPago
                UNION ALL
                SELECT COALESCE(TP.TipoPago, 'EFECTIVO') AS TipoPago, SUM(A.Pago3) AS Monto
                FROM tblVentas A
                LEFT JOIN tblTiposPago TP ON A.IdTipoPago3 = TP.IdTipoPago
                WHERE A.IdApertura = ? AND A.IdSucursal = ? AND A.Status = 0 AND A.Pago3 > 0
                GROUP BY TP.TipoPago
            ) AS CombinedPayments
            GROUP BY TipoPago
        `;
        const payments = await query(paymentsSql, [idApertura, idTienda, idApertura, idTienda, idApertura, idTienda]) as any[];

        // 3. Get cancellations count & total
        const cancellationsSql = `
            SELECT COUNT(*) AS Cantidad, COALESCE(SUM(Total), 0) AS Monto
            FROM tblVentas
            WHERE IdApertura = ? AND IdSucursal = ? AND Status = 2
        `;
        const cancels = await query(cancellationsSql, [idApertura, idTienda]) as any[];
        const cancelQty = cancels[0]?.Cantidad || 0;
        const cancelMonto = cancels[0]?.Monto || 0;

        // 4. Calculate figures
        const fondoCaja = master.FondoCaja || 0;
        const efectivoCierre = master.Efectivo || 0;
        
        // Find total paid in cash
        const cashPaymentRow = payments.find(p => p.TipoPago.includes('EFECTIVO'));
        const cashFromSales = cashPaymentRow ? cashPaymentRow.Monto : 0;
        
        const expectedCash = fondoCaja + cashFromSales;
        const cashDiscrepancy = master.FechaCierre !== '2000-01-01' ? (efectivoCierre - expectedCash) : 0;

        const totalVentasCalculated = payments.reduce((acc, curr) => acc + curr.Monto, 0);

        // Format dates
        const dateApertura = new Date(master.FechaApertura).toLocaleString('es-MX', { timeZone: 'America/Monterrey' });
        const dateCierre = master.FechaCierre !== '2000-01-01' 
            ? new Date(master.FechaCierre).toLocaleString('es-MX', { timeZone: 'America/Monterrey' })
            : 'SESIÓN ABIERTA / ACTIVA';

        // 5. Generate monospaced Z Cut text layout
        const formatCurrency = (num: number) => {
            return '$' + num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        };

        const pad = (text: string, length: number, char = ' ', right = false) => {
            const str = String(text);
            if (str.length >= length) return str.substring(0, length);
            const remaining = length - str.length;
            if (right) {
                return char.repeat(remaining) + str;
            }
            return str + char.repeat(remaining);
        };

        let ticket = '';
        ticket += `==========================================\n`;
        ticket += `           TICKET DE ARQUEO / Z           \n`;
        ticket += `==========================================\n\n`;
        ticket += `SUCURSAL: ${master.SucursalName.toUpperCase()}\n`;
        ticket += `CAJA NÚM: ${idCaja}       ARQUEO Z: ${idApertura}\n`;
        ticket += `------------------------------------------\n`;
        ticket += `APERTURA : ${dateApertura}\n`;
        ticket += `RESP. AP : ${master.SupervisorApertura.toUpperCase()}\n`;
        ticket += `------------------------------------------\n`;
        ticket += `CIERRE   : ${dateCierre}\n`;
        if (master.FechaCierre !== '2000-01-01') {
            ticket += `RESP. CI : ${(master.SupervisorCierre || 'SISTEMA').toUpperCase()}\n`;
        }
        ticket += `==========================================\n\n`;

        ticket += `RESUMEN DE FLUJOS:\n`;
        ticket += `${pad('  FONDO DE CAJA INICIAL:', 27)} ${pad(formatCurrency(fondoCaja), 13, ' ', true)}\n`;
        ticket += `${pad('  (+) VENTAS REGISTRADAS:', 27)} ${pad(formatCurrency(totalVentasCalculated), 13, ' ', true)}\n`;
        ticket += `------------------------------------------\n`;

        ticket += `DESGLOSE DE VENTAS POR MEDIO DE PAGO:\n`;
        if (payments.length === 0) {
            ticket += `  SIN OPERACIONES REGISTRADAS\n`;
        } else {
            payments.forEach(pay => {
                ticket += `  - ${pad(pay.TipoPago, 23)} ${pad(formatCurrency(pay.Monto), 13, ' ', true)}\n`;
            });
        }
        ticket += `------------------------------------------\n\n`;

        ticket += `AUDITORÍA DE EFECTIVO (CAJA CHICA):\n`;
        ticket += `${pad('  EFECTIVO ESPERADO EN CAJA:', 27)} ${pad(formatCurrency(expectedCash), 13, ' ', true)}\n`;
        if (master.FechaCierre !== '2000-01-01') {
            ticket += `${pad('  EFECTIVO DECLARADO (Z):', 27)} ${pad(formatCurrency(efectivoCierre), 13, ' ', true)}\n`;
            ticket += `  ----------------------------------------\n`;
            if (cashDiscrepancy === 0) {
                ticket += `  RESULTADO AUDITORÍA:     CAJA CUADRADA ($0.00)\n`;
            } else if (cashDiscrepancy > 0) {
                ticket += `  RESULTADO AUDITORÍA:     ${pad(`SOBRANTE (+${formatCurrency(cashDiscrepancy)})`, 25)}\n`;
            } else {
                ticket += `  RESULTADO AUDITORÍA:     ${pad(`FALTANTE (-${formatCurrency(Math.abs(cashDiscrepancy))})`, 25)}\n`;
            }
        } else {
            ticket += `  ESTADO ACTUAL:           CAJA EN CURSO\n`;
        }
        ticket += `==========================================\n\n`;

        ticket += `CONTROL DE CANCELACIONES:\n`;
        ticket += `  MOVIMIENTOS:  ${cancelQty}\n`;
        ticket += `  MONTO TOTAL:  ${formatCurrency(cancelMonto)}\n`;
        ticket += `==========================================\n\n`;

        ticket += `FIRMADA POR EL CAJERO Y SUPERVISOR\n\n\n`;
        ticket += `     _________________    _________________\n`;
        ticket += `          CAJERO             SUPERVISOR    \n\n`;
        ticket += `               Nexus Dashboard             \n`;
        ticket += `==========================================\n`;

        return NextResponse.json({ ticket });

    } catch (error: any) {
        console.error('Error generating closing ticket:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
