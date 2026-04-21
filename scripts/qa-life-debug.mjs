#!/usr/bin/env node
/** Debug why chapter skip isn't working */
import { chromium } from 'playwright'

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-webgl', '--enable-webgl2', '--use-gl=angle', '--use-angle=swiftshader'],
})
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })
await ctx.addInitScript(() => { localStorage.setItem('st-intro-seen', 'yes') })
const page = await ctx.newPage()
page.on('pageerror', e => console.error('PAGEERR:', e.message))
page.on('console', m => { console.log('CONSOLE[' + m.type() + ']:', m.text()) })

await page.goto('http://localhost:5176/', { waitUntil: 'load', timeout: 15000 })
await page.waitForTimeout(2500)
await page.click('[data-app="spacetime"]', { force: true })
await page.waitForTimeout(2500)

await page.click('#spacetime-app [data-view="lifeBinary"]', { force: true })
await page.waitForTimeout(3000)

// Check initial state
let st = await page.evaluate(() => ({
  label: document.getElementById('sp2-lifebinary-chapter-label')?.textContent,
  phase: document.getElementById('sp2-lifebinary-phase')?.textContent,
  active: [...document.querySelectorAll('#sp2-lifebinary-chapters .chapter-btn.active')].map(b => b.dataset.chapter),
}))
console.log('BEFORE click:', JSON.stringify(st))

// Click chapter 3 button directly via DOM
const clicked = await page.evaluate(() => {
  const btn = document.querySelector('#sp2-lifebinary-chapters .chapter-btn[data-chapter="3"]')
  if (!btn) return 'BUTTON NOT FOUND'
  btn.click()
  return 'clicked: ' + btn.textContent.trim()
})
console.log('Click result:', clicked)

await page.waitForTimeout(1500)

st = await page.evaluate(() => ({
  label: document.getElementById('sp2-lifebinary-chapter-label')?.textContent,
  phase: document.getElementById('sp2-lifebinary-phase')?.textContent,
  active: [...document.querySelectorAll('#sp2-lifebinary-chapters .chapter-btn.active')].map(b => b.dataset.chapter),
  progressWidth: document.getElementById('sp2-lifebinary-progress-fill')?.style.width,
}))
console.log('AFTER click:', JSON.stringify(st))

await browser.close()
