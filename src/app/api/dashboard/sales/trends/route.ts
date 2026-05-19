import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const fechaInicio = searchParams.get('fechaInicio');
        const fechaFin = searchParams.get('fechaFin');
        const idTienda = searchParams.get('idTienda'); // Maps to idSucursal
        const idDepto = searchParams.get('idDepto'); // Maps to Depto in tblArticulos
        const codigoInterno = searchParams.get('codigoInterno'); // Maps to IdArticulo

        if (!fechaInicio || !fechaFin) {
            return NextResponse.json({ error: 'Missing date parameters' }, { status: 400 });
        }

        // Store filter setup
        let storeFilter = '';
        const storeParams: any[] = [];
        if (idTienda && idTienda !== 'all') {
            const ids = idTienda.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
            if (ids.length > 0) {
                storeFilter = ` AND a.IdSucursal IN (${ids.join(',')})`;
            }
        }

        // Detail filters setup
        let detailFilters = '';
        let needsDetails = false;

        if (idDepto) {
            const deptoList = idDepto.split(',').map(d => `'${d.replace(/'/g, "''").trim()}'`);
            if (deptoList.length > 0) {
                detailFilters += ` AND art.Depto IN (${deptoList.join(',')})`;
                needsDetails = true;
            }
        }

        if (codigoInterno) {
            const ids = codigoInterno.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
            if (ids.length > 0) {
                detailFilters += ` AND vd.IdArticulo IN (${ids.join(',')})`;
                needsDetails = true;
            }
        }

        const groupBy = searchParams.get('groupBy') || 'dia';

        let dateSelector = 'DATE(a.FechaVenta)';
        if (groupBy === 'semana') {
            dateSelector = 'DATE_SUB(DATE(a.FechaVenta), INTERVAL WEEKDAY(a.FechaVenta) DAY)';
        } else if (groupBy === 'mes') {
            dateSelector = 'DATE_FORMAT(a.FechaVenta, "%Y-%m-01")';
        }

        const isMulti = idTienda && idTienda !== 'all' && idTienda.includes(',');
        const storeFields = isMulti ? ', a.IdSucursal, t.Sucursal as Tienda' : '';
        const storeJoin = isMulti ? 'LEFT JOIN tblSucursales t ON a.IdSucursal = t.IdSucursal' : '';
        const storeGrouping = isMulti ? ', a.IdSucursal, t.Sucursal' : '';

        const fromClause = needsDetails
            ? `tblVentas a 
               INNER JOIN tblDetalleVentas vd ON a.IdVenta = vd.IdVenta AND a.IdSucursal = vd.IdSucursal
               INNER JOIN tblArticulos art ON vd.IdArticulo = art.IdArticulo`
            : 'tblVentas a';

        const selectTotal = needsDetails ? 'SUM(vd.Cantidad * vd.PrecioVenta)' : 'SUM(a.Total)';
        const selectOps = needsDetails ? 'COUNT(DISTINCT a.IdVenta)' : 'COUNT(*)';

        // 1. Time-series query
        const timeSeriesSql = `
            SELECT 
                ${dateSelector} as Fecha,
                ${selectTotal} as Total,
                ${selectOps} as Operaciones
                ${storeFields}
            FROM ${fromClause}
            ${storeJoin}
            WHERE a.Status = 0 AND DATE(a.FechaVenta) >= ? AND DATE(a.FechaVenta) <= ?
            ${storeFilter}
            ${detailFilters}
            GROUP BY ${dateSelector} ${storeGrouping}
            ORDER BY Fecha ASC
        `;

        // 2. Comparison Period Calculations
        const diffDays = Math.ceil((new Date(fechaFin).getTime() - new Date(fechaInicio).getTime()) / (1000 * 60 * 60 * 24)) + 1;
        const prevStart = new Date(fechaInicio);
        prevStart.setDate(prevStart.getDate() - diffDays);
        const prevEnd = new Date(fechaInicio);
        prevEnd.setDate(prevEnd.getDate() - 1);

        const prevStartStr = prevStart.toISOString().split('T')[0];
        const prevEndStr = prevEnd.toISOString().split('T')[0];

        // 3. Branch performance variance query (MySQL compatible)
        const branchTrendsSql = `
            SELECT 
                t.IdSucursal as IdTienda,
                t.Sucursal as Tienda,
                COALESCE(currentSales.Total, 0) as CurrentTotal,
                COALESCE(prevSales.Total, 0) as PrevTotal,
                CASE 
                    WHEN COALESCE(prevSales.Total, 0) = 0 THEN 0 
                    ELSE ((COALESCE(currentSales.Total, 0) - prevSales.Total) / prevSales.Total) * 100 
                END as TrendPercentage
            FROM tblSucursales t
            LEFT JOIN (
                SELECT a.IdSucursal, ${selectTotal} as Total
                FROM ${fromClause}
                WHERE a.Status = 0 AND DATE(a.FechaVenta) >= ? AND DATE(a.FechaVenta) <= ?
                ${detailFilters}
                GROUP BY a.IdSucursal
            ) currentSales ON t.IdSucursal = currentSales.IdSucursal
            LEFT JOIN (
                SELECT a.IdSucursal, ${selectTotal} as Total
                FROM ${fromClause}
                WHERE a.Status = 0 AND DATE(a.FechaVenta) >= ? AND DATE(a.FechaVenta) <= ?
                ${detailFilters}
                GROUP BY a.IdSucursal
            ) prevSales ON t.IdSucursal = prevSales.IdSucursal
            WHERE t.IdSucursal IN (
                SELECT DISTINCT IdSucursal 
                FROM tblVentas 
                WHERE Status = 0 AND DATE(FechaVenta) >= ? AND DATE(FechaVenta) <= ?
            )
            ORDER BY CurrentTotal DESC
        `;

        const [timeSeries, branchTrends] = await Promise.all([
            query(timeSeriesSql, [fechaInicio, fechaFin]),
            query(branchTrendsSql, [fechaInicio, fechaFin, prevStartStr, prevEndStr, prevStartStr, fechaFin])
        ]);

        return NextResponse.json({
            success: true,
            timeSeries,
            branchTrends,
            comparisonPeriod: {
                start: prevStartStr,
                end: prevEndStr
            }
        });

    } catch (error: any) {
        console.error('Sales Trends API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
