import fc from 'fast-check';

// Mínimo de 100 iteraciones por propiedad (design.md, Testing Strategy).
fc.configureGlobal({ numRuns: 100 });
