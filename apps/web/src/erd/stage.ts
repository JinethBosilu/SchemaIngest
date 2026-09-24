/* The canvas both views draw on: an svg, a zoomable root, a layer of lines
   under a layer of nodes, and a fit. Ported from the entity mapper's
   makeStage/fit/clearStage. The views swap in and out of one stage, so the
   arrow markers are defined once and the level-of-detail threshold is the
   only thing a view changes. */

import { select, type Selection } from 'd3-selection';
import { zoom, zoomIdentity, type ZoomBehavior } from 'd3-zoom';
import 'd3-transition';

import type { ErdModel, Reference } from './model';

export const REDUCE = typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;

const PAD_X = 45, PAD_TOP = 20, PAD_BOTTOM = 82;
const MARKERS = { out: '--erd-out', in: '--erd-in', both: '--erd-both', near: '--erd-near' } as const;

export interface Box { x: number; y: number; width: number; height: number }

type G = Selection<SVGGElement, unknown, null, undefined>;

export interface Stage {
    svg: Selection<SVGSVGElement, unknown, null, undefined>;
    root: G;
    lines: G;
    nodes: G;
    wrap: HTMLElement;
    top: HTMLElement;
    detail: HTMLElement;
    zoom: ZoomBehavior<SVGSVGElement, unknown>;
    lodBelow: number;
    maxK: number;
    fitBox?: Box;
    fitMaxK?: number;
}

export function makeStage(svgEl: SVGSVGElement, wrap: HTMLElement, top: HTMLElement, detail: HTMLElement): Stage {
    const svg = select(svgEl);
    svg.selectAll('*').remove();
    const defs = svg.append('defs');
    for (const [k, colour] of Object.entries(MARKERS))
        defs.append('marker')
            .attr('id', `erd-ar-${k}`).attr('viewBox', '0 -5 10 10')
            .attr('refX', 9).attr('refY', 0)
            .attr('markerWidth', 6).attr('markerHeight', 6)
            .attr('orient', 'auto-start-reverse')
            .append('path').attr('d', 'M0,-3.6L8.5,0L0,3.6').style('fill', `var(${colour})`);

    const root = svg.append('g');
    const st: Stage = {
        svg, root,
        lines: root.append('g'),
        nodes: root.append('g'),
        wrap, top, detail,
        zoom: zoom<SVGSVGElement, unknown>().scaleExtent([0.06, 4]),
        lodBelow: 0.5,
        maxK: 1.15,
    };
    st.zoom.on('zoom', ev => {
        root.attr('transform', ev.transform.toString());
        root.classed('lod', ev.transform.k < st.lodBelow);
    });
    svg.call(st.zoom);
    return st;
}

export function zoomBy(st: Stage, f: number): void {
    st.svg.transition().duration(REDUCE ? 0 : 180).call(st.zoom.scaleBy, f);
}

/* box lets a caller override the measured extent. The Graph view does, because
   its labels fan out and fitting the longest of them would shrink the circles
   to nothing; it fits the ring plus a fixed allowance. The choice is kept on
   the stage so the Fit button and a resize refit the same way. */
export function fit(st: Stage, animate: boolean, box?: Box, maxK?: number): void {
    st.fitBox = box;
    st.fitMaxK = maxK;
    const b = box ?? st.root.node()!.getBBox();
    const W = st.wrap.clientWidth, H = st.wrap.clientHeight;
    if (!W || !H || !b.width || !b.height) return;
    const availH = H - PAD_TOP - PAD_BOTTOM;
    const k = Math.min(maxK ?? st.maxK, (W - 2 * PAD_X) / b.width, availH / b.height);
    const t = zoomIdentity
        .translate(W / 2 - (b.x + b.width / 2) * k, PAD_TOP + availH / 2 - (b.y + b.height / 2) * k)
        .scale(k);
    if (animate && !REDUCE) st.svg.transition().duration(420).call(st.zoom.transform, t);
    else st.svg.call(st.zoom.transform, t);
}

export const refit = (st: Stage, animate: boolean): void => fit(st, animate, st.fitBox, st.fitMaxK);

export function clearStage(st: Stage): void {
    st.lines.selectAll('*').remove();
    st.nodes.selectAll('*').remove();
}

/* ---------- bits both views say ---------------------------------------- */

export const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"]/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export function clip(s: unknown, n: number): string {
    const t = String(s ?? '');
    return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

export interface Leg { ref: Reference; src: string; tgt: string }

export function legHtml(l: Leg): string {
    return `<div class="leg"><div class="hd">${esc(l.src)} → ${esc(l.tgt)}</div>
     <div class="who">${l.ref.inferred ? '<i>inferred from column name</i>' : esc(l.ref.constraint)}</div>
     <ul>${l.ref.columns.map(c =>
        `<li>${esc(c.from)} <span>→</span> ${esc(c.to)}</li>`).join('')}</ul></div>`;
}

export const hint = (lead: string): string => `<div class="hd">${esc(lead)}</div>` +
    '<div class="who">click one to move there · scroll to zoom · drag to pan</div>';

export const alone = (name: string, inferred: boolean): string =>
    `Nothing references ${name}, and it references nothing - no foreign keys either way` +
    (inferred ? ', and no column names that suggest one.' : '.');

export function topLine(model: ErdModel, name: string, total: number, selfN: number): string {
    const e = model.byTable.get(name)!;
    return `<b>${esc(name)}</b>
    <span class="o"><em>${e.references.length}</em> references</span>
    <span class="i"><em>${model.inboundOf(name).length}</em> referenced by</span>
    <span>· ${total} related ${total === 1 ? 'table' : 'tables'}` +
        `${selfN ? ', plus a self-reference' : ''}</span>`;
}

/** Cards and circles are keyboard-reachable links in all but name. */
export function asLink<E extends SVGElement, D>(
    sel: Selection<E, D, SVGGElement, unknown>,
    target: (d: D) => string,
    model: ErdModel,
    onSelect: (table: string) => void,
): void {
    sel.attr('tabindex', d => (model.has(target(d)) ? 0 : null))
        .attr('role', d => (model.has(target(d)) ? 'link' : null))
        .classed('dead', d => !model.has(target(d)))
        .on('click', (_ev, d) => { if (model.has(target(d))) onSelect(target(d)); })
        .on('keydown', (ev, d) => {
            const key = (ev as KeyboardEvent).key;
            if ((key === 'Enter' || key === ' ') && model.has(target(d))) {
                ev.preventDefault();
                onSelect(target(d));
            }
        });
}
