#!/usr/bin/env node
/**
 * QA sweep for all spacetime views — screenshot each after dismissing the intro.
 * Uses Playwright+SwiftShader. Some dynamic-grid views may time out (expected).
 */
import { chromium } from 'playwright'

const VIEWS = [
  'lifeBinary',
  'blackhole',
  'binarySystem',
  'alcubierre',
  'lensing',
  'inspiral',
  'frameDrag',
  'polarization',
]

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-webgl', '--enable-webgl2', '--use-gl=angle', '--use-angle=swiftshader'],
})
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })

// Pre-set localStorage so the intro overlay is skipped for all pages
await ctx.addInitScript(() => {
  localStorage.setItem('st-intro-seen', 'yes')
})

const page = await ctx.newPage()
page.on('pageerror', e => console.error('PAGEERR:', e.message))
page.on('console', m => { if (m.type() === 'error') console.error('CONSOLEERR:', m.text()) })

await page.goto('http://localhost:5176/', { waitUntil: 'load', timeout: 15000 })
await page.waitForTimeout(2500)

// Click Spacetime tab
await page.click('[data-app="spacetime"]', { force: true })
await page.waitForTimeout(2500)

for (const view of VIEWS) {
  try {
    await page.click(`#spacetime-app [data-view="${view}"]`, { force: true, timeout: 3000 })
    await page.waitForTimeout(3000)
    const out = `/tmp/qa-${view}.png`
    await page.screenshot({ path: out, timeout: 20000 })
    console.log(`OK: ${view} → ${out}`)
  } catch (e) {
    console.log(`FAIL: ${view} — ${e.message.split('\n')[0]}`)
  }
}

await browser.close()
