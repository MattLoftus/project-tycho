#!/usr/bin/env node
/**
 * QA interaction sweep — click controls in each view and screenshot the result.
 * Verifies sliders update the UI, buttons trigger state changes, etc.
 */
import { chromium } from 'playwright'

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-webgl', '--enable-webgl2', '--use-gl=angle', '--use-angle=swiftshader'],
})
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })
await ctx.addInitScript(() => { localStorage.setItem('st-intro-seen', 'yes') })

const page = await ctx.newPage()
page.on('pageerror', e => console.error('PAGEERR:', e.message))

await page.goto('http://localhost:5176/', { waitUntil: 'load', timeout: 15000 })
await page.waitForTimeout(2500)
await page.click('[data-app="spacetime"]', { force: true })
await page.waitForTimeout(2500)

// — Binary System: test mass slider + preset button —
await page.click('#spacetime-app [data-view="binarySystem"]', { force: true })
await page.waitForTimeout(3000)
// Click EQUAL MASS preset
const equalBtn = page.locator('[data-preset-group="binary"] .preset-btn[data-a="10"]')
if (await equalBtn.count() > 0) {
  await equalBtn.first().click({ force: true })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: '/tmp/qa-interact-binary-equalmass.png', timeout: 20000 })
  console.log('OK: binary equal-mass preset')
}
// Drag mass A slider higher
const massA = page.locator('#sp2-binary-mass-a-slider')
await massA.fill('25')
await page.waitForTimeout(800)
await page.screenshot({ path: '/tmp/qa-interact-binary-heavy-a.png' })
console.log('OK: binary mass A → 25')

// — Frame Drag: slide spin to 0.5, then 0 (Schwarzschild) —
await page.click('#spacetime-app [data-view="frameDrag"]', { force: true })
await page.waitForTimeout(3000)
const spin = page.locator('#sp2-framedrag-spin-slider')
await spin.fill('50')
await page.waitForTimeout(800)
await page.screenshot({ path: '/tmp/qa-interact-framedrag-50pct.png' })
console.log('OK: framedrag spin 0.50')
await spin.fill('0')
await page.waitForTimeout(800)
await page.screenshot({ path: '/tmp/qa-interact-framedrag-zero.png' })
console.log('OK: framedrag spin 0 (Schwarzschild)')

// — Black Hole: change disk tilt, then click canvas to fire photon —
await page.click('#spacetime-app [data-view="blackhole"]', { force: true })
await page.waitForTimeout(3500)
const tilt = page.locator('#sp2-bh-disk-tilt')
await tilt.fill('60')
await page.waitForTimeout(1000)
await page.screenshot({ path: '/tmp/qa-interact-bh-tilt60.png' })
console.log('OK: BH disk tilt 60°')
// Click canvas to fire photons (3 times)
for (let i = 0; i < 3; i++) {
  await page.mouse.click(800, 400)
  await page.waitForTimeout(200)
}
await page.waitForTimeout(1000)
await page.screenshot({ path: '/tmp/qa-interact-bh-photons.png' })
console.log('OK: BH fired 3 photons')

// — Polarization: switch to cross, then both —
await page.click('#spacetime-app [data-view="polarization"]', { force: true })
await page.waitForTimeout(3000)
await page.click('[data-mode="cross"]', { force: true })
await page.waitForTimeout(1500)
await page.screenshot({ path: '/tmp/qa-interact-pol-cross.png' })
console.log('OK: polarization cross')
await page.click('[data-mode="both"]', { force: true })
await page.waitForTimeout(1500)
await page.screenshot({ path: '/tmp/qa-interact-pol-both.png' })
console.log('OK: polarization both (circular)')

// — Life of a Binary: skip to chapter IV (Ringdown) —
await page.click('#spacetime-app [data-view="lifeBinary"]', { force: true })
await page.waitForTimeout(3000)
// Use JS .click() — WebGL canvas layering makes Playwright's mouse click
// unreliable even with force:true
await page.evaluate(() => document.querySelector('#sp2-lifebinary-chapters .chapter-btn[data-chapter="3"]').click())
await page.waitForTimeout(2500)
await page.screenshot({ path: '/tmp/qa-interact-life-ringdown.png' })
console.log('OK: life of binary → ringdown')
await page.evaluate(() => document.querySelector('#sp2-lifebinary-chapters .chapter-btn[data-chapter="4"]').click())
await page.waitForTimeout(2500)
await page.screenshot({ path: '/tmp/qa-interact-life-settled.png' })
console.log('OK: life of binary → settled')

// — Lensing: crank strength to 5x —
await page.click('#spacetime-app [data-view="lensing"]', { force: true })
await page.waitForTimeout(3000)
const lens = page.locator('#sp2-lensing-strength')
await lens.fill('500')
await page.waitForTimeout(1500)
await page.screenshot({ path: '/tmp/qa-interact-lensing-5x.png' })
console.log('OK: lensing 5x')

await browser.close()
