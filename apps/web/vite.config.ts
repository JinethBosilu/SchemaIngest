import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    base: '/SchemaIngest/',
    server: {
        port: 5173,
    },
})
