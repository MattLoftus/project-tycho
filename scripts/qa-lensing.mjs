#!/usr/bin/env node
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
await page.waitForTimeout(2500)
await page.click('#spacetime-app [data-view="lensing"]', { force: true })
await page.waitForTimeout(3000)
await page.screenshot({ path: '/tmp/qa-lensing-default.png' })
console.log('OK default')

// Zoom in with scroll wheel (moves camera closer)
const canvas = await page.locator('canvas').first()
const box = await canvas.boundingBox()
for (let i = 0; i < 10; i++) {
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, -200)
  await page.waitForTimeout(100)
}
await page.waitForTimeout(1000)
await page.screenshot({ path: '/tmp/qa-lensing-zoomed.png' })
console.log('OK zoomed')

// Push slider to max
const slider = page.locator('#sp2-lensing-strength')
await slider.fill('500')
await page.waitForTimeout(1500)
await page.screenshot({ path: '/tmp/qa-lensing-max.png' })
console.log('OK max')

// Push slider to min
await slider.fill('10')
await page.waitForTimeout(1500)
await page.screenshot({ path: '/tmp/qa-lensing-weak.png' })
console.log('OK weak')

await browser.close()
