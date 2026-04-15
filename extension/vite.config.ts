import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react' // fine with jsxImportSource: preact
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false, // set true if you want to debug
    cssCodeSplit: false, // keep CSS with the entry (we fetch our CSS separately anyway)
    rollupOptions: {
      input: {
        content: path.resolve(__dirname, 'src/content.tsx'),
      },
      output: {
        format: 'iife', // <— classic script, not ESM
        inlineDynamicImports: true, // <— prevents extra chunks
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
})
