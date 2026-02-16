import { useState } from 'react';

interface CopyButtonProps {
    getText: () => Promise<string>;
    loading?: boolean;
    label?: string;
}

export default function CopyButton({ getText, loading, label = '📋 Copy' }: CopyButtonProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        const text = await getText();
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // Fallback for older browsers
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        }
    };

    return (
        <div className="copy-btn" style={{ position: 'relative', display: 'inline-block' }}>
            <button className="btn btn-secondary btn-sm" onClick={handleCopy} disabled={loading}>
                {loading ? <span className="spinner"></span> : label}
            </button>
            {copied && <span className="copy-toast">Copied!</span>}
        </div>
    );
}
