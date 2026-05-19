'use client';

import React, { useState, useEffect } from 'react';
import { 
    Database, 
    Plus, 
    Trash, 
    Edit, 
    Save, 
    Link, 
    Key, 
    ArrowRight, 
    LayoutGrid, 
    FileText, 
    AlertCircle, 
    Info,
    Undo2,
    Loader2,
    Settings,
    Workflow
} from 'lucide-react';

interface FieldPair {
    fieldA: string;
    fieldB: string;
}

interface Relationship {
    tableA: string;
    joinType: 'INNER JOIN' | 'LEFT JOIN' | 'RIGHT JOIN';
    tableB: string;
    fieldPairs: FieldPair[];
}

interface QuerySchema {
    id: string;
    name: string;
    description: string;
    tables: string[];
    relationships: Relationship[];
    fieldDescriptions: Record<string, string>; // Key: "tableName.fieldName" -> "description"
}

interface TableColumn {
    name: string;
    type: string;
    nullable: boolean;
    key: string;
    default: any;
}

export default function QueryDesignerPage() {
    // List of all schemas
    const [schemas, setSchemas] = useState<QuerySchema[]>([]);
    const [loadingSchemas, setLoadingSchemas] = useState(true);

    // List of database tables
    const [dbTables, setDbTables] = useState<string[]>([]);
    const [loadingTables, setLoadingTables] = useState(true);

    // Editing State
    const [isEditing, setIsEditing] = useState(false);
    const [currentSchema, setCurrentSchema] = useState<QuerySchema | null>(null);

    // Cache of table columns to avoid duplicate queries
    // Key: "tableName" -> TableColumn[]
    const [columnsCache, setColumnsCache] = useState<Record<string, TableColumn[]>>({});
    const [loadingColumns, setLoadingColumns] = useState<Record<string, boolean>>({});

    // Toast/Feedback state
    const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);
    const [saving, setSaving] = useState(false);

    // Fetch initial schemas and tables list
    useEffect(() => {
        fetchSchemas();
        fetchTables();
    }, []);

    const showNotification = (type: 'success' | 'error', message: string) => {
        setNotification({ type, message });
        setTimeout(() => setNotification(null), 5000);
    };

    const fetchSchemas = async () => {
        try {
            setLoadingSchemas(true);
            const res = await fetch('/api/query/schemas');
            const data = await res.json();
            if (data.success) {
                // Backward compatibility migration: If an older schema doesn't have fieldPairs, upgrade it inline!
                const loadedSchemas = (data.schemas || []).map((schema: any) => {
                    const relationships = (schema.relationships || []).map((rel: any) => {
                        if (!rel.fieldPairs || !Array.isArray(rel.fieldPairs) || rel.fieldPairs.length === 0) {
                            return {
                                tableA: rel.tableA,
                                joinType: rel.joinType || 'INNER JOIN',
                                tableB: rel.tableB,
                                fieldPairs: [
                                    {
                                        fieldA: rel.fieldA || '',
                                        fieldB: rel.fieldB || ''
                                    }
                                ]
                            };
                        }
                        return rel;
                    });
                    return { ...schema, relationships };
                });
                setSchemas(loadedSchemas);
            } else {
                showNotification('error', 'Error al cargar los esquemas: ' + data.error);
            }
        } catch (err: any) {
            showNotification('error', 'Error de red al cargar esquemas');
        } finally {
            setLoadingSchemas(false);
        }
    };

    const fetchTables = async () => {
        try {
            setLoadingTables(true);
            const res = await fetch('/api/query/tables');
            const data = await res.json();
            if (data.success) {
                setDbTables(data.tables || []);
            } else {
                showNotification('error', 'Error al consultar tablas de base de datos');
            }
        } catch (err: any) {
            showNotification('error', 'Error de red al consultar tablas');
        } finally {
            setLoadingTables(false);
        }
    };

    // Lazy load columns for a given table
    const loadTableColumns = async (tableName: string) => {
        if (columnsCache[tableName] || loadingColumns[tableName]) return;

        try {
            setLoadingColumns(prev => ({ ...prev, [tableName]: true }));
            const res = await fetch(`/api/query/tables?tableName=${tableName}`);
            const data = await res.json();
            if (data.success) {
                const cols = data.columns || [];
                setColumnsCache(prev => ({ ...prev, [tableName]: cols }));

                // Auto-sync any empty relationship fields that were waiting for these columns
                setCurrentSchema(prev => {
                    if (!prev || cols.length === 0) return prev;
                    let changed = false;
                    const updatedRels = prev.relationships.map(r => {
                        const updatedPairs = r.fieldPairs.map(p => {
                            let fieldA = p.fieldA;
                            let fieldB = p.fieldB;
                            if (r.tableA === tableName && !p.fieldA) {
                                fieldA = cols[0].name;
                                changed = true;
                            }
                            if (r.tableB === tableName && !p.fieldB) {
                                fieldB = cols[0].name;
                                changed = true;
                            }
                            return { fieldA, fieldB };
                        });
                        return { ...r, fieldPairs: updatedPairs };
                    });
                    if (changed) {
                        return { ...prev, relationships: updatedRels };
                    }
                    return prev;
                });
            } else {
                showNotification('error', `Error al cargar columnas de ${tableName}: ${data.error}`);
            }
        } catch (err) {
            showNotification('error', `Error de red al consultar columnas de ${tableName}`);
        } finally {
            setLoadingColumns(prev => ({ ...prev, [tableName]: false }));
        }
    };

    // Load columns for all tables in a schema upon opening it
    const preloadSchemaColumns = async (schema: QuerySchema) => {
        const fetchPromises = schema.tables.map(table => loadTableColumns(table));
        await Promise.all(fetchPromises);
    };

    // Action: Start creating a new schema card
    const handleNewSchema = () => {
        const newSchema: QuerySchema = {
            id: 'schema_' + Date.now().toString(36),
            name: '',
            description: '',
            tables: [],
            relationships: [],
            fieldDescriptions: {}
        };
        setCurrentSchema(newSchema);
        setIsEditing(true);
    };

    // Action: Edit an existing schema card
    const handleEditSchema = async (schema: QuerySchema) => {
        setCurrentSchema(JSON.parse(JSON.stringify(schema))); // Deep clone
        setIsEditing(true);
        await preloadSchemaColumns(schema);
    };

    // Action: Delete a schema card
    const handleDeleteSchema = async (id: string) => {
        if (!confirm('¿Estás seguro de que deseas eliminar este esquema de consulta? Esto removerá el glosario de la IA.')) {
            return;
        }

        const updated = schemas.filter(s => s.id !== id);
        try {
            const res = await fetch('/api/query/schemas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ schemas: updated })
            });
            const data = await res.json();
            if (data.success) {
                setSchemas(updated);
                showNotification('success', 'Esquema eliminado exitosamente');
            } else {
                showNotification('error', 'Error al eliminar esquema: ' + data.error);
            }
        } catch (err) {
            showNotification('error', 'Error de red al eliminar esquema');
        }
    };

    // Builder Form Updates
    const handleAddTable = (tableName: string) => {
        if (!currentSchema || !tableName) return;
        if (currentSchema.tables.includes(tableName)) {
            showNotification('error', 'La tabla ya ha sido agregada a este esquema');
            return;
        }

        const updatedTables = [...currentSchema.tables, tableName];
        setCurrentSchema(prev => {
            if (!prev) return null;
            return {
                ...prev,
                tables: updatedTables
            };
        });
        loadTableColumns(tableName);
    };

    const handleRemoveTable = (tableName: string) => {
        if (!currentSchema) return;

        const updatedTables = currentSchema.tables.filter(t => t !== tableName);
        // Also remove relationships involving this table
        const updatedRelationships = currentSchema.relationships.filter(
            r => r.tableA !== tableName && r.tableB !== tableName
        );
        // Clean descriptions of fields in this table
        const updatedFields = { ...currentSchema.fieldDescriptions };
        Object.keys(updatedFields).forEach(key => {
            if (key.startsWith(tableName + '.')) {
                delete updatedFields[key];
            }
        });

        setCurrentSchema(prev => {
            if (!prev) return null;
            return {
                ...prev,
                tables: updatedTables,
                relationships: updatedRelationships,
                fieldDescriptions: updatedFields
            };
        });
    };

    const handleAddRelationship = () => {
        if (!currentSchema || currentSchema.tables.length < 2) {
            showNotification('error', 'Agrega al menos dos tablas para establecer una relación');
            return;
        }

        const newRel: Relationship = {
            tableA: currentSchema.tables[0],
            joinType: 'INNER JOIN',
            tableB: currentSchema.tables[1] || currentSchema.tables[0],
            fieldPairs: [
                {
                    fieldA: columnsCache[currentSchema.tables[0]]?.[0]?.name || '',
                    fieldB: columnsCache[currentSchema.tables[1] || currentSchema.tables[0]]?.[0]?.name || ''
                }
            ]
        };

        setCurrentSchema(prev => {
            if (!prev) return null;
            return {
                ...prev,
                relationships: [...prev.relationships, newRel]
            };
        });
    };

    const handleUpdateRelationship = (index: number, key: 'tableA' | 'joinType' | 'tableB', value: string) => {
        if (!currentSchema) return;
        const updated = [...currentSchema.relationships];
        updated[index] = { ...updated[index], [key]: value };

        // Reset fields if tables change
        if (key === 'tableA') {
            const firstCol = columnsCache[value]?.[0]?.name || '';
            updated[index].fieldPairs = updated[index].fieldPairs.map(p => ({
                ...p,
                fieldA: firstCol
            }));
        }
        if (key === 'tableB') {
            const firstCol = columnsCache[value]?.[0]?.name || '';
            updated[index].fieldPairs = updated[index].fieldPairs.map(p => ({
                ...p,
                fieldB: firstCol
            }));
        }

        setCurrentSchema(prev => {
            if (!prev) return null;
            return {
                ...prev,
                relationships: updated
            };
        });
    };

    const handleAddFieldPair = (relIndex: number) => {
        if (!currentSchema) return;
        const updated = [...currentSchema.relationships];
        const rel = updated[relIndex];
        
        const newPair = {
            fieldA: columnsCache[rel.tableA]?.[0]?.name || '',
            fieldB: columnsCache[rel.tableB]?.[0]?.name || ''
        };
        
        updated[relIndex] = {
            ...rel,
            fieldPairs: [...rel.fieldPairs, newPair]
        };
        
        setCurrentSchema(prev => {
            if (!prev) return null;
            return {
                ...prev,
                relationships: updated
            };
        });
    };

    const handleUpdateFieldPair = (relIndex: number, pairIndex: number, key: 'fieldA' | 'fieldB', value: string) => {
        if (!currentSchema) return;
        const updated = [...currentSchema.relationships];
        const rel = updated[relIndex];
        const updatedPairs = [...rel.fieldPairs];
        
        updatedPairs[pairIndex] = {
            ...updatedPairs[pairIndex],
            [key]: value
        };
        
        updated[relIndex] = {
            ...rel,
            fieldPairs: updatedPairs
        };
        
        setCurrentSchema(prev => {
            if (!prev) return null;
            return {
                ...prev,
                relationships: updated
            };
        });
    };

    const handleRemoveFieldPair = (relIndex: number, pairIndex: number) => {
        if (!currentSchema) return;
        const updated = [...currentSchema.relationships];
        const rel = updated[relIndex];
        
        if (rel.fieldPairs.length <= 1) {
            showNotification('error', 'Una relación debe tener al menos un par de campos conectados');
            return;
        }
        
        const updatedPairs = rel.fieldPairs.filter((_, idx) => idx !== pairIndex);
        
        updated[relIndex] = {
            ...rel,
            fieldPairs: updatedPairs
        };
        
        setCurrentSchema(prev => {
            if (!prev) return null;
            return {
                ...prev,
                relationships: updated
            };
        });
    };

    const handleRemoveRelationship = (index: number) => {
        if (!currentSchema) return;
        const updated = currentSchema.relationships.filter((_, idx) => idx !== index);
        setCurrentSchema(prev => {
            if (!prev) return null;
            return {
                ...prev,
                relationships: updated
            };
        });
    };

    const handleUpdateFieldDescription = (table: string, field: string, text: string) => {
        if (!currentSchema) return;
        const key = `${table}.${field}`;
        setCurrentSchema(prev => {
            if (!prev) return null;
            return {
                ...prev,
                fieldDescriptions: {
                    ...prev.fieldDescriptions,
                    [key]: text
                }
            };
        });
    };

    // Action: Save the schema
    const handleSaveSchema = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentSchema) return;

        if (!currentSchema.name.trim()) {
            showNotification('error', 'El nombre del esquema es obligatorio');
            return;
        }

        if (currentSchema.tables.length === 0) {
            showNotification('error', 'Agrega al menos una tabla al esquema');
            return;
        }

        setSaving(true);
        const exists = schemas.some(s => s.id === currentSchema.id);
        const updatedSchemas = exists 
            ? schemas.map(s => s.id === currentSchema.id ? currentSchema : s)
            : [...schemas, currentSchema];

        try {
            const res = await fetch('/api/query/schemas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ schemas: updatedSchemas })
            });

            const data = await res.json();
            if (data.success) {
                setSchemas(updatedSchemas);
                setIsEditing(false);
                setCurrentSchema(null);
                showNotification('success', 'Esquema y glosario guardados exitosamente. ¡El Agente de IA ya tiene este conocimiento!');
            } else {
                showNotification('error', 'Error al guardar esquema: ' + data.error);
            }
        } catch (err) {
            showNotification('error', 'Error de red al intentar guardar');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6 pb-20">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl -z-10"></div>
                <div className="absolute bottom-0 left-0 w-60 h-60 bg-pink-500/5 rounded-full blur-2xl -z-10"></div>
                
                <div className="space-y-2">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-pink-500/20 text-pink-400 border border-pink-500/30 rounded-xl">
                            <Workflow className="w-6 h-6" />
                        </div>
                        <h1 className="text-2xl font-bold text-white tracking-tight">Diseñador de Consultas</h1>
                    </div>
                    <p className="text-slate-400 text-sm max-w-2xl">
                        Configura esquemas relacionales, mapea tablas y describe sus campos para enriquecer la memoria técnica de **Nexus IA**. Haz que tu agente entienda a fondo la base de datos para responder consultas precisas.
                    </p>
                </div>

                {!isEditing && (
                    <button
                        onClick={handleNewSchema}
                        className="mt-4 md:mt-0 flex items-center gap-2 px-5 py-3 bg-pink-600 hover:bg-pink-500 text-white font-semibold text-sm rounded-xl transition duration-150 shadow-lg shadow-pink-600/20 hover:scale-[1.02] active:scale-[0.98]"
                    >
                        <Plus className="w-4 h-4" />
                        Nuevo Esquema
                    </button>
                )}
            </div>

            {/* Notification alert */}
            {notification && (
                <div className={`p-4 rounded-xl flex items-center gap-3 border ${
                    notification.type === 'success' 
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                }`}>
                    {notification.type === 'success' ? <Info className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
                    <span className="text-sm font-medium">{notification.message}</span>
                </div>
            )}

            {/* Main Content Area */}
            {!isEditing ? (
                /* ------------------- CARD GRID VIEW ------------------- */
                loadingSchemas ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3">
                        <Loader2 className="w-8 h-8 text-pink-500 animate-spin" />
                        <span className="text-slate-400 text-sm">Cargando esquemas de aprendizaje...</span>
                    </div>
                ) : schemas.length === 0 ? (
                    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-12 text-center max-w-xl mx-auto space-y-4">
                        <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto text-slate-500">
                            <Database className="w-8 h-8" />
                        </div>
                        <h3 className="text-lg font-bold text-white">Sin esquemas registrados</h3>
                        <p className="text-slate-400 text-sm">
                            Aún no has diseñado ningún contexto de consulta personalizado. Agrega uno para documentar las relaciones complejas de tu base de datos y facilitar la generación de SQL de la IA.
                        </p>
                        <button
                            onClick={handleNewSchema}
                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-pink-400 border border-pink-500/20 font-semibold text-sm rounded-xl transition duration-150"
                        >
                            <Plus className="w-4 h-4" />
                            Crear Primer Esquema
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {schemas.map(schema => (
                            <div 
                                key={schema.id} 
                                className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between hover:border-pink-500/40 transition-all duration-200 group"
                            >
                                <div className="space-y-3">
                                    <div className="flex justify-between items-start">
                                        <div className="p-2 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-lg">
                                            <Database className="w-5 h-5" />
                                        </div>
                                        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => handleEditSchema(schema)}
                                                title="Editar esquema"
                                                className="p-1.5 hover:bg-slate-800 text-slate-300 hover:text-pink-400 rounded-md transition"
                                            >
                                                <Edit className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteSchema(schema.id)}
                                                title="Eliminar esquema"
                                                className="p-1.5 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 rounded-md transition"
                                            >
                                                <Trash className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <h3 className="text-base font-bold text-white group-hover:text-pink-400 transition-colors">{schema.name}</h3>
                                        <p className="text-slate-400 text-xs mt-1 line-clamp-2">{schema.description || 'Sin descripción.'}</p>
                                    </div>

                                    {/* Tables Tagged */}
                                    <div className="pt-2 flex flex-wrap gap-1.5">
                                        {schema.tables.map(table => (
                                            <span 
                                                key={table} 
                                                className="px-2 py-0.5 bg-slate-800 border border-slate-700/60 rounded text-[10px] font-semibold text-slate-300"
                                            >
                                                {table}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                <div className="mt-6 pt-4 border-t border-slate-800 flex justify-between items-center text-xs text-slate-500">
                                    <span className="flex items-center gap-1">
                                        <Link className="w-3.5 h-3.5" />
                                        {schema.relationships.length} relaciones
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <FileText className="w-3.5 h-3.5" />
                                        {Object.keys(schema.fieldDescriptions).length} campos glosados
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )
            ) : (
                /* ------------------- DESIGNER BUILDER VIEW ------------------- */
                currentSchema && (
                    <form onSubmit={handleSaveSchema} className="space-y-6">
                        {/* Action Bar */}
                        <div className="flex justify-between items-center bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsEditing(false);
                                    setCurrentSchema(null);
                                }}
                                className="flex items-center gap-1.5 px-3 py-2 text-slate-300 hover:text-white hover:bg-slate-800 font-semibold text-xs rounded-lg transition"
                            >
                                <Undo2 className="w-4 h-4" />
                                Volver a esquemas
                            </button>

                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsEditing(false);
                                        setCurrentSchema(null);
                                    }}
                                    className="px-4 py-2 border border-slate-700 text-slate-300 font-semibold text-xs hover:bg-slate-800 rounded-lg transition"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="flex items-center gap-2 px-4 py-2 bg-pink-600 hover:bg-pink-500 disabled:opacity-50 text-white font-semibold text-xs rounded-lg transition shadow-md shadow-pink-600/10"
                                >
                                    {saving ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Guardando...
                                        </>
                                    ) : (
                                        <>
                                            <Save className="w-4 h-4" />
                                            Guardar Esquema
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Left Column: Metadata & Tables */}
                            <div className="lg:col-span-1 space-y-6">
                                {/* Metadata Card */}
                                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
                                    <h3 className="text-sm font-bold text-white border-b border-slate-800 pb-2">Información General</h3>
                                    
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nombre del Esquema</label>
                                        <input
                                            type="text"
                                            required
                                            value={currentSchema.name}
                                            onChange={e => setCurrentSchema({ ...currentSchema, name: e.target.value })}
                                            placeholder="ej: Órdenes de Compra y Proveedores"
                                            className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 focus:border-pink-500/50 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:ring-0 outline-none transition"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Descripción del Contexto</label>
                                        <textarea
                                            value={currentSchema.description}
                                            onChange={e => setCurrentSchema({ ...currentSchema, description: e.target.value })}
                                            placeholder="Mapea relaciones y glosario de términos para compras de inventario..."
                                            rows={3}
                                            className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 focus:border-pink-500/50 rounded-xl p-3 text-sm text-white placeholder-slate-600 focus:ring-0 outline-none transition resize-none"
                                        />
                                    </div>
                                </div>

                                {/* Tables Config Card */}
                                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
                                    <h3 className="text-sm font-bold text-white border-b border-slate-800 pb-2">Tablas Involucradas</h3>

                                    {/* Add Table Select */}
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Agregar Tabla</label>
                                        <div className="flex gap-2">
                                            <select
                                                onChange={e => {
                                                    handleAddTable(e.target.value);
                                                    e.target.value = ''; // Reset select
                                                }}
                                                defaultValue=""
                                                disabled={loadingTables}
                                                className="flex-1 bg-slate-950 border border-slate-800 focus:border-pink-500/50 rounded-xl px-3 py-2.5 text-xs text-white focus:ring-0 outline-none transition"
                                            >
                                                <option value="" disabled>-- Selecciona tabla --</option>
                                                {dbTables.map(t => (
                                                    <option key={t} value={t} disabled={currentSchema.tables.includes(t)}>
                                                        {t} {currentSchema.tables.includes(t) ? '(Agregada)' : ''}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    {/* Active Tables List */}
                                    <div className="space-y-2 pt-2">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tablas Activas</label>
                                        {currentSchema.tables.length === 0 ? (
                                            <p className="text-slate-600 text-xs italic">Ninguna tabla seleccionada.</p>
                                        ) : (
                                            <div className="space-y-1.5">
                                                {currentSchema.tables.map(table => (
                                                    <div 
                                                        key={table} 
                                                        className="flex justify-between items-center px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl"
                                                    >
                                                        <span className="text-xs font-semibold text-slate-300">{table}</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveTable(table)}
                                                            className="text-slate-500 hover:text-rose-400 p-1"
                                                        >
                                                            <Trash className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Right Column: Relationships & Glossaries */}
                            <div className="lg:col-span-2 space-y-6">
                                {/* Relationships Config Card */}
                                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
                                    <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                                        <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                                            <Link className="w-4 h-4 text-indigo-400" />
                                            Relaciones (Joins)
                                        </h3>
                                        <button
                                            type="button"
                                            onClick={handleAddRelationship}
                                            disabled={currentSchema.tables.length < 2}
                                            className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-pink-400 font-semibold text-[10px] border border-pink-500/20 uppercase tracking-wider rounded-lg transition disabled:opacity-40"
                                        >
                                            <Plus className="w-3.5 h-3.5" />
                                            Agregar Join
                                        </button>
                                    </div>

                                    {currentSchema.relationships.length === 0 ? (
                                        <div className="py-6 text-center text-slate-600 text-xs italic bg-slate-950/40 border border-dashed border-slate-800 rounded-xl">
                                            {currentSchema.tables.length < 2 
                                                ? 'Agrega al menos dos tablas para establecer relaciones entre campos.' 
                                                : 'No hay joins definidos. Define relaciones para que la IA sepa qué columnas conectar.'}
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {currentSchema.relationships.map((rel, index) => (
                                                <div 
                                                    key={index}
                                                    className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3 shadow-md"
                                                >
                                                    {/* Header: Table A JoinType Table B & Actions */}
                                                    <div className="flex flex-col md:flex-row gap-3 items-center justify-between pb-3 border-b border-slate-900">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            {/* Table A select */}
                                                            <select
                                                                value={rel.tableA}
                                                                onChange={e => handleUpdateRelationship(index, 'tableA', e.target.value)}
                                                                className="bg-slate-900 border border-slate-800 rounded-lg py-1 px-2.5 text-xs text-white font-semibold outline-none"
                                                            >
                                                                {currentSchema.tables.map(t => (
                                                                    <option key={t} value={t}>{t}</option>
                                                                ))}
                                                            </select>

                                                            {/* Join type select */}
                                                            <select
                                                                value={rel.joinType}
                                                                onChange={e => handleUpdateRelationship(index, 'joinType', e.target.value as any)}
                                                                className="bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-md py-1 px-2 text-[10px] font-bold outline-none text-center"
                                                            >
                                                                <option value="INNER JOIN">INNER JOIN</option>
                                                                <option value="LEFT JOIN">LEFT JOIN</option>
                                                                <option value="RIGHT JOIN">RIGHT JOIN</option>
                                                            </select>

                                                            {/* Table B select */}
                                                            <select
                                                                value={rel.tableB}
                                                                onChange={e => handleUpdateRelationship(index, 'tableB', e.target.value)}
                                                                className="bg-slate-900 border border-slate-800 rounded-lg py-1 px-2.5 text-xs text-white font-semibold outline-none"
                                                            >
                                                                {currentSchema.tables.map(t => (
                                                                    <option key={t} value={t}>{t}</option>
                                                                ))}
                                                            </select>
                                                        </div>

                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleAddFieldPair(index)}
                                                                className="flex items-center gap-1 px-2 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-[10px] font-bold text-slate-300 transition"
                                                            >
                                                                <Plus className="w-3 h-3" />
                                                                Relacionar otro campo
                                                            </button>
                                                            
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRemoveRelationship(index)}
                                                                className="text-slate-500 hover:text-rose-400 p-1 hover:bg-slate-900 rounded transition"
                                                                title="Eliminar relación completa"
                                                            >
                                                                <Trash className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Field pair mappings list */}
                                                    <div className="space-y-2">
                                                        {rel.fieldPairs.map((pair, pIdx) => (
                                                            <div 
                                                                key={pIdx}
                                                                className="flex flex-col md:flex-row items-center gap-3 bg-slate-900/40 p-2.5 rounded-lg border border-slate-900"
                                                            >
                                                                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider md:w-20">Par {pIdx + 1}:</span>
                                                                
                                                                {/* Field A dropdown */}
                                                                <div className="flex-1 w-full">
                                                                    <select
                                                                        value={pair.fieldA}
                                                                        onChange={e => handleUpdateFieldPair(index, pIdx, 'fieldA', e.target.value)}
                                                                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-1.5 text-xs text-white focus:border-pink-500/40 transition outline-none"
                                                                    >
                                                                        {!pair.fieldA && <option value="">-- Seleccionar campo --</option>}
                                                                        {columnsCache[rel.tableA]?.map(c => (
                                                                            <option key={c.name} value={c.name}>{c.name}</option>
                                                                        ))}
                                                                    </select>
                                                                </div>

                                                                {/* Connector */}
                                                                <span className="text-slate-600 text-xs font-bold font-mono"> = </span>

                                                                {/* Field B dropdown */}
                                                                <div className="flex-1 w-full">
                                                                    <select
                                                                        value={pair.fieldB}
                                                                        onChange={e => handleUpdateFieldPair(index, pIdx, 'fieldB', e.target.value)}
                                                                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-1.5 text-xs text-white focus:border-pink-500/40 transition outline-none"
                                                                    >
                                                                        {!pair.fieldB && <option value="">-- Seleccionar campo --</option>}
                                                                        {columnsCache[rel.tableB]?.map(c => (
                                                                            <option key={c.name} value={c.name}>{c.name}</option>
                                                                        ))}
                                                                    </select>
                                                                </div>

                                                                {/* Delete Pair Action */}
                                                                {rel.fieldPairs.length > 1 && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleRemoveFieldPair(index, pIdx)}
                                                                        className="text-slate-500 hover:text-rose-400 p-1 hover:bg-slate-900 rounded"
                                                                    >
                                                                        <Trash className="w-3.5 h-3.5" />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>

                                                    {/* Join Preview String */}
                                                    <div className="text-[10px] text-slate-500 font-mono italic bg-slate-950/50 p-2 rounded border border-slate-900/50">
                                                        ON {rel.fieldPairs.map(p => `${rel.tableA}.${p.fieldA || '?' } = ${rel.tableB}.${p.fieldB || '?'}`).join(' AND ')}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Glossaries / Fields Descriptions Card */}
                                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
                                    <h3 className="text-sm font-bold text-white flex items-center gap-1.5 border-b border-slate-800 pb-2">
                                        <FileText className="w-4 h-4 text-pink-400" />
                                        Glosario y Reglas de los Campos
                                    </h3>

                                    {currentSchema.tables.length === 0 ? (
                                        <p className="text-slate-600 text-xs italic text-center py-6">Agrega tablas arriba para documentar sus campos individuales.</p>
                                    ) : (
                                        <div className="space-y-6">
                                            {currentSchema.tables.map(table => {
                                                const cols = columnsCache[table] || [];
                                                const loading = loadingColumns[table];

                                                return (
                                                    <div key={table} className="space-y-3 bg-slate-950 border border-slate-800 rounded-xl p-4">
                                                        <div className="flex items-center gap-2 border-b border-slate-900 pb-2">
                                                            <Database className="w-4 h-4 text-indigo-400" />
                                                            <h4 className="text-xs font-bold text-white">{table}</h4>
                                                            {loading && <Loader2 className="w-3 h-3 text-pink-500 animate-spin" />}
                                                        </div>

                                                        {cols.length === 0 && !loading && (
                                                            <p className="text-slate-600 text-xs italic">Cargando campos...</p>
                                                        )}

                                                        <div className="space-y-3.5 max-h-96 overflow-y-auto pr-1">
                                                            {cols.map(col => {
                                                                const fieldKey = `${table}.${col.name}`;
                                                                const desc = currentSchema.fieldDescriptions[fieldKey] || '';

                                                                return (
                                                                    <div key={col.name} className="grid grid-cols-1 md:grid-cols-3 gap-2 items-start bg-slate-900/60 border border-slate-800 p-3 rounded-lg hover:border-slate-800 transition">
                                                                        <div className="space-y-1">
                                                                            <div className="flex items-center gap-1.5">
                                                                                <span className="text-xs font-bold text-white font-mono">{col.name}</span>
                                                                                {col.key === 'PRI' && (
                                                                                    <span className="px-1.5 py-0.5 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 text-[8px] font-bold rounded flex items-center gap-0.5">
                                                                                        <Key className="w-2.5 h-2.5" />
                                                                                        PK
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                            <span className="text-[10px] text-slate-500 font-mono">{col.type}</span>
                                                                        </div>

                                                                        <div className="md:col-span-2">
                                                                            <input
                                                                                type="text"
                                                                                value={desc}
                                                                                onChange={e => handleUpdateFieldDescription(table, col.name, e.target.value)}
                                                                                placeholder="¿Reglas de negocio o significado de esta columna para la IA?..."
                                                                                className="w-full bg-slate-950 border border-slate-800 focus:border-pink-500/40 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-700 focus:ring-0 outline-none transition"
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </form>
                )
            )}
        </div>
    );
}
