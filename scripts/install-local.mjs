import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const hermesHome = process.env.HERMES_HOME

if (!hermesHome) {
  throw new Error('Set HERMES_HOME to your Hermes home before running npm run install:local')
}

const pluginRoot = join(hermesHome, 'plugins', 'agent-inspector')
const desktopDestination = join(pluginRoot, 'desktop', 'plugin.js')
const dashboardDestination = join(pluginRoot, 'dashboard')

await mkdir(dirname(desktopDestination), { recursive: true })
await mkdir(dashboardDestination, { recursive: true })
await copyFile('dist/plugin.js', desktopDestination)

for (const file of ['manifest.json', 'plugin_api.py', 'db.py', 'models.py']) {
  await copyFile(join('backend', file), join(dashboardDestination, file))
}

console.log(`Installed desktop/plugin.js to ${desktopDestination}`)
console.log(`Installed dashboard backend to ${dashboardDestination}`)
