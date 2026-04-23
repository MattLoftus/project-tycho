#!/usr/bin/env node
/** Side-profile shot of Warp Drive II to verify blueshift/redshift grid. */
import { chromium } from 'playwright'

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-webgl', '--enable-webgl2', '--use-gl=angle', '--use-angle=swiftshader'],
})
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })
await ctx.addInitScript(() => { localStorage.setItem('st-intro-seen', 'yes') })
const page = await ctx.newPage()
page.on('pageerror', e => console.error('PAGEERR:', e.message))
page.on('console', m => { if (m.type() === 'error') console.error('CONSOLEERR:', m.text()) })

await page.goto('http://localhost:5176/', { waitUntil: 'load', timeout: 15000 })
await page.waitForTimeout(2500)

await page.click('[data-app="spacetime"]', { force: true })
await page.waitForTimeout(1500)

await page.click('#spacetime-app [data-view="alcubierreV2"]', { force: true })
await page.waitForTimeout(2500)

// Orbit camera down and around for a clean side profile
// Default cam is (11, 4.2, 10). We want to look at origin from +Z direction.
async function drag(x1, y1, x2, y2, steps = 15) {
  await page.mouse.move(x1, y1)
  await page.mouse.down()
  await page.mouse.move(x2, y2, { steps })
  await page.mouse.up()
  await page.waitForTimeout(600)
}

// Drag to get a side view (orbit camera around Y axis)
await drag(900, 450, 300, 450, 20)
await page.waitForTimeout(800)
await page.screenshot({ path: '/tmp/qa-alc-v2-side1.png' })
console.log('OK: side 1')

// Another drag to fine-tune
await drag(800, 450, 650, 460, 10)
await page.waitForTimeout(800)
await page.screenshot({ path: '/tmp/qa-alc-v2-side2.png' })
console.log('OK: side 2')

// Head-on from the rear
await drag(800, 450, 200, 450, 25)
await page.waitForTimeout(800)
await page.screenshot({ path: '/tmp/qa-alc-v2-rear.png' })
console.log('OK: from rear')

await browser.close()
