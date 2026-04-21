import * as THREE from 'three'
import { createSpacetimeView } from './special/spacetime-view.js'
import { createAlcubierreView } from './special/alcubierre-view.js'
import { createLensingView } from './special/lensing-view.js'
import { createInspiralView } from './special/inspiral-view.js'
import { createFrameDragView } from './special/framedrag-view.js'
import { createPolarizationView } from './special/polarization-view.js'
import { createLifeBinaryView } from './special/lifebinary-view.js'
import { createRedshiftView } from './special/redshift-view.js'
import * as blackholeModule from './views/blackhole.js'

let _renderer = null
let active = false
let initialized = false
let activeViewName = null
let activeView = null

// Wrap the black hole module (singleton) in the factory interface
function createBlackholeView() {
  let tiltSliderWired = false
  let clickHandler = null
  let canvas = null
  return {
    init(renderer) {
      const p = blackholeModule.init(renderer)
      // Wire the disk tilt slider on first init
      if (!tiltSliderWired) {
        const slider = document.getElementById('sp2-bh-disk-tilt')
        const label = document.getElementById('sp2-bh-disk-tilt-label')
        if (slider) {
          const apply = () => {
            const deg = parseFloat(slider.value)
            const rad = (deg / 100) * (Math.PI / 2)
            blackholeModule.setDiskTilt(rad)
            if (label) label.textContent = (deg * 0.9).toFixed(0) + '°'
          }
          slider.addEventListener('input', apply)
          apply()
          tiltSliderWired = true
        }
      }
      // Click-to-fire-photon: each click on the canvas fires a new photon
      canvas = renderer.domElement
      clickHandler = (e) => {
        // Ignore clicks on UI elements
        if (e.target !== canvas) return
        blackholeModule.firePhoton()
      }
      canvas.addEventListener('click', clickHandler)
      return p
    },
    animate() { return blackholeModule.animate() },
    resize() { blackholeModule.resize() },
    dispose() {
      if (canvas && clickHandler) canvas.removeEventListener('click', clickHandler)
      clickHandler = null
      blackholeModule.dispose()
    },
    getClickTargets() { return [] },
  }
}

const viewFactories = {
  blackhole: createBlackholeView,
  binarySystem: createSpacetimeView,
  alcubierre: createAlcubierreView,
  lensing: createLensingView,
  inspiral: createInspiralView,
  frameDrag: createFrameDragView,
  polarization: createPolarizationView,
  lifeBinary: createLifeBinaryView,
  redshift: createRedshiftView,
}
const viewInstances = {}

const viewThemes = {
  blackhole: 'theme-blackhole',
  binarySystem: 'theme-spacetime',
  alcubierre: 'theme-alcubierre',
  lensing: 'theme-lensing',
  inspiral: 'theme-inspiral',
  frameDrag: 'theme-framedrag',
  polarization: 'theme-polarization',
  lifeBinary: 'theme-lifebinary',
  redshift: 'theme-redshift',
}

let lastCamera = null

async function switchView(name) {
  if (name === activeViewName) return

  if (activeView) {
    activeView.dispose()
    activeView = null
  }

  activeViewName = name

  if (!viewInstances[name]) {
    viewInstances[name] = viewFactories[name]()
  }
  activeView = viewInstances[name]

  // Apply theme
  const app = document.getElementById('spacetime-app')
  Object.values(viewThemes).forEach(cls => app.classList.remove(cls))
  app.classList.add(viewThemes[name])

  // Show/hide view-specific HUD sections
  document.querySelectorAll('#spacetime-app .st-view-hud').forEach(el => {
    el.style.display = el.dataset.view === name ? '' : 'none'
  })

  // Update nav buttons
  document.querySelectorAll('#spacetime-app .st-view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === name)
  })

  await activeView.init(_renderer)
}

export async function init(renderer) {
  _renderer = renderer
  active = true

  if (!initialized) {
    document.querySelectorAll('#spacetime-app .st-view-btn').forEach(btn => {
      btn.addEventListener('click', () => switchView(btn.dataset.view))
    })

    // Collapsible nav
    const nav = document.getElementById('st-view-nav')
    const collapse = document.getElementById('st-nav-collapse')
    const expand = document.getElementById('st-nav-expand')
    if (nav && collapse && expand) {
      collapse.addEventListener('click', () => {
        nav.classList.add('collapsed')
        expand.classList.add('visible')
      })
      expand.addEventListener('click', () => {
        nav.classList.remove('collapsed')
        expand.classList.remove('visible')
      })
      if (window.matchMedia('(max-width: 768px)').matches) {
        nav.classList.add('collapsed')
        expand.classList.add('visible')
      }
    }

    // Metaphor caveat dismiss buttons — remember across sessions
    document.querySelectorAll('#spacetime-app .st-caveat').forEach(el => {
      const key = 'st-caveat-' + (el.dataset.caveat || 'default')
      if (localStorage.getItem(key) === 'dismissed') el.classList.add('hidden')
      const closeBtn = el.querySelector('.st-caveat-close')
      closeBtn?.addEventListener('click', () => {
        el.classList.add('hidden')
        localStorage.setItem(key, 'dismissed')
      })
    })

    // First-visit intro overlay
    const intro = document.getElementById('st-intro-overlay')
    const introBtn = document.getElementById('st-intro-btn')
    if (intro && localStorage.getItem('st-intro-seen') === 'yes') {
      intro.remove()
    } else if (intro && introBtn) {
      introBtn.addEventListener('click', () => {
        intro.style.animation = 'none'
        intro.style.transition = 'opacity 0.4s'
        intro.style.opacity = '0'
        setTimeout(() => intro.remove(), 400)
        localStorage.setItem('st-intro-seen', 'yes')
      })
    }

    initialized = true
  }

  await switchView(activeViewName || 'lifeBinary')
}

export function dispose() {
  active = false
  // Dispose the active view (only one keeps live GPU resources since
  // switchView disposes the previous view when switching). Then clear
  // all cached instances so nothing is retained when the tab closes.
  if (activeView) activeView.dispose()
  for (const name in viewInstances) delete viewInstances[name]
  activeView = null
  activeViewName = null
  lastCamera = null
}

export function animate() {
  if (!activeView) return
  const result = activeView.animate()
  if (result?.camera) lastCamera = result.camera
}

export function resize() {
  activeView?.resize()
}
