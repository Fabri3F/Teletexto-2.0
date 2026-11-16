import { render } from 'preact';
import './styles.css';

// Pantalla provisional que solo comprueba que Preact y Vite funcionan.
// La Portada (Página 100) y el resto de páginas se construyen en tareas posteriores (7.x).
function EnPreparacion() {
  return (
    <main class="pantalla">
      <header class="cabecera">TELETEXTO 2.0</header>
      <h1 class="titulo">Proyecto en preparación</h1>
      <p>La estructura del proyecto está lista.</p>
      <p>Las páginas se construyen en las próximas tareas.</p>
    </main>
  );
}

const raiz = document.getElementById('app');
if (raiz) {
  render(<EnPreparacion />, raiz);
}
