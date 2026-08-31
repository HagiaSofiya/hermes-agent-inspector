import { build, context } from 'esbuild'

const options = {
  entryPoints: ['src/plugin.tsx'],
  outfile: 'dist/plugin.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  external: ['@hermes/plugin-sdk', 'react', 'react/jsx-runtime'],
  logLevel: 'info'
}

if (process.argv.includes('--watch')) {
  const watcher = await context(options)
  await watcher.watch()
  console.log('Watching src/ and rebuilding dist/plugin.js')
} else {
  await build(options)
}
