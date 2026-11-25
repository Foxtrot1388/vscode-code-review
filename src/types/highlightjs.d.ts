// highlight.js ships type definitions only for its package root.
// These declarations make the modular entry points usable with TypeScript.
declare module 'highlight.js/lib/core' {
  import type { HLJSApi } from 'highlight.js';
  const hljs: HLJSApi;
  export default hljs;
}

declare module 'highlight.js/lib/languages/1c' {
  import type { LanguageFn } from 'highlight.js';
  const language: LanguageFn;
  export default language;
}
