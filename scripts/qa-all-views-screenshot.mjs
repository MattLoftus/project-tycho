#!/usr/bin/env node
/**
 * Screenshot every view in surface and ocean sections for centering review.
 * Writes to /tmp/qa-views/{section}-{view}.png
 */
import { chromium } from 'playwright'
import fs from 'fs'

const OUT = '/tmp/qa-views'
fs.mkdirSync(OUT, { recursive: true })

const SURFACE_VIEWS = [
  'grandcanyonv2', 'everestv2', 'yosemite', 'craterlake', 'hawaii', 'patagonia',
  'fjords', 'dolomites', 'matterhorn', 'iceland', 'zhangjiajie', 'deadsea',
  'santorini', 'borabora', 'namibia', 'fuji', 'cappadocia',
  'grandcanyon', 'himalayas', 'kilimanjaro', 'sognefjord',
  'valles', 'olympus', 'hellas',
  'procedural', 'glacial', 'volcanicSurface',
]

const OCEAN_VIEWS = [
  'mariana', 'hawaiian', 'philippine', 'midatlantic', 'puertorico', 'java',
  'tonga', 'cayman', 'titanic', 'southsandwich',
  'reef',
  'procedural', 'abyssal', 'volcanic', 'shelf', 'hydrothermal', 'arctic',
]

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-webgl', '--enable-webgl2', '--use-gl=angle', '--use-angle=swiftshader'],
})
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } })
const page = await ctx.newPage()
page.on('pageerror', e => console.error('PAGEERR:', e.message))

// Directly invoke the button's click via JS — bypasses collapsed nav groups.
async function switchTo(container, view) {
  await page.evaluate(({ container, view }) => {
    const btn = document.querySelector(`${container} .view-btn[data-view="${view}"]`)
    if (btn) btn.click()
  }, { container, view })
}

async function waitActive(container, view, maxMs = 30000) {
  const t0 = Date.now()
  while (Date.now() - t0 < maxMs) {
    const ready = await page.evaluate(({ container, view }) => {
      const btn = document.querySelector(`${container} .view-btn[data-view="${view}"]`)
      if (!btn) return false
      return btn.classList.contains('active') && !btn.disabled
    }, { container, view })
    if (ready) { await page.waitForTimeout(500); return true }
    await page.waitForTimeout(250)
  }
  return false
}

async function capture(path, container, views) {
  await page.goto('http://localhost:5176' + path, { waitUntil: 'load', timeout: 20000 })
  await page.waitForTimeout(1000)
  for (const v of views) {
    await switchTo(container, v)
    const ok = await waitActive(container, v)
    const file = `${OUT}/${path.slice(1)}-${v}.png`
    await page.screenshot({ path: file })
    console.log(`${ok ? '✓' : '⚠'} ${path} ${v}`)
  }
}

console.log('--- SURFACE ---')
await capture('/surface', '#surface-app', SURFACE_VIEWS)

console.log('--- OCEAN ---')
await capture('/ocean', '#ocean-app', OCEAN_VIEWS)

await browser.close()
console.log(`\nScreenshots → ${OUT}`)
