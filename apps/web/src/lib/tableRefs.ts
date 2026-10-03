import type { Relationship } from '../types/schemaPack';

/** One column-to-column hop of a foreign key, seen from one table. */
export interface ColumnRef {
    table: string;
    column: string;
    inferred: boolean;
    constraint: string;
}

export interface TableRefs {
    /** Per local column: what it points at. */
    out: Map<string, ColumnRef[]>;
    /** Per local column: what points at it. */
    in: Map<string, ColumnRef[]>;
    /** Foreign keys, counted once each however many columns they span. */
    outCount: number;
    inCount: number;
}

/* A composite key arrives as one relationship per column sharing a constraint
   name, so the pairing is already per column; only the counts need grouping.
   A self-reference lands in both maps. */
export function tableRefs(relationships: Relationship[], table: string): TableRefs {
    const out = new Map<string, ColumnRef[]>();
    const inb = new Map<string, ColumnRef[]>();
    const outKeys = new Set<string>();
    const inKeys = new Set<string>();
    const add = (m: Map<string, ColumnRef[]>, k: string, v: ColumnRef) => {
        const list = m.get(k);
        if (list) list.push(v); else m.set(k, [v]);
    };
    for (const r of relationships) {
        const inferred = !!r.inferred;
        if (r.fromTable === table) {
            add(out, r.fromColumn, { table: r.toTable, column: r.toColumn, inferred, constraint: r.constraintName });
            outKeys.add(r.constraintName);
        }
        if (r.toTable === table) {
            add(inb, r.toColumn, { table: r.fromTable, column: r.fromColumn, inferred, constraint: r.constraintName });
            inKeys.add(`${r.fromTable}.${r.constraintName}`);
        }
    }
    return { out, in: inb, outCount: outKeys.size, inCount: inKeys.size };
}

/** `timestamp(6) with time zone` → `['timestamp', '(6)', ' with time zone']`,
    so the size can be set quieter than the type around it. */
export function splitType(type: string): [string, string, string] {
    const m = /^([^(]+)(\(.*\))(.*)$/.exec(type);
    return m ? [m[1], m[2], m[3]] : [type, '', ''];
}
