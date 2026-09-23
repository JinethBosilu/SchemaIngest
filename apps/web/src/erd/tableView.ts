/* Table view - the focused table and its first hop as records.

   A deliberate grid, not a simulation. What points at the focus is on the
   left, what it points at is on the right, so direction is answered by
   position before an arrowhead is read - and cards on a grid cannot overlap,
   which is the whole reason for choosing one over a force layout on a hub
   table with a hundred neighbours.

   The join lives on the card, not on the line. That keeps every label legible
   however dense the canvas gets. Ported from the entity mapper's renderTable. */

import type { Selection } from 'd3-selection';

import type { Card, ErdModel, Reference } from './model';
import {
    alone, asLink, clearStage, clip, fit, hint, legHtml, topLine,
    type Leg, type Stage,
} from './stage';

const CW = 216, CH = 62, GY = 16, GX = 140, SGX = 48, FW = 252, ROW = 18;
const PAD_X = 45, PAD_TOP = 20, PAD_BOTTOM = 82;

interface Edge {
    dir: 'out' | 'in';
    card: Card | null;
    ref: Reference;
    src: string;
    tgt: string;
    d: string;
}

/* How tall to let a column grow before starting another one further out.
   Search the shape and keep the one the viewport can show largest. Ties go to
   the tallest, so a handful of neighbours stay in one column. */
function bestRows(nIn: number, nOut: number, FH: number, W: number, H: number): number {
    const n = Math.max(nIn, nOut, 1);
    let best = 1, bestK = -1;
    for (let r = n; r >= 1; r--) {
        const ci = Math.ceil(nIn / r), co = Math.ceil(nOut / r);
        const side = (c: number) => (c ? GX + c * CW + (c - 1) * SGX : 0);
        const w = FW + side(ci) + side(co);
        const rows = Math.min(r, n);
        const h = Math.max(FH, rows * CH + (rows - 1) * GY);
        const k = Math.min(1.15, (W - 2 * PAD_X) / w, (H - PAD_TOP - PAD_BOTTOM) / h);
        if (k > bestK) { bestK = k; best = r; }
    }
    return best;
}

function edgePath(x1: number, y1: number, x2: number, y2: number): string {
    const dx = Math.max(55, Math.abs(x2 - x1) * 0.45) * (x2 >= x1 ? 1 : -1);
    return `M${x1},${y1}C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
}

function joinText(ref: Reference): string {
    const c = ref.columns[0];
    if (!c) return '';
    const room = (c.from.length + c.to.length) <= 26 ? 99 : 13;
    return clip(c.from, room) + ' → ' + clip(c.to, room);
}

export class TableView {
    private cards: Selection<SVGGElement, Card, SVGGElement, unknown> | null = null;
    private paths: Selection<SVGPathElement, Edge, SVGGElement, unknown> | null = null;
    private base = 1;
    private focus = '';

    constructor(private st: Stage, private model: ErdModel, private onSelect: (t: string) => void) {}

    render(name: string): void {
        const { st, model } = this;
        this.focus = name;
        st.lodBelow = 0.5;
        const N = model.neighbourhood(name);
        const e = N.e;

        const W = st.wrap.clientWidth || 1000, H = st.wrap.clientHeight || 700;
        const cols = N.cols;
        const FH = Math.max(CH, 44 + Math.max(cols.length, 1) * ROW + 8);
        const fx = -FW / 2, fy = -FH / 2;
        const rowY = (c: string) => {
            const i = cols.indexOf(c);
            return i < 0 ? fy + FH / 2 : fy + 44 + i * ROW + ROW / 2 - 4;
        };

        const maxRows = bestRows(N.ins.length, N.outs.length, FH, W, H);
        const place = (items: Card[], side: 1 | -1) => {
            for (let i = 0; i < items.length; i += maxRows) {
                const chunk = items.slice(i, i + maxRows);
                const k = i / maxRows;
                const top = -(chunk.length * CH + (chunk.length - 1) * GY) / 2;
                chunk.forEach((it, j) => {
                    it.y = top + j * (CH + GY);
                    it.x = side > 0 ? FW / 2 + GX + k * (CW + SGX)
                        : -FW / 2 - GX - k * (CW + SGX) - CW;
                });
            }
        };
        place(N.outs, 1);
        place(N.ins, -1);

        const edges: Edge[] = [];
        N.outs.forEach(o => {
            edges.push({
                dir: 'out', card: o, ref: o.ref, src: name, tgt: o.table,
                d: edgePath(FW / 2, rowY(o.ref.columns[0]?.from ?? '?'),
                    o.x, o.y + CH / 2 - (o.both ? 7 : 0)),
            });
            if (o.both && o.back) edges.push({
                dir: 'in', card: o, ref: o.back, src: o.table, tgt: name,
                d: edgePath(o.x, o.y + CH / 2 + 7, FW / 2, rowY(o.back.columns[0].to) + 4),
            });
        });
        N.ins.forEach(x => {
            edges.push({
                dir: 'in', card: x, ref: x.ref, src: x.table, tgt: name,
                d: edgePath(x.x + CW, x.y + CH / 2, -FW / 2, rowY(x.ref.columns[0]?.to ?? '?')),
            });
        });
        // A self-reference is a real hierarchy (a parent row), so it gets a loop
        // rather than a card pointing at itself.
        N.selfRefs.forEach(r => {
            const y1 = rowY(r.columns[0].from);
            let y2 = rowY(r.columns[0].to);
            if (Math.abs(y2 - y1) < 2) y2 = y1 + 6;
            edges.push({
                dir: 'out', card: null, ref: r, src: name, tgt: name,
                d: `M${FW / 2},${y1}C${FW / 2 + 105},${y1 - 30} ${FW / 2 + 105},${y2 + 30} ${FW / 2},${y2}`,
            });
        });

        clearStage(st);
        this.base = N.outs.length + N.ins.length > 24 ? 0.3 : 0.62;

        this.paths = st.lines.selectAll<SVGPathElement, Edge>('path').data(edges).enter().append('path')
            .attr('class', d => 'edge ' + d.dir)
            .attr('d', d => d.d)
            .attr('opacity', this.base)
            .attr('marker-end', d => `url(#erd-ar-${d.dir})`)
            .on('mouseenter', (_ev, d) => this.highlight(d.card, d))
            .on('mouseleave', () => this.clear());

        const cards = st.nodes.selectAll<SVGGElement, Card>('g.card').data([...N.ins, ...N.outs]).enter()
            .append('g')
            .attr('class', d => 'card ' + d.dir)
            .attr('transform', d => `translate(${d.x},${d.y})`)
            .on('mouseenter', (_ev, d) => this.highlight(d, null))
            .on('mouseleave', () => this.clear())
            .on('focus', (_ev, d) => this.highlight(d, null))
            .on('blur', () => this.clear());
        asLink(cards, d => d.table, model, this.onSelect);
        this.cards = cards;

        cards.append('rect').attr('width', CW).attr('height', CH).attr('rx', 7);
        cards.append('title').text(d =>
            `${d.dir === 'out' ? name + ' → ' + d.table : d.table + ' → ' + name}\n` +
            `${model.subOf(d.table)}\n` +
            d.ref.columns.map(m => `${m.from} → ${m.to}`).join('\n'));
        cards.append('text').attr('class', 'nm').attr('x', 11).attr('y', 20)
            .text(d => clip(d.table, 25));
        cards.append('text').attr('class', 'tb').attr('x', 11).attr('y', 33)
            .text(d => clip(model.subOf(d.table), 32));
        cards.append('line').attr('class', 'rule')
            .attr('x1', 0).attr('x2', CW).attr('y1', 40).attr('y2', 40);
        cards.append('text').attr('class', 'jn').attr('x', 11).attr('y', 53)
            .text(d => joinText(d.ref));
        cards.append('text').attr('class', 'chip').attr('x', CW - 10).attr('y', 53)
            .attr('text-anchor', 'end')
            .text(d => (d.both ? '↔ ' : '') +
                (d.ref.columns.length > 1 ? '+' + (d.ref.columns.length - 1) : ''));

        const f = st.nodes.append('g').attr('class', 'card focus')
            .attr('transform', `translate(${fx},${fy})`);
        f.append('rect').attr('width', FW).attr('height', FH).attr('rx', 8);
        f.append('title').text(`${name}\n${model.subOf(name)}`);
        f.append('text').attr('class', 'nm').attr('x', 12).attr('y', 22).text(clip(name, 27));
        f.append('text').attr('class', 'tb').attr('x', 12).attr('y', 36).text(clip(model.subOf(name), 34));
        f.append('line').attr('class', 'rule')
            .attr('x1', 0).attr('x2', FW).attr('y1', 44).attr('y2', 44);

        const keys = new Set(e.info.primaryKey);
        cols.forEach((c, i) => {
            const y = fy + 44 + i * ROW + ROW / 2 - 4;
            const row = f.append('g').attr('transform', `translate(0,${y - fy})`);
            row.append('text').attr('class', 'fc' + (keys.has(c) ? ' key' : ''))
                .attr('x', 12).attr('y', 4).text(clip(c, 24));
            if (keys.has(c))
                row.append('text').attr('class', 'kb').attr('x', FW - 34).attr('y', 4)
                    .attr('text-anchor', 'end').text('PK');
            const n = N.load.get(c) ?? 0;
            if (n) row.append('text').attr('class', 'fn').attr('x', FW - 12).attr('y', 4)
                .attr('text-anchor', 'end').text(n);
        });

        if (!edges.length) st.nodes.append('text').attr('class', 'ghint')
            .attr('x', 0).attr('y', fy + FH + 34).attr('text-anchor', 'middle')
            .text(alone(name));

        st.top.innerHTML = topLine(model, name, N.outs.length + N.ins.length, N.selfRefs.length);
        this.clear();
        fit(st, false);
    }

    /* Hovering lifts one relationship out of the bundle and spells it out in
       full - that is where the "+3" on a card goes. The strip is pinned rather
       than tracking the cursor, so a long composite key reads without jitter. */
    private highlight(card: Card | null, edge: Edge | null): void {
        if (!this.paths) return;
        this.paths.attr('opacity', d => ((edge ? d === edge : d.card === card) ? 1 : 0.05));
        this.cards?.attr('opacity', d => (d === card ? 1 : 0.25));

        // Hovering the card of a both-ways pair reports both ways; hovering one
        // of its two edges reports just that one.
        const focus = this.focus;
        let legs: Leg[];
        if (edge) legs = [{ ref: edge.ref, src: edge.src, tgt: edge.tgt }];
        else if (!card) legs = [];
        else if (card.dir === 'out')
            legs = [{ ref: card.ref, src: focus, tgt: card.table }]
                .concat(card.both && card.back ? [{ ref: card.back, src: card.table, tgt: focus }] : []);
        else legs = [{ ref: card.ref, src: card.table, tgt: focus }];
        this.st.detail.innerHTML = legs.map(legHtml).join('');
    }

    private clear(): void {
        this.paths?.attr('opacity', this.base);
        this.cards?.attr('opacity', 1);
        this.st.detail.innerHTML = hint('Hover a card for every column match');
    }
}

