import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';

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

let renderCounter = 0;

export default function ErdDiagram({ mermaidCode, onLoad }: ErdDiagramProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [localCode, setLocalCode] = useState<string | null>(mermaidCode);

    // Sync prop into local state
    useEffect(() => {
        if (mermaidCode) {
            setLocalCode(mermaidCode);
        }
    }, [mermaidCode]);

    // Fetch ERD data if not provided
    useEffect(() => {
        if (localCode) return;
        let cancelled = false;

        setLoading(true);
        onLoad()
            .then((text) => {
                if (!cancelled && text) {
                    setLocalCode(text);
                }
                if (!cancelled) setLoading(false);
            })
            .catch(() => {
                if (!cancelled) {
                    setError('Failed to load ERD');
                    setLoading(false);
                }
            });

        return () => { cancelled = true; };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Render the mermaid diagram
    useEffect(() => {
        if (!localCode || !containerRef.current) return;

        const container = containerRef.current;
        let cancelled = false;

        const render = async () => {
            try {
                // Use a unique ID each time to avoid mermaid DOM ID collisions
                const id = `erd-svg-${++renderCounter}`;
                const { svg } = await mermaid.render(id, localCode);

                if (!cancelled && container) {
                    container.innerHTML = svg;

                    // Make the SVG responsive within the container
                    const svgEl = container.querySelector('svg');
                    if (svgEl) {
                        svgEl.style.maxWidth = '100%';
                        svgEl.style.height = 'auto';
                    }
                }
            } catch (e: any) {
                if (!cancelled) {
                    setError(e.message || 'Failed to render ERD');
                }
            }
        };

        render();

        return () => {
            cancelled = true;
            // Clean up orphaned mermaid temp elements from the DOM
            document.querySelectorAll(`[id^="derd-svg-"]`).forEach(el => el.remove());
        };
    }, [localCode]);

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
        <div style={{ width: '100%', minHeight: 'calc(100vh - 250px)', position: 'relative', overflow: 'hidden', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)' }}>
            <TransformWrapper
                initialScale={1}
                minScale={0.1}
                maxScale={8}
                centerOnInit
                wheel={{ step: 0.1 }}
            >
                {({ zoomIn, zoomOut, resetTransform }) => (
                    <>
                        <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 10, display: 'flex', gap: 6 }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => zoomIn()}>+</button>
                            <button className="btn btn-secondary btn-sm" onClick={() => zoomOut()}>-</button>
                            <button className="btn btn-secondary btn-sm" onClick={() => resetTransform()}>Reset</button>
                        </div>
                        <TransformComponent wrapperStyle={{ width: '100%', height: '100%', minHeight: 'calc(100vh - 250px)' }}>
                            <div className="erd-container" ref={containerRef} style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }} />
                        </TransformComponent>
                    </>
                )}
            </TransformWrapper>
        </div>
    );
}
