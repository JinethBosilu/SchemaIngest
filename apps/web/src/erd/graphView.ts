/* Graph view - who is around this table.

   One even ring, direction in the colour and nowhere else: blue is "the focus
   references it", teal is "it references the focus", violet is both. The ring
   is alphabetical, so a name can be found rather than deduced. Lines between
   two neighbours show how the neighbourhood hangs together. Ported from the
   entity mapper's renderGraph. */

import type { Selection } from 'd3-selection';

import type { Chord, ErdModel, RingNode } from './model';
import {
    alone, asLink, clearStage, esc, fit, hint, legHtml, topLine,
    type Leg, type Stage,
} from './stage';

const R_CORE = 11, R_GAP = 9, LBL_ROOM = 140;

interface Spoke { node: RingNode; dir: RingNode['dir']; d: string }
interface DrawnChord extends Chord { d: string }

// Pull a point back along the line toward (qx,qy) so an arrowhead lands on the
// rim of a circle rather than under it.
function backOff(px: number, py: number, qx: number, qy: number, pad: number): [number, number] {
    const dx = qx - px, dy = qy - py, L = Math.hypot(dx, dy) || 1;
    return [px + dx / L * pad, py + dy / L * pad];
}

/** Tied to the focus only by links guessed from column names. */
const onlyInferred = (d: RingNode): boolean => [...d.out, ...d.in].every(r => r.inferred);

function dirWords(d: RingNode, name: string): string {
    if (d.dir === 'both') return `${name} and ${d.table} reference each other`;
    return d.dir === 'out' ? `${name} references it` : `it references ${name}`;
}

export class GraphView {
    private nodes: Selection<SVGGElement, RingNode, SVGGElement, unknown> | null = null;
    private spokes: Selection<SVGPathElement, Spoke, SVGGElement, unknown> | null = null;
    private chords: Selection<SVGPathElement, DrawnChord, SVGGElement, unknown> | null = null;
    private base = 1;
    private chordBase = 1;
    private focus = '';

    constructor(private st: Stage, private model: ErdModel, private onSelect: (t: string) => void) {}

    render(name: string): void {
        const { st, model } = this;
        this.focus = name;
        st.lodBelow = 0.4;
        const nodeR = (n: string) => Math.min(9, 4 + Math.sqrt(model.degOf(n)));
        const N = model.hood(name, nodeR);
        const ring = N.ring, n = ring.length;

        // Wide enough that no two circles on the ring can touch.
        const R = Math.max(150, n * (2 * 9 + R_GAP) / (2 * Math.PI));
        ring.forEach((d, i) => {
            d.a = -Math.PI / 2 + i * 2 * Math.PI / (n || 1);
            d.x = R * Math.cos(d.a);
            d.y = R * Math.sin(d.a);
            d.flip = Math.cos(d.a) < 0;
        });
        const at = new Map(ring.map(d => [d.table, d]));

        const spokes: Spoke[] = ring.map(d => {
            const [cx, cy] = backOff(0, 0, d.x, d.y, R_CORE + 4);
            const [nx, ny] = backOff(d.x, d.y, 0, 0, d.r + 4);
            // Drawn in the direction of the reference, so the arrowhead lands on
            // whichever end is pointed at. Both-ways gets a head at each end.
            const outward = d.dir !== 'in';
            return { node: d, dir: d.dir, d: outward ? `M${cx},${cy}L${nx},${ny}` : `M${nx},${ny}L${cx},${cy}` };
        });

        const chords: DrawnChord[] = N.chords.map(c => {
            const a = at.get(c.from)!, b = at.get(c.to)!;
            // Bowed toward the centre, so a hub reads as a bundle of curves
            // rather than a cat's cradle of straight chords.
            let cx = (a.x + b.x) * 0.3, cy = (a.y + b.y) * 0.3;
            // Opposite neighbours have their midpoint at the origin, which would
            // drag the curve through the focus. Bow those round it.
            if (Math.hypot(cx, cy) < 60) {
                const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
                cx = -dy / L * 75; cy = dx / L * 75;
            }
            const [x1, y1] = backOff(a.x, a.y, cx, cy, a.r + 2);
            const [x2, y2] = backOff(b.x, b.y, cx, cy, b.r + 4);
            return { ...c, d: `M${x1},${y1}Q${cx},${cy} ${x2},${y2}` };
        });

        clearStage(st);
        this.base = n > 40 ? 0.32 : 0.6;
        this.chordBase = chords.length > 40 ? 0.16 : 0.42;

        this.chords = st.lines.selectAll<SVGPathElement, DrawnChord>('path.chord').data(chords).enter()
            .append('path')
            .attr('class', d => 'chord' + (d.ref.inferred ? ' inferred' : ''))
            .attr('d', d => d.d).attr('opacity', this.chordBase)
            .attr('marker-end', 'url(#erd-ar-near)')
            .on('mouseenter', (_ev, d) => this.highlight(null, d))
            .on('mouseleave', () => this.clear());
        this.chords.append('title').text(d => `${d.from} → ${d.to}\n` +
            d.ref.columns.map(c => `${c.from} → ${c.to}`).join('\n'));

        this.spokes = st.lines.selectAll<SVGPathElement, Spoke>('path.spoke').data(spokes).enter()
            .append('path')
            .attr('class', d => 'spoke ' + d.dir + (onlyInferred(d.node) ? ' inferred' : ''))
            .attr('d', d => d.d)
            .attr('opacity', this.base)
            .attr('marker-end', d => `url(#erd-ar-${d.dir})`)
            // auto-start-reverse turns the start head round so it points back at the focus.
            .attr('marker-start', d => (d.dir === 'both' ? 'url(#erd-ar-both)' : null))
            .on('mouseenter', (_ev, d) => this.highlight(d.node, null))
            .on('mouseleave', () => this.clear());

        if (N.selfRefs.length)
            st.lines.append('path').attr('class', 'loop')
                .attr('d', `M0,${-R_CORE + 3}A14,14 0 1,1 8,${-R_CORE + 5}`)
                .attr('marker-end', 'url(#erd-ar-out)')
                .append('title').text(`${name} → ${name}`);

        const nodes = st.nodes.selectAll<SVGGElement, RingNode>('g.node').data(ring).enter().append('g')
            .attr('class', d => 'node ' + d.dir + (model.degOf(d.table) >= 25 ? ' hub' : '') +
                (onlyInferred(d) ? ' inferred' : ''))
            .attr('transform', d => `rotate(${d.a * 180 / Math.PI}) translate(${R},0)`)
            .on('mouseenter', (_ev, d) => this.highlight(d, null))
            .on('mouseleave', () => this.clear())
            .on('focus', (_ev, d) => this.highlight(d, null))
            .on('blur', () => this.clear());
        asLink(nodes, d => d.table, model, this.onSelect);
        this.nodes = nodes;

        nodes.append('circle').attr('r', d => d.r);
        nodes.append('title').text(d =>
            `${d.table}\n${model.subOf(d.table)}\n${dirWords(d, name)}\n` +
            `${model.degOf(d.table)} related tables of its own` +
            (onlyInferred(d) ? '\ninferred from column names' : ''));
        // Rotated to its own spoke, so the labels fan out from the centre and
        // cannot collide however many there are.
        nodes.append('text').attr('class', 'lbl')
            .attr('x', d => (d.flip ? -(d.r + 7) : d.r + 7))
            .attr('dy', '0.32em')
            .attr('text-anchor', d => (d.flip ? 'end' : 'start'))
            .attr('transform', d => (d.flip ? 'rotate(180)' : null))
            .text(d => d.table);

        const core = st.nodes.append('g').attr('class', 'core');
        core.append('circle').attr('class', 'halo').attr('r', R_CORE + 9);
        core.append('circle').attr('r', R_CORE);
        core.append('title').text(`${name}\n${model.subOf(name)}`);
        core.append('text').attr('class', 'lbl')
            .attr('y', R_CORE + 17).attr('text-anchor', 'middle').text(name);

        if (!n) st.nodes.append('text').attr('class', 'ghint')
            .attr('x', 0).attr('y', 62).attr('text-anchor', 'middle').text(alone(name, model.inferred));

        st.top.innerHTML = topLine(model, name, n, N.selfRefs.length) +
            (chords.length ? ` <span>· <em>${chords.length}</em> between them</span>` : '');
        this.clear();
        // Fit the ring plus a fixed allowance and let the odd long name run off
        // the edge, rather than shrinking every circle to fit it.
        const half = R + LBL_ROOM;
        fit(st, false, { x: -half, y: -half, width: 2 * half, height: 2 * half }, 1.6);
    }

    private highlight(node: RingNode | null, chord: DrawnChord | null): void {
        if (!this.spokes || !this.chords || !this.nodes) return;
        const touches = (c: DrawnChord) => !!node && (c.from === node.table || c.to === node.table);
        this.spokes.attr('opacity', d => (node && d.node === node ? 1 : 0.05));
        this.chords.attr('opacity', d => ((chord ? d === chord : touches(d)) ? 0.95 : 0.04));
        this.nodes.attr('opacity', d =>
            ((chord ? d.table === chord.from || d.table === chord.to : d === node) ? 1 : 0.25));

        const focus = this.focus;
        if (chord) {
            this.st.detail.innerHTML = legHtml({ ref: chord.ref, src: chord.from, tgt: chord.to }) +
                `<div class="who">between two neighbours - neither is ${esc(focus)}</div>`;
            return;
        }
        if (!node) return;
        const legs: Leg[] = [
            ...node.out.map(ref => ({ ref, src: focus, tgt: node.table })),
            ...node.in.map(ref => ({ ref, src: node.table, tgt: focus })),
        ];
        const deg = this.model.degOf(node.table);
        this.st.detail.innerHTML =
            `<div class="hd">${esc(node.table)}</div>
             <div class="who">${esc(this.model.subOf(node.table))} · ${deg} related ${deg === 1 ? 'table' : 'tables'} of its own</div>` +
            legs.map(legHtml).join('');
    }

    private clear(): void {
        this.spokes?.attr('opacity', this.base);
        this.chords?.attr('opacity', this.chordBase);
        this.nodes?.attr('opacity', 1);
        this.st.detail.innerHTML = hint('Hover a circle for what joins it');
    }
}
