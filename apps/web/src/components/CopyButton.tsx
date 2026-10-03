import { useState } from 'react';
import { Check, Clipboard } from 'lucide-react';

interface CopyButtonProps {
    getText: () => Promise<string>;
    loading?: boolean;
    label?: string;
}

export default function CopyButton({ getText, loading, label = 'Copy' }: CopyButtonProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        const text = await getText();
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            // Fallback for older browsers
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    // The button itself says it worked, so nothing floats over the page.
    return (
        <div className="copy-btn">
            <button
                type="button"
                className={`btn btn-secondary btn-sm${copied ? ' done' : ''}`}
                onClick={handleCopy}
                disabled={loading}
            >
                {loading
                    ? <span className="spinner" />
                    : copied ? <Check size={14} aria-hidden /> : <Clipboard size={14} aria-hidden />}
                <span aria-live="polite">{copied ? 'Copied' : label}</span>
            </button>
        </div>
    );
}
