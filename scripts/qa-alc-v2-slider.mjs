#!/usr/bin/env node
/** Verify the Warp Drive II flow slider now spans up to 10x. */
import { chromium } from 'playwright'

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-webgl', '--enable-webgl2', '--use-gl=angle', '--use-angle=swiftshader'],
})
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } })
await ctx.addInitScript(() => { localStorage.setItem('st-intro-seen', 'yes') })
const page = await ctx.newPage()

await page.goto('http://localhost:5176/spacetime', { waitUntil: 'load', timeout: 15000 })
await page.waitForTimeout(2000)
await page.click('#spacetime-app [data-view="alcubierreV2"]', { force: true })
await page.waitForTimeout(2500)

const { min, max, val } = await page.evaluate(() => {
  const el = document.getElementById('sp2-alcubierre-v2-speed')
  return { min: el.min, max: el.max, val: el.value }
})
console.log(`slider range: min=${min} max=${max} initial=${val}`)

const slider = page.locator('#sp2-alcubierre-v2-speed')
await slider.fill('1000')
await page.waitForTimeout(1000)
const label = await page.locator('#sp2-alcubierre-v2-speed-label').textContent()
console.log(`at max, label = ${label}`)
await page.screenshot({ path: '/tmp/qa-alc-v2-10x.png' })

await browser.close()
if (max !== '1000' || label.trim() !== '10.0x') {
  console.error('unexpected slider state')
  process.exit(1)
}
console.log('OK — slider reaches 10x')
