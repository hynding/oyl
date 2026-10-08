import type { Config } from '@stencil/core'

export const config: Config = {
  namespace: 'ui-oyl',
  taskQueue: 'async',
  sourceMap: true,
  srcIndexHtml: 'src/dev/index.html',
  globalStyle: 'src/global/tokens.css',
  outputTargets: [
    { type: 'dist', esmLoaderPath: '../loader' },
    {
      type: 'dist-custom-elements',
      customElementsExportBehavior: 'single-export-module',
      externalRuntime: false,
      generateTypeDeclarations: true,
    },
    { type: 'docs-readme' },
    // Dev-only showcase (git-ignored). Themes are copied so the page can link them.
    { type: 'www', dir: 'www', serviceWorker: null, copy: [{ src: 'global/themes', dest: 'themes' }] },
  ],
  devServer: { port: 3443, openBrowser: false },
}
