#!/usr/bin/env node
/** Verify URL routing: each top-level section has a working URL path.
 *  Tests direct navigation, tab clicks → URL updates, and back/forward. */
import { chromium } from 'playwright'

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-webgl', '--enable-webgl2', '--use-gl=angle', '--use-angle=swiftshader'],
})
const ctx = await browser.newContext({ viewport: { width: 1400, height: 800 } })
await ctx.addInitScript(() => { localStorage.setItem('st-intro-seen', 'yes') })
const page = await ctx.newPage()
page.on('pageerror', e => console.error('PAGEERR:', e.message))

const BASE = 'http://localhost:5176'
const cases = [
  { path: '/',          expect: 'space' },
  { path: '/space',     expect: 'space' },
  { path: '/surface',   expect: 'surface' },
  { path: '/ocean',     expect: 'ocean' },
  { path: '/spacetime', expect: 'spacetime' },
  { path: '/special',   expect: 'special' },
  { path: '/bogus',     expect: 'space' },
]

let fails = 0

// 1) Direct navigation
console.log('--- DIRECT NAVIGATION ---')
for (const c of cases) {
  await page.goto(BASE + c.path, { waitUntil: 'load', timeout: 15000 })
  await page.waitForTimeout(800)
  const active = await page.evaluate(() =>
    document.querySelector('.app-switch-btn.active')?.dataset.app)
  const ok = active === c.expect
  console.log(`${ok ? 'OK' : 'FAIL'}  ${c.path.padEnd(10)} → active=${active}  (expected ${c.expect})`)
  if (!ok) fails++
}

// 2) Click-to-navigate → URL updates
console.log('--- CLICK NAVIGATION ---')
await page.goto(BASE + '/', { waitUntil: 'load', timeout: 15000 })
await page.waitForTimeout(600)
for (const target of ['surface', 'ocean', 'spacetime', 'special', 'space']) {
  await page.click(`.app-switch-btn[data-app="${target}"]`)
  await page.waitForTimeout(600)
  const url = new URL(page.url()).pathname
  const expected = target === 'space' ? '/space' : '/' + target
  const ok = url === expected
  console.log(`${ok ? 'OK' : 'FAIL'}  click ${target.padEnd(10)} → URL=${url}`)
  if (!ok) fails++
}

// 3) Back / forward
console.log('--- BACK / FORWARD ---')
await page.goto(BASE + '/', { waitUntil: 'load', timeout: 15000 })
await page.waitForTimeout(600)
await page.click('.app-switch-btn[data-app="spacetime"]')
await page.waitForTimeout(600)
await page.click('.app-switch-btn[data-app="ocean"]')
await page.waitForTimeout(600)
await page.goBack(); await page.waitForTimeout(700)
{
  const active = await page.evaluate(() =>
    document.querySelector('.app-switch-btn.active')?.dataset.app)
  const url = new URL(page.url()).pathname
  const ok = active === 'spacetime' && url === '/spacetime'
  console.log(`${ok ? 'OK' : 'FAIL'}  back  → ${url} / active=${active}`)
  if (!ok) fails++
}
await page.goForward(); await page.waitForTimeout(700)
{
  const active = await page.evaluate(() =>
    document.querySelector('.app-switch-btn.active')?.dataset.app)
  const url = new URL(page.url()).pathname
  const ok = active === 'ocean' && url === '/ocean'
  console.log(`${ok ? 'OK' : 'FAIL'}  fwd   → ${url} / active=${active}`)
  if (!ok) fails++
}

await browser.close()
if (fails > 0) { console.error(`\n${fails} failure(s)`); process.exit(1) }
console.log('\nAll route checks passed.')
