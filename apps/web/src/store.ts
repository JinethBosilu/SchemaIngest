import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { SchemaPack, ConnectFields } from './types/schemaPack';

interface AppState {
    schemaPack: SchemaPack | null;
    connFields: ConnectFields | null;
    isPaired: boolean;
    setSchemaPack: (pack: SchemaPack | null) => void;
    setConnFields: (fields: ConnectFields | null) => void;
    setIsPaired: (isPaired: boolean) => void;
    clearSessionData: () => void;
}

export const useAppStore = create<AppState>()(
    persist(
        (set) => ({
            schemaPack: null,
            connFields: null,
            isPaired: false,
            setSchemaPack: (pack) => set({ schemaPack: pack }),
            setConnFields: (fields) => set({ connFields: fields }),
            setIsPaired: (isPaired) => set({ isPaired }),
            clearSessionData: () => set({ schemaPack: null, connFields: null, isPaired: false }),
        }),
        {
            name: 'schemaingest-storage',
            storage: createJSONStorage(() => sessionStorage),
        }
    )
);
