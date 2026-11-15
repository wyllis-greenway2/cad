// The build stamp set by vite.config.ts (the commit and its time).
declare const __BUILD__: string;
/** A stamp of the kernel's source and libraries (`dec_description_cache`). */
declare const __KERNEL__: string;
/** Vite's own: whether the page is served by the dev server. */
interface ImportMeta { readonly env: { readonly DEV: boolean; readonly PROD: boolean } }
