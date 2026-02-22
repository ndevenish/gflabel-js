/// <reference types="vite/client" />

declare module "*.wasm?url" {
  const url: string;
  export default url;
}

declare module "*.ttf?url" {
  const url: string;
  export default url;
}

declare module "*?worker&url" {
  const url: string;
  export default url;
}

declare module "replicad-opencascadejs/src/replicad_single.js" {
  // The actual init function accepts { locateFile } but the bundled .d.ts
  // declares it with zero args. We override here for Vite/worker usage.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const init: (options?: { locateFile?: () => string }) => Promise<any>;
  export default init;
}
