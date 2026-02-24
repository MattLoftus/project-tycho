import * as THREE from 'three'
import * as proceduralView from './surface/views/procedural.js'
import { createMarsView }  from './surface/views/mars.js'
import { createEarthView } from './surface/views/earth.js'
import { createPhotoView } from './surface/views/everest-v2.js'
import { updateHUD, showDepositDetail } from './surface/hud.js'

let _renderer = null
let active = false
let initialized = false
let activeView = null
let views = null

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
  if (hits.length > 0) showDepositDetail(hits[0].object.userData.deposit)
}

async function switchView(name) {
  document.querySelectorAll('#surface-app .view-btn').forEach(b => { b.disabled = true })

  if (activeView) activeView.dispose()
  activeView = views[name]

  await activeView.init(_renderer)

  document.querySelectorAll('#surface-app .view-btn').forEach(b => {
    b.disabled = false
    b.classList.toggle('active', b.dataset.view === name)
  })

  updateClickTargets()
}

function runLoadingAnimation() {
  const steps = [
    [20,'LOADING TERRAIN ENGINE...'], [45,'GENERATING HEIGHTMAP...'],
    [70,'PLACING RESOURCE DEPOSITS...'], [90,'CALIBRATING SENSORS...'], [100,'SYSTEM READY'],
  ]
  let idx = 0
  const bar = document.getElementById('loading-bar')
  const statusEl = document.getElementById('loading-status')
  if (!bar || !statusEl) return
  const iv = setInterval(() => {
    if (idx < steps.length) { bar.style.width = steps[idx][0]+'%'; statusEl.textContent = steps[idx][1]; idx++ }
    else clearInterval(iv)
  }, 280)
}

export function init(renderer) {
  _renderer = renderer
  active = true

  if (!initialized) {
    views = {
      procedural:  proceduralView,
      valles:      createMarsView('valles'),
      olympus:     createMarsView('olympus'),
      hellas:      createMarsView('hellas'),
      grandcanyon: createEarthView('grandcanyon'),
      himalayas:   createEarthView('himalayas'),
      everestv2:      createPhotoView('everestv2'),
      grandcanyonv2:  createPhotoView('grandcanyonv2'),
      yosemite:       createPhotoView('yosemite'),
      fjords:         createPhotoView('fjords'),
      craterlake:     createPhotoView('craterlake'),
      hawaii:         createPhotoView('hawaii'),
      patagonia:      createPhotoView('patagonia'),
      dolomites:      createPhotoView('dolomites'),
      matterhorn:     createPhotoView('matterhorn'),
      iceland:        createPhotoView('iceland'),
      zhangjiajie:    createPhotoView('zhangjiajie'),
      deadsea:        createPhotoView('deadsea'),
    }

    // Nav buttons
    document.querySelectorAll('#surface-app .view-btn').forEach(btn => {
      btn.addEventListener('click', () => switchView(btn.dataset.view))
    })

    // Raycaster click handler
    _renderer.domElement.addEventListener('click', onCanvasClick)

    runLoadingAnimation()
    initialized = true
  }

  switchView('procedural')
}

export function dispose() {
  active = false
  if (activeView) {
    activeView.dispose()
    activeView = null
  }
  clickTargets = []
  lastCamera = null
}

export function animate() {
  if (!activeView) return
  const result = activeView.animate()
  if (result?.camera) lastCamera = result.camera
  if (lastCamera) updateHUD(lastCamera)
}

export function resize() {
  activeView?.resize()
}
