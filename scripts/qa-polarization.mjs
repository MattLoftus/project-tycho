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
page.on('console', m => { if (m.type() === 'error') console.error('CONSOLEERR:', m.text()) })

await page.goto('http://localhost:5176/spacetime', { waitUntil: 'load', timeout: 15000 })
await page.waitForTimeout(2500)
await page.click('#spacetime-app [data-view="polarization"]', { force: true })
await page.waitForTimeout(3000)
await page.screenshot({ path: '/tmp/qa-polarization-default.png' })

// try any sliders
const sliders = await page.locator('#spacetime-app .st-view-hud[data-view="polarization"] input[type="range"]').all()
console.log('sliders:', sliders.length)
for (let i = 0; i < sliders.length; i++) {
  const id = await sliders[i].getAttribute('id')
  const min = await sliders[i].getAttribute('min')
  const max = await sliders[i].getAttribute('max')
  const val = await sliders[i].inputValue()
  console.log(`  ${id} range=[${min},${max}] val=${val}`)
}

// Try dragging camera
await page.mouse.move(800, 450)
await page.mouse.down()
await page.mouse.move(400, 500, { steps: 10 })
await page.mouse.up()
await page.waitForTimeout(1000)
await page.screenshot({ path: '/tmp/qa-polarization-rotated.png' })

// Cycle mode buttons
for (const mode of ['cross', 'both', 'plus']) {
  await page.click(`#sp2-polarization-modes .mode-btn[data-mode="${mode}"]`, { force: true })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `/tmp/qa-polarization-${mode}.png` })
  console.log('OK', mode)
}

await browser.close()
