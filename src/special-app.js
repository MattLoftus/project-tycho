import * as THREE from 'three'
import { createPyramidView } from './scenes/pyramid-view.js'
import { createTitanicView } from './scenes/titanic-view.js'
import { createCellView } from './scenes/cell-view.js'
import { createPompeiiView } from './scenes/pompeii-view.js'
import { createChernobylView } from './scenes/chernobyl-view.js'
import { createDNAView } from './scenes/dna-view.js'
import { createSaturnVView } from './scenes/saturn5-view.js'
import { createPangaeaView } from './scenes/pangaea-view.js'
import { createColliderView } from './scenes/collider-view.js'

let _renderer = null
let active = false
let initialized = false
let activeViewName = null
let activeView = null

// View factories — lazy-created on first switch
const viewFactories = {
  pyramid: createPyramidView,
  titanic: createTitanicView,
  cell: createCellView,
  pompeii: createPompeiiView,
  chernobyl: createChernobylView,
  dna: createDNAView,
  saturn5: createSaturnVView,
  pangaea: createPangaeaView,
  collider: createColliderView,
}
const viewInstances = {}

// Theme classes applied to #special-app
const viewThemes = {
  pyramid: 'theme-pyramid',
  titanic: 'theme-titanic',
  cell: 'theme-cell',
  pompeii: 'theme-pompeii',
  chernobyl: 'theme-chernobyl',
  dna: 'theme-dna',
  saturn5: 'theme-saturn5',
  pangaea: 'theme-pangaea',
  collider: 'theme-collider',
}

// Raycasting
const raycaster    = new THREE.Raycaster()
const mouse        = new THREE.Vector2()
let   clickTargets = []
let   lastCamera   = null

function updateClickTargets() {
  clickTargets = activeView?.getClickTargets?.() ?? []
}

function onCanvasClick(e) {
  if (!active || !clickTargets.length || !lastCamera) return
  mouse.x = (e.clientX / window.innerWidth)  *  2 - 1
  mouse.y = (e.clientY / window.innerHeight) * -2 + 1
  raycaster.setFromCamera(mouse, lastCamera)
  const hits = raycaster.intersectObjects(clickTargets, false)
  if (hits.length > 0) {
    const ud = hits[0].object.userData
    if (ud.featureKey && activeView.focusFeature) {
      activeView.focusFeature(ud.featureKey)
    } else if (ud.feature) {
      activeView.showFeatureDetail?.(ud.feature)
    }
  }
}

async function switchView(name) {
  if (name === activeViewName) return

  // Dispose current view
  if (activeView) {
    activeView.dispose()
    activeView = null
  }

  activeViewName = name

  // Get or create instance
  if (!viewInstances[name]) {
    viewInstances[name] = viewFactories[name]()
  }
  activeView = viewInstances[name]

  // Apply theme
  const app = document.getElementById('special-app')
  Object.values(viewThemes).forEach(cls => app.classList.remove(cls))
  app.classList.add(viewThemes[name])

  // Show/hide view-specific HUD sections
  document.querySelectorAll('#special-app .sp2-view-hud').forEach(el => {
    el.style.display = el.dataset.view === name ? '' : 'none'
  })

  // Hide detail panel on view switch
  document.getElementById('sp2-detail')?.classList.add('hidden')

  // Update nav buttons
  document.querySelectorAll('#special-app .sp2-view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === name)
  })

  // Init the view
  await activeView.init(_renderer)
  updateClickTargets()
}

function bindPyramidControls() {
  // Mode toggle buttons
  document.querySelectorAll('#special-app .mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode
      document.querySelectorAll('#special-app .mode-btn').forEach(b =>
        b.classList.toggle('active', b === btn))
      activeView?.setMode?.(mode)
    })
  })

  // Close detail panel
  document.getElementById('sp2-close-detail')?.addEventListener('click', () =>
    document.getElementById('sp2-detail').classList.add('hidden'))

  // Click outside detail to close (but not from feature nav)
  document.getElementById('sp2-hud')?.addEventListener('click', (e) => {
    const panel = document.getElementById('sp2-detail')
    const nav = document.getElementById('sp2-feature-nav')
    if (panel && !panel.classList.contains('hidden') && !panel.contains(e.target) && !(nav && nav.contains(e.target)))
      panel.classList.add('hidden')
  })

  // Feature navigation panel — fly to clicked feature
  document.querySelectorAll('#special-app .sp2-feature-item').forEach(item => {
    item.addEventListener('click', () => {
      const key = item.dataset.feature
      if (!key) return
      // Switch mode toggle to interior
      document.querySelectorAll('#special-app .mode-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.mode === 'interior'))
      if (activeView.focusFeature) {
        activeView.focusFeature(key)
      } else if (activeView.flyTo) {
        activeView.flyTo(key)
        activeView.showFeatureDetailByKey?.(key)
      }
      // Highlight active item
      document.querySelectorAll('#special-app .sp2-feature-item').forEach(i =>
        i.classList.toggle('active', i === item))
    })
  })
}

export async function init(renderer) {
  _renderer = renderer
  active = true

  if (!initialized) {
    // View switcher nav
    document.querySelectorAll('#special-app .sp2-view-btn').forEach(btn => {
      btn.addEventListener('click', () => switchView(btn.dataset.view))
    })

    // Collapsible view nav
    const spNav = document.getElementById('sp2-view-nav')
    const spCollapse = document.getElementById('sp2-nav-collapse')
    const spExpand = document.getElementById('sp2-nav-expand')
    if (spNav && spCollapse && spExpand) {
      spCollapse.addEventListener('click', () => {
        spNav.classList.add('collapsed')
        spExpand.classList.add('visible')
      })
      spExpand.addEventListener('click', () => {
        spNav.classList.remove('collapsed')
        spExpand.classList.remove('visible')
      })
      if (window.matchMedia('(max-width: 768px)').matches) {
        spNav.classList.add('collapsed')
        spExpand.classList.add('visible')
      }
    }

    bindPyramidControls()
    _renderer.domElement.addEventListener('click', onCanvasClick)
    initialized = true
  }

  // Default to pyramid
  await switchView(activeViewName || 'pyramid')
}

export function dispose() {
  active = false
  if (activeView) {
    activeView.dispose()
    // Clear instance so it re-inits next time
    if (activeViewName) {
      delete viewInstances[activeViewName]
    }
  }
  activeView = null
  activeViewName = null
  clickTargets = []
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
