import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { SchemaPack } from './types/schemaPack';

interface AppState {
    schemaPack: SchemaPack | null;
    isPaired: boolean;
    setSchemaPack: (pack: SchemaPack | null) => void;
    setIsPaired: (isPaired: boolean) => void;
    clearSessionData: () => void;
}

/* Connection details are deliberately not kept here: they are sent to the
   agent once, for introspection, and everything after works from the pack.
   Version 1 drops the connection fields (password included) that version 0
   persisted. */
export const useAppStore = create<AppState>()(
    persist(
        (set) => ({
            schemaPack: null,
            isPaired: false,
            setSchemaPack: (pack) => set({ schemaPack: pack }),
            setIsPaired: (isPaired) => set({ isPaired }),
            clearSessionData: () => set({ schemaPack: null, isPaired: false }),
        }),
        {
            name: 'schemaingest-storage',
            version: 1,
            storage: createJSONStorage(() => sessionStorage),
            partialize: (s) => ({ schemaPack: s.schemaPack, isPaired: s.isPaired }),
            migrate: (persisted) => {
                const { schemaPack = null, isPaired = false } = (persisted ?? {}) as Partial<AppState>;
                return { schemaPack, isPaired };
            },
        }
    )
);
