import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']})
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })
await ctx.addInitScript(() => { localStorage.setItem('st-intro-seen', 'yes') })
const page = await ctx.newPage()
await page.goto('http://localhost:5176/', { waitUntil: 'load', timeout: 15000 })
await page.waitForTimeout(2500)
await page.click('[data-app="spacetime"]', { force: true })
await page.waitForTimeout(2500)
await page.click('#spacetime-app [data-view="lifeBinary"]', { force: true })
await page.waitForTimeout(3000)

// Same selector the interactive script uses
await page.click('[data-chapter="3"]', { force: true })
await page.waitForTimeout(2500)

const st = await page.evaluate(() => ({
  label: document.getElementById('sp2-lifebinary-chapter-label')?.textContent,
  phase: document.getElementById('sp2-lifebinary-phase')?.textContent,
  progress: document.getElementById('sp2-lifebinary-progress-fill')?.style.width,
}))
console.log('State:', JSON.stringify(st))
await page.screenshot({ path: '/tmp/qa-life-ring-test.png' })
await browser.close()
