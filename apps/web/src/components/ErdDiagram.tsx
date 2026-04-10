import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { TransformWrapper, TransformComponent, type ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import { ZoomIn, ZoomOut, Maximize, Minimize, RotateCcw, Move } from 'lucide-react';

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
    const wrapperRef = useRef<HTMLDivElement>(null);
    const transformRef = useRef<ReactZoomPanPinchRef>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [localCode, setLocalCode] = useState<string | null>(mermaidCode);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [scale, setScale] = useState(1);

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
                const id = `erd-svg-${++renderCounter}`;
                const { svg } = await mermaid.render(id, localCode);

                if (!cancelled && container) {
                    container.innerHTML = svg;

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
            document.querySelectorAll(`[id^="derd-svg-"]`).forEach(el => el.remove());
        };
    }, [localCode]);

    // Fullscreen toggle
    const toggleFullscreen = () => {
        if (!wrapperRef.current) return;

        if (!isFullscreen) {
            if (wrapperRef.current.requestFullscreen) {
                wrapperRef.current.requestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    };

    // Listen for fullscreen changes
    useEffect(() => {
        const handler = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handler);
        return () => document.removeEventListener('fullscreenchange', handler);
    }, []);

    // Keyboard shortcuts
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            // Only handle if the ERD area is focused or fullscreen
            if (!wrapperRef.current) return;

            const api = transformRef.current;
            if (!api) return;

            if (e.key === '+' || e.key === '=') {
                e.preventDefault();
                api.zoomIn(0.3);
            } else if (e.key === '-') {
                e.preventDefault();
                api.zoomOut(0.3);
            } else if (e.key === '0') {
                e.preventDefault();
                api.resetTransform();
            } else if (e.key === 'f' || e.key === 'F') {
                // Don't intercept if user is typing in an input
                if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
                e.preventDefault();
                toggleFullscreen();
            }
        };

        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [isFullscreen]);

    const zoomPercent = Math.round(scale * 100);

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
        <div
            ref={wrapperRef}
            className={`erd-viewer${isFullscreen ? ' erd-fullscreen' : ''}`}
        >
            <TransformWrapper
                ref={transformRef}
                initialScale={1}
                minScale={0.02}
                maxScale={20}
                centerOnInit
                wheel={{ step: 0.08 }}
                doubleClick={{ mode: 'zoomIn', step: 0.7 }}
                pinch={{ step: 5 }}
                onTransformed={(_ref, state) => {
                    setScale(state.scale);
                }}
            >
                {({ zoomIn, zoomOut, resetTransform, centerView }) => (
                    <>
                        {/* ── Floating Toolbar ── */}
                        <div className="erd-toolbar">
                            <div className="erd-toolbar-group">
                                <button
                                    className="erd-tool-btn"
                                    onClick={() => zoomOut(0.3)}
                                    title="Zoom Out (−)"
                                >
                                    <ZoomOut size={16} />
                                </button>

                                <div className="erd-zoom-level" title="Current zoom level">
                                    {zoomPercent}%
                                </div>

                                <button
                                    className="erd-tool-btn"
                                    onClick={() => zoomIn(0.3)}
                                    title="Zoom In (+)"
                                >
                                    <ZoomIn size={16} />
                                </button>
                            </div>

                            <div className="erd-toolbar-divider" />

                            <div className="erd-toolbar-group">
                                <button
                                    className="erd-tool-btn"
                                    onClick={() => { resetTransform(); }}
                                    title="Reset View (0)"
                                >
                                    <RotateCcw size={15} />
                                </button>

                                <button
                                    className="erd-tool-btn"
                                    onClick={() => centerView(1)}
                                    title="Fit to Screen"
                                >
                                    <Move size={15} />
                                </button>

                                <button
                                    className="erd-tool-btn"
                                    onClick={toggleFullscreen}
                                    title={isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
                                >
                                    {isFullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
                                </button>
                            </div>
                        </div>

                        {/* ── Hints ── */}
                        <div className="erd-hints">
                            Scroll to zoom · Drag to pan · Double-click to zoom in
                        </div>

                        {/* ── Diagram Canvas ── */}
                        <TransformComponent
                            wrapperStyle={{
                                width: '100%',
                                height: '100%',
                                minHeight: isFullscreen ? '100vh' : 'calc(100vh - 250px)',
                                cursor: 'grab',
                            }}
                            contentStyle={{
                                width: '100%',
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                            }}
                        >
                            <div
                                className="erd-container"
                                ref={containerRef}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    display: 'flex',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                }}
                            />
                        </TransformComponent>
                    </>
                )}
            </TransformWrapper>
        </div>
    );
}
