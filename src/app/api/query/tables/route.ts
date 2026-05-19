import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const tableName = searchParams.get('tableName');

        // 1. Fetch all tables first (both for list mode and validation)
        const rawTables = await query('SHOW TABLES') as any[];
        const tablesList: string[] = rawTables.map(row => String(Object.values(row)[0]));

        // List mode: returns all tables
        if (!tableName) {
            return NextResponse.json({ success: true, tables: tablesList });
        }

        // 2. Validation: check if the requested tableName exists in the active schema
        // This acts as a robust firewall preventing SQL Injection on table-name interpolated DESCRIBE statements
        if (!tablesList.includes(tableName)) {
            return NextResponse.json(
                { success: false, error: `Invalid table name: '${tableName}' does not exist` },
                { status: 400 }
            );
        }

        // 3. Describe mode: returns columns metadata
        const rawColumns = await query(`DESCRIBE \`${tableName}\``) as any[];
        const columns = rawColumns.map(col => ({
            name: col.Field,
            type: col.Type,
            nullable: col.Null === 'YES',
            key: col.Key, // PRI, UNI, MUL
            default: col.Default
        }));

        return NextResponse.json({
            success: true,
            tableName,
            columns
        });

    } catch (error: any) {
        console.error('Error in tables schema helper API:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
