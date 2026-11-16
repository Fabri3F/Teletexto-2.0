import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';

// Las rutas son relativas a apps/web, que es el directorio donde npm ejecuta los scripts
// del workspace @teletexto/web (npm run dev | build | preview).
export default defineConfig({
  plugins: [preact()],
  // public/ vive en la raíz del repositorio (ver structure.md): _headers y geo/departamentos.json.
  publicDir: '../../public',
  build: {
    // dist/ es la carpeta que publica la CDN. La tarea 2.8 (CLI de ingesta) define cómo se
    // combina con p/NNN.json, d/alertas.json y manifest.json.
    outDir: '../../dist',
    emptyOutDir: true,
  },
});
