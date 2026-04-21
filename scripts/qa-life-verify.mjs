#!/usr/bin/env node
import { chromium } from 'playwright'

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader'],
})
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })
await ctx.addInitScript(() => { localStorage.setItem('st-intro-seen', 'yes') })
const page = await ctx.newPage()

await page.goto('http://localhost:5176/', { waitUntil: 'load', timeout: 15000 })
await page.waitForTimeout(2500)
await page.click('[data-app="spacetime"]', { force: true })
await page.waitForTimeout(2500)
await page.click('#spacetime-app [data-view="lifeBinary"]', { force: true })
await page.waitForTimeout(3000)

// Click chapter 4 (SETTLED - should show single remnant)
await page.evaluate(() => {
  document.querySelector('#sp2-lifebinary-chapters .chapter-btn[data-chapter="4"]').click()
})
await page.waitForTimeout(3500)

// Report what's visible in the 3D scene
const sceneState = await page.evaluate(() => {
  // We can't easily introspect Three.js scene from outside... but we can check DOM
  return {
    label: document.getElementById('sp2-lifebinary-chapter-label')?.textContent,
    phase: document.getElementById('sp2-lifebinary-phase')?.textContent,
    progress: document.getElementById('sp2-lifebinary-progress-fill')?.style.width,
  }
})
console.log('State after skip to SETTLED:', JSON.stringify(sceneState))

await page.screenshot({ path: '/tmp/qa-life-settled-fresh.png' })

await browser.close()
