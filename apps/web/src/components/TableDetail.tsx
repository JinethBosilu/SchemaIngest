import { Fragment, useMemo, useState } from 'react';
import { ArrowUpRight, KeyRound } from 'lucide-react';
import type { TableInfo, Relationship } from '../types/schemaPack';
import { splitType, tableRefs, type ColumnRef } from '../lib/tableRefs';

interface TableDetailProps {
    table: TableInfo;
    relationships: Relationship[];
    onSelect: (table: string) => void;
}

const SHOW_FIRST = 6;
const FOLD_ABOVE = 8;

interface RefRowsProps {
    refs: ColumnRef[];
    onSelect: (t: string) => void;
    /** Write the key's name beside each link; the inbound lists want it. */
    via?: boolean;
}

/* One reference per line. Past a handful the list folds, so one popular
   column cannot push the rest of the table off the screen. */
function RefRows({ refs, onSelect, via = false }: RefRowsProps) {
    const [open, setOpen] = useState(false);
    const folded = !open && refs.length > FOLD_ABOVE;
    const shown = folded ? refs.slice(0, SHOW_FIRST) : refs;
    return (
        <ul className="ref-rows">
            {shown.map(r => (
                <li key={`${r.table}.${r.column}.${r.constraint}`}>
                    <button
                        type="button"
                        className={`ref-link${r.inferred ? ' inferred' : ''}`}
                        title={r.inferred ? 'Inferred from column name' : r.constraint}
                        onClick={() => onSelect(r.table)}
                    >
                        {r.table}<span className="col">.{r.column}</span>
                    </button>
                    {via && <span className="via">{r.inferred ? 'inferred from column name' : r.constraint}</span>}
                </li>
            ))}
            {folded && (
                <li>
                    <button type="button" className="ref-more" onClick={() => setOpen(true)}>
                        Show all {refs.length}
                    </button>
                </li>
            )}
        </ul>
    );
}

/* One row per column, read left to right as a sentence: key, name, type,
   whether it may be null, its default, and where it points. What points at
   a column is written on a line under it, so a table's joins are read on the
   columns they use rather than in a separate list. */
export default function TableDetail({ table, relationships, onSelect }: TableDetailProps) {
    const refs = useMemo(() => tableRefs(relationships, table.name), [relationships, table.name]);

    // References naming a column the table does not list; rare, but not dropped.
    const loose = useMemo(() => {
        const names = new Set(table.columns.map(c => c.name));
        return [...refs.in].filter(([col]) => !names.has(col)).flatMap(([, rs]) => rs);
    }, [refs, table.columns]);

    return (
        <>
            <div className="cols-scroll">
                <table className="cols">
                    <thead>
                        <tr>
                            <th className="k"><span className="visually-hidden">Key</span></th>
                            <th>Column</th>
                            <th>Type</th>
                            <th>Nullable</th>
                            <th>Default</th>
                            <th>References</th>
                        </tr>
                    </thead>
                    <tbody>
                        {table.columns.map(col => {
                            const out = refs.out.get(col.name) ?? [];
                            const inb = refs.in.get(col.name) ?? [];
                            const [base, args, tail] = splitType(col.type);
                            const target = out.map(r => `${r.table}.${r.column}`).join(', ');
                            const guessed = out.length > 0 && out.every(r => r.inferred);
                            return (
                                <Fragment key={`${table.name}.${col.name}`}>
                                    <tr className={inb.length ? 'has-in' : undefined}>
                                        <td className="k">
                                            {col.isPrimaryKey ? (
                                                <KeyRound size={14} className="pk" role="img" aria-label="Primary key">
                                                    <title>Primary key</title>
                                                </KeyRound>
                                            ) : out.length > 0 && (
                                                <ArrowUpRight
                                                    size={15}
                                                    className={`fk${guessed ? ' guessed' : ''}`}
                                                    role="img"
                                                    aria-label={`References ${target}`}
                                                >
                                                    <title>{guessed ? `Probably references ${target}` : `References ${target}`}</title>
                                                </ArrowUpRight>
                                            )}
                                        </td>
                                        <td className="nmc"><span className="nm" title={col.name}>{col.name}</span></td>
                                        <td className="tyc">
                                            <span className="ty">{base}{args && <span className="args">{args}</span>}{tail}</span>
                                        </td>
                                        <td className="nl">
                                            {col.nullable && <span className="yes">yes</span>}
                                        </td>
                                        <td className="df" title={col.default ?? undefined}>{col.default}</td>
                                        <td className="rf">{out.length > 0 && <RefRows refs={out} onSelect={onSelect} />}</td>
                                    </tr>
                                    {inb.length > 0 && (
                                        <tr className="inb-row">
                                            <td className="k" />
                                            <td className="inb" colSpan={5}>
                                                <div className="inb-grid">
                                                    <span className="inb-label">Referenced by</span>
                                                    <RefRows refs={inb} onSelect={onSelect} via />
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {loose.length > 0 && (
                <section className="sect">
                    <h3>Also referenced by</h3>
                    <div className="loose"><RefRows refs={loose} onSelect={onSelect} via /></div>
                </section>
            )}

            {table.indexes.length > 0 && (
                <section className="sect">
                    <h3>Indexes<span className="n">{table.indexes.length}</span></h3>
                    <table className="idx">
                        <tbody>
                            {table.indexes.map(ix => (
                                <tr key={ix.name}>
                                    <td className="nm">{ix.name}</td>
                                    <td className="on">{ix.columns.join(', ')}</td>
                                    <td className="u">{ix.isUnique ? 'unique' : ''}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>
            )}
        </>
    );
}
