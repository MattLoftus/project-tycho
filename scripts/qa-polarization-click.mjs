#!/usr/bin/env node
/** Verify polarization mode buttons are ACTUALLY clickable (no force). */
import { chromium } from 'playwright'

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-webgl', '--enable-webgl2', '--use-gl=angle', '--use-angle=swiftshader'],
})
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } })
await ctx.addInitScript(() => { localStorage.setItem('st-intro-seen', 'yes') })
const page = await ctx.newPage()
page.on('pageerror', e => console.error('PAGEERR:', e.message))

await page.goto('http://localhost:5176/spacetime', { waitUntil: 'load', timeout: 15000 })
await page.waitForTimeout(2000)
await page.click('#spacetime-app [data-view="polarization"]', { force: true })
await page.waitForTimeout(2000)

let fails = 0
for (const mode of ['cross', 'both', 'plus']) {
  // NO force — test real pointer-events routing
  try {
    await page.click(`#sp2-polarization-modes .mode-btn[data-mode="${mode}"]`, { timeout: 2000 })
  } catch (e) {
    console.log(`FAIL ${mode}: ${e.message.split('\n')[0]}`)
    fails++
    continue
  }
  await page.waitForTimeout(400)
  const active = await page.evaluate(() =>
    document.querySelector('#sp2-polarization-modes .mode-btn.active')?.dataset.mode)
  const ok = active === mode
  console.log(`${ok ? 'OK' : 'FAIL'}  click ${mode} → active=${active}`)
  if (!ok) fails++
}

await browser.close()
if (fails > 0) { console.error(`\n${fails} failure(s)`); process.exit(1) }
console.log('\nAll polarization click checks passed.')
