/**
 * Packs the library exactly as npm would and imports the tarball from a
 * throw-away directory, so a broken `exports` map or missing file fails CI.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = process.cwd()
const workDir = mkdtempSync(join(tmpdir(), 'bizdate-pack-'))
try {
  const tarball = execFileSync('npm', ['pack', '--ignore-scripts', '--pack-destination', workDir], {
    cwd: root,
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .at(-1)
  if (tarball === undefined) throw new Error('npm pack produced no tarball')
  writeFileSync(
    join(workDir, 'package.json'),
    JSON.stringify({ name: 'smoke', type: 'module', private: true }),
  )
  execFileSync(
    'npm',
    ['install', '--ignore-scripts', '--no-audit', '--no-fund', join(workDir, tarball)],
    { cwd: workDir, stdio: 'inherit' },
  )
  const expectations = `
    if (settlementDate('2026-11-25', { days: 2, calendar: nyse }) !== '2026-11-30')
      throw new Error('settlement date smoke test failed')
    if (dayCountFraction('2026-01-31', '2026-07-31', 'ACT/365F') !== 181 / 365)
      throw new Error('day count smoke test failed')
    if (accrue({ notional: 1000000n, rate: '5%', start: '2026-01-01', end: '2027-01-01', convention: 'ACT/365F' }) !== 50000n)
      throw new Error('accrual smoke test failed')
  `
  const imports = 'settlementDate, dayCountFraction, accrue, nyse'
  writeFileSync(
    join(workDir, 'smoke.mjs'),
    `import { ${imports} } from 'bizdate'\n${expectations}\nconsole.log('bizdate ESM smoke test passed on', typeof Bun === 'undefined' ? process.version : 'bun ' + Bun.version)`,
  )
  // The package ships CommonJS as well, so the packed artifact is required too.
  writeFileSync(
    join(workDir, 'smoke.cjs'),
    `const { ${imports} } = require('bizdate')\n${expectations}\nconsole.log('bizdate CommonJS smoke test passed on', process.version)`,
  )
  // Run under Node explicitly (when this script runs under bun, process.execPath is bun),
  // then under Bun when available, so both claimed runtimes execute the packed artifact.
  execFileSync('node', ['smoke.mjs'], { cwd: workDir, stdio: 'inherit' })
  execFileSync('node', ['smoke.cjs'], { cwd: workDir, stdio: 'inherit' })
  try {
    execFileSync('bun', ['smoke.mjs'], { cwd: workDir, stdio: 'inherit' })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    console.log('bun not found on PATH; skipped Bun smoke run')
  }
} finally {
  rmSync(workDir, { recursive: true, force: true })
}
