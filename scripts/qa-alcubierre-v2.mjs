#!/usr/bin/env node
/** QA the new Warp Drive II view. Also verifies BLACK HOLE is the default. */
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

// Go to Spacetime tab. Default landing view should now be BLACK HOLE.
await page.click('[data-app="spacetime"]', { force: true })
await page.waitForTimeout(2500)

const defaultActive = await page.evaluate(() => {
  const btn = document.querySelector('#spacetime-app .st-view-btn.active')
  return btn?.dataset.view
})
console.log('Default Spacetime view:', defaultActive)
await page.screenshot({ path: '/tmp/qa-spacetime-default.png' })

// Switch to Warp Drive V2
await page.click('#spacetime-app [data-view="alcubierreV2"]', { force: true })
await page.waitForTimeout(3500)
await page.screenshot({ path: '/tmp/qa-alcubierre-v2-01.png' })
console.log('OK: warp drive v2 initial')

// Try the flow slider
const slider = page.locator('#sp2-alcubierre-v2-speed')
if (await slider.count() > 0) {
  await slider.fill('250')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: '/tmp/qa-alcubierre-v2-fast.png' })
  console.log('OK: flow 2.5x')
}

// Camera orbit — drag camera to look down the conduit
await page.mouse.move(800, 450)
await page.mouse.down()
await page.mouse.move(400, 500, { steps: 10 })
await page.mouse.up()
await page.waitForTimeout(1200)
await page.screenshot({ path: '/tmp/qa-alcubierre-v2-pan.png' })
console.log('OK: rotated camera')

await browser.close()
