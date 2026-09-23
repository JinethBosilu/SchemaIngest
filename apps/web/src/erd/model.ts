/* The schema pack reshaped for the diagram, following the entity mapper this
   view is ported from: every table carries its outbound references, and an
   inbound index answers "what points at me". A reference is one foreign key -
   a composite key is one reference with several column matches, not several
   references. Nothing here is inferred; it is the pack, regrouped. */

import type { SchemaPack, TableInfo } from '../types/schemaPack';

export interface ColumnMatch { from: string; to: string }

/** One foreign key, read from the side that declares it. */
export interface Reference {
    table: string;        // the table pointed at
    constraint: string;
    columns: ColumnMatch[];
}

export interface Entity {
    name: string;
    info: TableInfo;
    references: Reference[];
}

export interface Inbound { from: string; ref: Reference }

export type Dir = 'out' | 'in' | 'both';

/** A neighbour card in the Table view. */
export interface Card {
    table: string;
    ref: Reference;
    dir: 'out' | 'in';
    both?: boolean;
    back?: Reference;     // the reference coming the other way, for a both-ways pair
    x: number;
    y: number;
}

/** A neighbour circle in the Graph view. */
export interface RingNode {
    table: string;
    dir: Dir;
    out: Reference[];     // focus -> this table
    in: Reference[];      // this table -> focus
    r: number;
    a: number;
    x: number;
    y: number;
    flip: boolean;
}

export interface Chord { from: string; to: string; ref: Reference }

export class ErdModel {
    readonly byTable = new Map<string, Entity>();
    readonly inbound = new Map<string, Inbound[]>();
    readonly degree = new Map<string, number>();

    constructor(pack: SchemaPack) {
        for (const t of pack.tables) this.byTable.set(t.name, { name: t.name, info: t, references: [] });

        // Relationships come one row per column pair; the constraint name ties
        // the columns of one key back together.
        const byKey = new Map<string, Reference>();
        for (const r of pack.relationships) {
            const owner = this.byTable.get(r.fromTable);
            if (!owner) continue;
            const key = `${r.fromTable}\u0000${r.constraintName}`;
            let ref = byKey.get(key);
            if (!ref) {
                ref = { table: r.toTable, constraint: r.constraintName, columns: [] };
                byKey.set(key, ref);
                owner.references.push(ref);
            }
            ref.columns.push({ from: r.fromColumn, to: r.toColumn });
        }

        for (const name of this.byTable.keys()) this.inbound.set(name, []);
        for (const e of this.byTable.values())
            for (const ref of e.references)
                if (ref.table !== e.name) this.inbound.get(ref.table)?.push({ from: e.name, ref });

        // How many distinct tables each one touches, either way. This sizes a
        // circle in the Graph view, so a neighbour that is itself a hub looks like one.
        const nb = new Map<string, Set<string>>();
        for (const name of this.byTable.keys()) nb.set(name, new Set());
        for (const e of this.byTable.values())
            for (const ref of e.references) {
                if (ref.table === e.name) continue;
                nb.get(e.name)!.add(ref.table);
                nb.get(ref.table)?.add(e.name);
            }
        for (const [k, v] of nb) this.degree.set(k, v.size);
    }

    has(name: string): boolean { return this.byTable.has(name); }
    degOf(name: string): number { return this.degree.get(name) ?? 0; }
    inboundOf(name: string): Inbound[] { return this.inbound.get(name) ?? []; }

    /** The line under a name: how big the table is, or that it is not in this schema. */
    subOf(name: string): string {
        const e = this.byTable.get(name);
        if (!e) return 'outside this schema';
        const n = e.info.columns.length;
        return `${e.info.schema}.${name} · ${n} ${n === 1 ? 'column' : 'columns'}`;
    }

    /** Everything the Table view draws: the focus, its first hop either way,
     *  and which of its columns carry the joins. */
    neighbourhood(name: string) {
        const e = this.byTable.get(name)!;
        const selfRefs = e.references.filter(r => r.table === name);
        const outs: Card[] = e.references.filter(r => r.table !== name)
            .map(r => ({ table: r.table, ref: r, dir: 'out' as const, x: 0, y: 0 }));

        // A pair that references each other both ways is one card with two
        // arrows; the same table in both columns would read as a bug.
        const back = new Map<string, Inbound[]>();
        for (const x of this.inboundOf(name)) {
            if (!back.has(x.from)) back.set(x.from, []);
            back.get(x.from)!.push(x);
        }
        for (const o of outs) {
            const t = back.get(o.table)?.shift();
            if (t) { o.both = true; o.back = t.ref; }
        }
        const ins: Card[] = [...back.values()].flat()
            .map(x => ({ table: x.from, ref: x.ref, dir: 'in' as const, x: 0, y: 0 }));

        // The focus card lists only the columns that carry a join - which of
        // its columns are load-bearing, and how much hangs off each one.
        const cols: string[] = [];
        const load = new Map<string, number>();
        const note = (c: string) => {
            if (!load.has(c)) { cols.push(c); load.set(c, 0); }
            load.set(c, load.get(c)! + 1);
        };
        // Every column of a composite key counts; edges anchor on the first.
        outs.forEach(o => o.ref.columns.forEach(c => note(c.from)));
        selfRefs.forEach(r => r.columns.forEach(c => { note(c.from); note(c.to); }));
        outs.forEach(o => o.back?.columns.forEach(c => note(c.to)));
        ins.forEach(x => x.ref.columns.forEach(c => note(c.to)));

        return { e, outs, ins, selfRefs, cols, load };
    }

    /** The Graph view's ring - every neighbour once, alphabetical - and the
     *  references among the neighbours themselves. */
    hood(name: string, radius: (table: string) => number) {
        const e = this.byTable.get(name)!;
        const refOut = new Map<string, Reference[]>();
        const refIn = new Map<string, Reference[]>();
        const push = (m: Map<string, Reference[]>, k: string, r: Reference) => {
            if (!m.has(k)) m.set(k, []);
            m.get(k)!.push(r);
        };
        for (const r of e.references) if (r.table !== name) push(refOut, r.table, r);
        for (const x of this.inboundOf(name)) push(refIn, x.from, x.ref);

        const ring: RingNode[] = [...new Set([...refIn.keys(), ...refOut.keys()])].sort()
            .map(n => ({
                table: n,
                dir: refOut.has(n) && refIn.has(n) ? 'both' : refOut.has(n) ? 'out' : 'in',
                out: refOut.get(n) ?? [],
                in: refIn.get(n) ?? [],
                r: radius(n),
                a: 0, x: 0, y: 0, flip: false,
            }));

        const member = new Set(ring.map(n => n.table));
        const chords: Chord[] = [];
        for (const n of ring)
            for (const r of this.byTable.get(n.table)?.references ?? [])
                if (r.table !== n.table && member.has(r.table))
                    chords.push({ from: n.table, to: r.table, ref: r });

        return { e, ring, chords, selfRefs: e.references.filter(r => r.table === name) };
    }
}
