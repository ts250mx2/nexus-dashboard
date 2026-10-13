/**
 * El generador de Excel vive en lib/excel-report: lo usan también pantallas
 * que no son de inventario. Este archivo queda como reexportación para no
 * romper los imports de los módulos que ya lo pedían por esta ruta.
 */
export {
    colDecimal,
    colMoneda,
    colNumero,
    colTexto,
    etiquetaSucursales,
    exportarExcel,
    exportarExcelMultihoja,
    type HojaExcel,
} from '@/lib/excel-report';
