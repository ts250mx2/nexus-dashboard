import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'src', 'data');
const SCHEMAS_FILE = path.join(DATA_DIR, 'custom-query-schemas.json');

// Ensure that src/data directory exists
function ensureDirectoryExists() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

export async function GET() {
    try {
        ensureDirectoryExists();
        
        if (!fs.existsSync(SCHEMAS_FILE)) {
            // Return empty list if no schemas have been saved yet
            return NextResponse.json({ success: true, schemas: [] });
        }

        const rawData = fs.readFileSync(SCHEMAS_FILE, 'utf8');
        const schemas = JSON.parse(rawData);

        return NextResponse.json({ success: true, schemas });

    } catch (error: any) {
        console.error('Error fetching custom query schemas:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}

export async function POST(req: NextRequest) {
    try {
        ensureDirectoryExists();

        const body = await req.json();
        const { schemas } = body;

        if (!Array.isArray(schemas)) {
            return NextResponse.json(
                { success: false, error: 'Parameter "schemas" must be an array' },
                { status: 400 }
            );
        }

        // Write to local JSON file in the workspace
        fs.writeFileSync(SCHEMAS_FILE, JSON.stringify(schemas, null, 4), 'utf8');

        return NextResponse.json({ success: true, message: 'Schemas saved successfully', count: schemas.length });

    } catch (error: any) {
        console.error('Error saving custom query schemas:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
