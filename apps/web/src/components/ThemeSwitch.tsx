import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

type Theme = 'light' | 'dark';

const KEY = 'schemaingest.theme';
const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

/** What is on screen now: the saved choice if there is one, else the OS. */
function current(): Theme {
    const set = document.documentElement.dataset.theme;
    if (set === 'light' || set === 'dark') return set;
    return darkQuery().matches ? 'dark' : 'light';
}

/* index.html applies a saved choice before the first paint; this only flips
   it and remembers. With nothing saved, the page follows the OS, live. */
export default function ThemeSwitch() {
    const [theme, setTheme] = useState<Theme>(current);

    useEffect(() => {
        const mq = darkQuery();
        const follow = () => setTheme(current());
        mq.addEventListener('change', follow);
        return () => mq.removeEventListener('change', follow);
    }, []);

    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    const flip = () => {
        document.documentElement.dataset.theme = next;
        try { localStorage.setItem(KEY, next); } catch { /* private mode */ }
        setTheme(next);
    };

    const label = `Switch to ${next} theme`;
    return (
        <button type="button" className="theme-switch" onClick={flip} aria-label={label} title={label}>
            {theme === 'dark' ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
        </button>
    );
}
