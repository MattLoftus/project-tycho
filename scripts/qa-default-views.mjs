#!/usr/bin/env node
/** Verify Surface and Ocean default to their new "cool" landing views. */
import { chromium } from 'playwright'

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-webgl', '--enable-webgl2', '--use-gl=angle', '--use-angle=swiftshader'],
})
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } })
const page = await ctx.newPage()
page.on('pageerror', e => console.error('PAGEERR:', e.message))
page.on('console', m => { if (m.type() === 'error') console.error('CONSOLEERR:', m.text()) })

let fails = 0
const checks = [
  { path: '/surface', container: '#surface-app', expect: 'grandcanyonv2', name: 'Grand Canyon (satellite)' },
  { path: '/ocean',   container: '#ocean-app',   expect: 'mariana',       name: 'Mariana Trench' },
]

for (const c of checks) {
  await page.goto('http://localhost:5176' + c.path, { waitUntil: 'load', timeout: 20000 })
  await page.waitForTimeout(5000)   // give the DEM fetcher time to kick in
  const active = await page.evaluate((container) =>
    document.querySelector(`${container} .view-btn.active`)?.dataset.view, c.container)
  const ok = active === c.expect
  console.log(`${ok ? 'OK' : 'FAIL'}  ${c.path.padEnd(10)} default → ${active}  (want ${c.expect} — ${c.name})`)
  if (!ok) fails++
  await page.screenshot({ path: `/tmp/qa-default-${c.path.slice(1)}.png` })

  // Also confirm nav order — SIMULATION group is the last one in THIS app
  const lastGroupLabel = await page.evaluate((container) => {
    const groups = document.querySelectorAll(`${container} .nav-group`)
    return groups[groups.length - 1]?.querySelector('.nav-group-label')?.textContent
  }, c.container)
  const ok2 = lastGroupLabel?.trim() === 'SIMULATION'
  console.log(`${ok2 ? 'OK' : 'FAIL'}  ${c.path.padEnd(10)} last nav group = ${lastGroupLabel}`)
  if (!ok2) fails++
}

await browser.close()
if (fails > 0) { console.error(`\n${fails} failure(s)`); process.exit(1) }
console.log('\nAll default-view checks passed.')
