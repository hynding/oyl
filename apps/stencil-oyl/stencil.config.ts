import type { Config } from '@stencil/core'
import { join } from 'node:path'

/**
 * @oyl/all-of-oyl's `exports` point at TS source (for tsc / vitest). Stencil's Rollup only
 * transpiles this app's own src/, so bundle the package's browser ESM build (dist/) instead.
 * `pnpm lib` (chained into dev/build/test) rebuilds it first.
 */
const allOfOylDist = join(__dirname, '..', '..', 'packages', 'all-of-oyl', 'dist')
const allOfOylFromDist = {
  name: 'oyl-all-of-oyl-dist',
  resolveId(id: string) {
    if (id === '@oyl/all-of-oyl') return join(allOfOylDist, 'index.js')
    if (id.startsWith('@oyl/all-of-oyl/')) return join(allOfOylDist, id.slice('@oyl/all-of-oyl/'.length), 'index.js')
    return null
  },
}

const uiOylDist = join(__dirname, '..', '..', 'packages', 'ui-oyl', 'dist')

export const config: Config = {
  namespace: 'oyl',
  taskQueue: 'async',
  sourceMap: true,
  srcIndexHtml: 'src/index.html',
  globalStyle: 'src/global/app.css',
  globalScript: 'src/global/app.ts',
  rollupPlugins: { before: [allOfOylFromDist] },
  outputTargets: [
    {
      type: 'www',
      dir: 'www',
      serviceWorker: null,
      baseUrl: '/',
      copy: [
        { src: 'favicon.svg' },
        { src: join(uiOylDist, 'themes'), dest: 'themes' },
        { src: join(uiOylDist, 'ui-oyl', 'ui-oyl.css'), dest: 'tokens.css' },
      ],
    },
  ],
  devServer: { port: 3344, openBrowser: false, historyApiFallback: { index: 'index.html' } },
}
