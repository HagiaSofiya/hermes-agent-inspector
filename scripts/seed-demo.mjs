import { spawnSync } from 'node:child_process'

const python = process.env.HERMES_PYTHON || 'python3'
const result = spawnSync(python, ['scripts/seed_demo_runs.py', ...process.argv.slice(2)], { stdio: 'inherit' })

if (result.error) {
  console.error(`Unable to run ${python}: ${result.error.message}`)
  process.exit(1)
}

process.exit(result.status ?? 1)
