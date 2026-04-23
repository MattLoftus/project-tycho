#!/usr/bin/env node
/** Verify that a page refresh on a non-default route doesn't leak the
 *  default app's UI. Regression test for the /spacetime-refresh bug. */
import { chromium } from 'playwright'

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-webgl', '--enable-webgl2', '--use-gl=angle', '--use-angle=swiftshader'],
})
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } })
await ctx.addInitScript(() => { localStorage.setItem('st-intro-seen', 'yes') })
const page = await ctx.newPage()
page.on('pageerror', e => console.error('PAGEERR:', e.message))

let fails = 0
const BASE = 'http://localhost:5176'

for (const route of ['/spacetime', '/ocean', '/surface', '/special']) {
  await page.goto(BASE + route, { waitUntil: 'load', timeout: 15000 })
  await page.waitForTimeout(1200)
  const state = await page.evaluate(() => {
    const visible = {}
    for (const id of ['space-app', 'surface-app', 'ocean-app', 'spacetime-app', 'special-app']) {
      const el = document.getElementById(id)
      if (!el) continue
      const s = getComputedStyle(el)
      visible[id] = s.display !== 'none'
    }
    return visible
  })
  const visibleIds = Object.entries(state).filter(([, v]) => v).map(([k]) => k)
  const expectId = route.replace(/^\//, '') + '-app'
  const ok = visibleIds.length === 1 && visibleIds[0] === expectId
  console.log(`${ok ? 'OK' : 'FAIL'}  ${route.padEnd(12)} visible=[${visibleIds.join(', ')}]`)
  if (!ok) fails++
  await page.screenshot({ path: `/tmp/qa-refresh-${route.slice(1)}.png` })
}

await browser.close()
if (fails > 0) { console.error(`\n${fails} failure(s)`); process.exit(1) }
console.log('\nAll refresh checks passed.')
