#!/usr/bin/env node
/**
 * Headless screenshot utility for Project Tycho.
 *
 * Usage:
 *   node scripts/screenshot.mjs [options]
 *
 * Options:
 *   --url        Page URL             (default: http://localhost:5176)
 *   --out        Output PNG path      (default: /tmp/tycho-screenshot.png)
 *   --width      Viewport width       (default: 1920)
 *   --height     Viewport height      (default: 1080)
 *   --wait       Wait ms after load   (default: 4000)
 *   --click      CSS selectors to click, comma-separated (executed in order)
 *   --clickwait  Wait ms after each click (default: 2000)
 *   --full       Full-page screenshot (default: false)
 *
 * Examples:
 *   # Screenshot the default space sim
 *   node scripts/screenshot.mjs
 *
 *   # Navigate to special tab, then pyramid view
 *   node scripts/screenshot.mjs --click '[data-app="special"]'
 *
 *   # Navigate to special > cell view
 *   node scripts/screenshot.mjs --click '[data-app="special"],[data-view="cell"]'
 *
 *   # Custom viewport (mobile)
 *   node scripts/screenshot.mjs --width 390 --height 844
 */

import { chromium } from 'playwright'

// ─── Parse args ──────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2)
  const opts = {
    url: 'http://localhost:5176',
    out: '/tmp/tycho-screenshot.png',
    width: 1920,
    height: 1080,
    wait: 4000,
    click: '',
    clickwait: 2000,
    full: false,
  }

  for (let i = 0; i < args.length; i++) {
    const key = args[i].replace(/^--/, '')
    if (key === 'full') {
      opts.full = true
      continue
    }
    const val = args[++i]
    if (key in opts) {
      opts[key] = ['width', 'height', 'wait', 'clickwait'].includes(key)
        ? parseInt(val, 10)
        : val
    }
  }
  return opts
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs()

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--enable-webgl',
      '--enable-webgl2',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-features=Vulkan',
    ],
  })
  const context = await browser.newContext({
    viewport: { width: opts.width, height: opts.height },
    deviceScaleFactor: 2, // retina-quality screenshots
  })
  const page = await context.newPage()

  // Log errors for debugging
  page.on('pageerror', e => console.error('PAGE ERROR:', e.message))
  page.on('console', msg => {
    if (msg.type() === 'error') console.error('CONSOLE:', msg.text())
  })

  try {
    await page.goto(opts.url, { waitUntil: 'networkidle', timeout: 15000 })
  } catch {
    // networkidle can be flaky with animation loops — fall back to load
    await page.goto(opts.url, { waitUntil: 'load', timeout: 15000 })
  }

  // Wait for Three.js to render
  await page.waitForTimeout(opts.wait)

  // Execute click sequence if provided
  if (opts.click) {
    const selectors = opts.click.split(',').map(s => s.trim()).filter(Boolean)
    for (const sel of selectors) {
      try {
        await page.click(sel, { timeout: 5000, force: true })
        await page.waitForTimeout(opts.clickwait)
      } catch (e) {
        console.error(`Warning: click "${sel}" failed: ${e.message}`)
      }
    }
  }

  // Take screenshot
  await page.screenshot({
    path: opts.out,
    fullPage: opts.full,
    timeout: 60000,
  })

  await browser.close()
  console.log(opts.out)
}

main().catch(e => {
  console.error(e.message)
  process.exit(1)
})
