import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize, Minimize } from 'lucide-react';

import type { SchemaPack } from '../types/schemaPack';
import { ErdModel } from '../erd/model';
import { makeStage, refit, zoomBy, type Stage } from '../erd/stage';
import { TableView } from '../erd/tableView';
import { GraphView } from '../erd/graphView';

export type ErdMode = 'table' | 'graph';

const INFERRED_KEY = 'schemaingest.erd.inferred';

function readInferredPref(): boolean {
    try { return localStorage.getItem(INFERRED_KEY) !== 'off'; } catch { return true; }
}

interface ErdViewProps {
    pack: SchemaPack;
    focus: string;
    mode: ErdMode;
    onSelect: (table: string) => void;
    onMode: (mode: ErdMode) => void;
}

/* Both views draw the focused table and its first hop, straight from the pack.
     Table  the neighbourhood as records, with the columns that join them on
            every card - the view for "are these joins right?".
     Graph  the same neighbourhood as circles, coloured by direction, plus the
            relationships among the neighbours - "who is around this table?". */
export default function ErdView({ pack, focus, mode, onSelect, onMode }: ErdViewProps) {
    const rootRef = useRef<HTMLDivElement>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const topRef = useRef<HTMLDivElement>(null);
    const detailRef = useRef<HTMLDivElement>(null);
    const stageRef = useRef<Stage | null>(null);
    const [size, setSize] = useState({ w: 0, h: 0 });
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showInferred, setShowInferred] = useState(readInferredPref);

    const model = useMemo(() => new ErdModel(pack, { inferred: showInferred }), [pack, showInferred]);

    // What the pack says about keys, for the toggle and the notice above the canvas.
    const keys = useMemo(() => ({
        declared: pack.relationships.some(r => !r.inferred),
        inferred: pack.relationships.some(r => r.inferred),
        myisam: pack.tables.filter(t => t.storageEngine?.toLowerCase() === 'myisam').length,
    }), [pack]);

    const toggleInferred = (on: boolean) => {
        setShowInferred(on);
        try { localStorage.setItem(INFERRED_KEY, on ? 'on' : 'off'); } catch { /* private mode */ }
    };

    // The latest onSelect, without re-rendering the canvas when its identity changes.
    const selectRef = useRef(onSelect);
    selectRef.current = onSelect;

    // Both layouts are sized from the viewport, so a resize is a re-layout.
    useEffect(() => {
        const el = wrapRef.current;
        if (!el) return;
        let timer: number | undefined;
        const ro = new ResizeObserver(entries => {
            const r = entries[0].contentRect;
            window.clearTimeout(timer);
            timer = window.setTimeout(() => setSize({ w: Math.round(r.width), h: Math.round(r.height) }), 120);
        });
        ro.observe(el);
        return () => { ro.disconnect(); window.clearTimeout(timer); };
    }, []);

    useEffect(() => {
        if (!svgRef.current || !wrapRef.current || !topRef.current || !detailRef.current) return;
        if (!size.w || !size.h || !model.has(focus)) return;
        if (!stageRef.current)
            stageRef.current = makeStage(svgRef.current, wrapRef.current, topRef.current, detailRef.current);
        const st = stageRef.current;
        const select = (t: string) => selectRef.current(t);
        if (mode === 'table') new TableView(st, model, select).render(focus);
        else new GraphView(st, model, select).render(focus);
    }, [model, focus, mode, size]);

    useEffect(() => {
        const handler = () => setIsFullscreen(document.fullscreenElement === rootRef.current);
        document.addEventListener('fullscreenchange', handler);
        return () => document.removeEventListener('fullscreenchange', handler);
    }, []);

    const toggleFullscreen = () => {
        if (document.fullscreenElement) document.exitFullscreen?.();
        else rootRef.current?.requestFullscreen?.();
    };

    const zoom = (f: number) => stageRef.current && zoomBy(stageRef.current, f);
    const fitNow = () => stageRef.current && refit(stageRef.current, true);

    return (
        <div ref={rootRef} className={`erd${isFullscreen ? ' erd-fullscreen' : ''}`}>
            <div className="erd-bar">
                <div className="erd-modes" role="tablist" aria-label="Diagram view">
                    {(['table', 'graph'] as const).map(m => (
                        <button
                            key={m}
                            role="tab"
                            aria-selected={mode === m}
                            className={mode === m ? 'on' : ''}
                            onClick={() => onMode(m)}
                        >
                            {m === 'table' ? 'Table' : 'Graph'}
                        </button>
                    ))}
                </div>
                <div className="erd-counts" ref={topRef} />
                {keys.inferred && (
                    <label className="erd-toggle" title="Links guessed from column names such as user_id">
                        <input
                            type="checkbox"
                            checked={showInferred}
                            onChange={e => toggleInferred(e.target.checked)}
                        />
                        Inferred links
                    </label>
                )}
                <div className="erd-legend">
                    {keys.inferred && showInferred && <span><i className="dash" />inferred</span>}
                    {mode === 'table' ? (
                        <>
                            <span><i className="bar out" />references</span>
                            <span><i className="bar in" />referenced by</span>
                        </>
                    ) : (
                        <>
                            <span><i className="dot out" />references</span>
                            <span><i className="dot in" />referenced by</span>
                            <span><i className="dot both" />both ways</span>
                            <span><i className="bar near" />between neighbours</span>
                        </>
                    )}
                </div>
                <button
                    className="erd-btn"
                    onClick={toggleFullscreen}
                    title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                    aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                >
                    {isFullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
                </button>
            </div>
            {!keys.declared && (
                <div className="erd-note" role="note">
                    This database declares no foreign keys
                    {keys.myisam > 0 && <> - {keys.myisam} {keys.myisam === 1 ? 'table uses' : 'tables use'} MyISAM, which does not keep them</>}
                    {keys.inferred
                        ? (showInferred ? '. Dashed links are inferred from column names.' : '. Turn on inferred links to see ones guessed from column names.')
                        : ', and no column names suggest any.'}
                </div>
            )}
            <div className="erd-wrap" ref={wrapRef}>
                <svg className="erd-canvas" ref={svgRef} />
                <div className="erd-panel erd-detail" ref={detailRef} />
                <div className="erd-panel erd-zoom">
                    <button onClick={() => zoom(1.4)} title="Zoom in" aria-label="Zoom in">+</button>
                    <button onClick={() => zoom(1 / 1.4)} title="Zoom out" aria-label="Zoom out">&minus;</button>
                    <button onClick={fitNow} title="Fit to view" aria-label="Fit to view">Fit</button>
                </div>
            </div>
        </div>
    );
}
