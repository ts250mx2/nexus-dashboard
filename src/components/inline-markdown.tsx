/**
 * Renderiza texto con markdown inline básico:
 *  - **negritas**
 *  - *itálicas*
 *  - `código`
 *
 * Si se proporciona `onCite`, las cifras numéricas en **negritas** se vuelven
 * clickeables (citación inline a la fuente de datos).
 *
 * Liviano, sin dependencias externas.
 */

import React from 'react';

interface InlineMarkdownProps {
    text: string;
    className?: string;
    onCite?: () => void;
}

function isCitableValue(content: string): boolean {
    const trimmed = content.trim();
    return /^[$+\-]?[\d.,]+[%KkMmBb]?$/.test(trimmed) ||
        /^[$+\-]?[\d.,]+\s*(mil|millones|MXN|USD)$/i.test(trimmed) ||
        /^\d{4}-\d{2}-\d{2}/.test(trimmed) ||
        (/^[$+\-]?[\d.,]+\s*[a-zA-Zñ]{0,15}$/.test(trimmed) && /\d/.test(trimmed));
}

function renderSegment(segment: string, key: number, onCite?: () => void): React.ReactNode {
    const boldMatch = segment.match(/^\*\*(.+?)\*\*$/);
    if (boldMatch) {
        const content = boldMatch[1];
        const citable = onCite && isCitableValue(content);

        if (citable) {
            return (
                <button
                    key={key}
                    type="button"
                    onClick={onCite}
                    className="font-bold text-slate-900 cursor-pointer border-b border-dotted border-slate-400 hover:border-blue-500 hover:text-blue-700 transition-colors decoration-dotted inline"
                    title="Ver fuente de este dato"
                >
                    {content}
                </button>
            );
        }
        return <strong key={key} className="font-bold text-slate-900">{content}</strong>;
    }

    const italicMatch = segment.match(/^\*(.+?)\*$/);
    if (italicMatch) {
        return <em key={key} className="italic">{italicMatch[1]}</em>;
    }

    const codeMatch = segment.match(/^`(.+?)`$/);
    if (codeMatch) {
        return (
            <code key={key} className="px-1.5 py-0.5 bg-slate-100 text-slate-800 rounded text-[0.9em] font-mono">
                {codeMatch[1]}
            </code>
        );
    }

    return <React.Fragment key={key}>{segment}</React.Fragment>;
}

export function InlineMarkdown({ text, className, onCite }: InlineMarkdownProps) {
    if (!text) return null;

    const paragraphs = text.split(/\n\s*\n/);

    return (
        <div className={className}>
            {paragraphs.map((para, pIdx) => {
                const lines = para.split('\n');

                const lineNodes = lines.map((line, lIdx) => {
                    const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).filter(Boolean);
                    const segments = parts.map((p, i) => renderSegment(p, i, onCite));
                    return (
                        <React.Fragment key={lIdx}>
                            {segments}
                            {lIdx < lines.length - 1 && <br />}
                        </React.Fragment>
                    );
                });

                return (
                    <p key={pIdx} className={pIdx > 0 ? 'mt-3' : ''}>
                        {lineNodes}
                    </p>
                );
            })}
        </div>
    );
}
