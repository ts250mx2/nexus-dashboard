/** Extrae un mensaje legible de cualquier valor lanzado en un catch. */
export function getErrorMessage(error: unknown, fallback = 'Error inesperado'): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string' && error.trim()) return error;
    return fallback;
}
