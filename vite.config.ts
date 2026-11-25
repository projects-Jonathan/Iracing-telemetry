import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative asset paths, so the build works at a domain root (unison.jonathanwan.link)
// and under a sub-path (github.io/Iracing-telemetry/) alike.
export default defineConfig({
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
});
