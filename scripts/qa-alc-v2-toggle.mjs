#!/usr/bin/env node
/** Verify Warp Drive II particle toggle turns the flow off and back on. */
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
await page.click('#spacetime-app [data-view="alcubierreV2"]', { force: true })
await page.waitForTimeout(2500)
await page.screenshot({ path: '/tmp/qa-alc-v2-particles-on.png' })

let fails = 0
const readState = async () =>
  await page.getAttribute('#sp2-alcubierre-v2-particles', 'aria-pressed')
const assertState = async (tag, want) => {
  const got = await readState()
  const ok = got === want
  console.log(`${ok ? 'OK' : 'FAIL'}  ${tag.padEnd(32)} aria-pressed=${got}  (want ${want})`)
  if (!ok) fails++
}

await assertState('initial', 'true')

// Fresh view — first click
await page.click('#sp2-alcubierre-v2-particles')
await page.waitForTimeout(500)
await assertState('click 1 (fresh)', 'false')

await page.click('#sp2-alcubierre-v2-particles')
await page.waitForTimeout(500)
await assertState('click 2 (fresh)', 'true')

// REGRESSION: switch views and back, then click.
// Old bug: each init() re-attached the click listener, so on the 2nd visit
// one click fired twice and net-cancelled.
for (const other of ['blackhole', 'alcubierre', 'lensing']) {
  await page.click(`#spacetime-app [data-view="${other}"]`, { force: true })
  await page.waitForTimeout(800)
  await page.click('#spacetime-app [data-view="alcubierreV2"]', { force: true })
  await page.waitForTimeout(1200)

  const before = await readState()
  await page.click('#sp2-alcubierre-v2-particles')
  await page.waitForTimeout(400)
  const after = await readState()
  const ok = before !== after
  console.log(`${ok ? 'OK' : 'FAIL'}  after round-trip via ${other.padEnd(10)} ${before} -> ${after}`)
  if (!ok) fails++
}

await browser.close()
if (fails > 0) { console.error(`\n${fails} failure(s)`); process.exit(1) }
console.log('\nAll toggle checks passed.')
