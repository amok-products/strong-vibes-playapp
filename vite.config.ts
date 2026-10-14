import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // Pin the browser floor to Vite 5's former default ('modules'), so the move
    // to Vite 8 does not silently drop older Chrome/Edge versions. Vite 7+
    // defaults to a newer baseline, whose CSS minifier emits media-query range
    // syntax that Chrome/Edge before 104 cannot parse.
    target: ['es2020', 'edge88', 'firefox78', 'chrome87', 'safari14'],
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
