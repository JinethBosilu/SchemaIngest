import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

interface ErdDiagramProps {
    mermaidCode: string | null;
    onLoad: () => Promise<string | null>;
}

mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    themeVariables: {
        primaryColor: '#6366f1',
        primaryTextColor: '#e8eaf0',
        lineColor: '#6366f1',
        secondaryColor: '#1c1f2e',
    },
});

export default function ErdDiagram({ mermaidCode, onLoad }: ErdDiagramProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!mermaidCode) {
            setLoading(true);
            onLoad()
                .then(() => setLoading(false))
                .catch(() => {
                    setError('Failed to load ERD');
                    setLoading(false);
                });
        }
    }, []);

    useEffect(() => {
        if (!mermaidCode || !containerRef.current) return;

        const render = async () => {
            try {
                containerRef.current!.innerHTML = '';
                const { svg } = await mermaid.render('erd-svg', mermaidCode);
                containerRef.current!.innerHTML = svg;
            } catch (e: any) {
                setError(e.message || 'Failed to render ERD');
            }
        };
        render();
    }, [mermaidCode]);

    if (loading) {
        return (
            <div className="erd-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="spinner"></span>
                <span style={{ marginLeft: 10, color: 'var(--text-muted)' }}>Loading ERD…</span>
            </div>
        );
    }

    if (error) {
        return <div className="error-msg">{error}</div>;
    }

    return (
        <div className="erd-container" ref={containerRef} />
    );
}
