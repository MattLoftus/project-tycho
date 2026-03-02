import * as THREE from 'three'
import * as proceduralView from './ocean/views/procedural.js'
import { createProceduralView } from './ocean/views/procedural.js'
import { createBathymetryView } from './ocean/views/bathymetry.js'
import { createReefView } from './ocean/views/reef.js'
import { updateHUD, showContactDetail } from './ocean/hud.js'

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
  if (hits.length > 0) showContactDetail(hits[0].object.userData.contact)
}

const ocDescriptionText = document.getElementById('oc-view-description-text')
const ocDescriptions = {
  procedural: 'Procedurally generated ocean floor with simplex noise bathymetry. Sonar contacts are placed by geological simulation. Click contacts to analyze.',
  abyssal: 'Abyssal plain \u2014 the flattest regions on Earth, lying 3,000\u20136,000 m deep. Vast featureless expanses covered in fine sediment, punctuated by sparse bioluminescent life.',
  volcanic: 'Volcanic ridge simulation \u2014 dramatic underwater terrain shaped by tectonic forces. Sharp peaks, deep fissures, and dense hydrothermal vent fields releasing superheated mineral-rich water.',
  mariana: 'Mariana Trench \u2014 the deepest point in the ocean at 10,935 m. Bathymetry data reveals the crescent-shaped trench carved by the Pacific Plate subducting beneath the Mariana Plate.',
  hawaiian: 'Hawaiian Ridge \u2014 a 6,000 km volcanic chain formed by the Pacific Plate drifting over a mantle hotspot. Bathymetry shows seamounts, atolls, and the active Hawaiian Islands.',
  midatlantic: 'Mid-Atlantic Ridge \u2014 a 16,000 km underwater mountain range where the Eurasian and North American plates diverge. The longest mountain chain on Earth, mostly hidden beneath the ocean.',
  puertorico: 'Puerto Rico Trench \u2014 the deepest point in the Atlantic Ocean at 8,376 m. Formed by the complex interaction of the Caribbean and North American tectonic plates.',
  philippine: 'Philippine Trench \u2014 a submarine trench reaching 10,540 m at Galathea Deep. Created by the subduction of the Philippine Sea Plate beneath the Philippine Mobile Belt.',
  java: 'Java Trench (Sunda Trench) \u2014 the deepest point in the Indian Ocean at 7,290 m. A 3,200 km arc formed by the subduction of the Indo-Australian Plate beneath the Eurasian Plate.',
  reef: 'Coral reef ecosystem simulation with procedurally generated reef structures, sea life, and bioluminescent organisms in shallow tropical waters.',
  shelf: 'Continental shelf simulation \u2014 the gently sloping underwater extension of a continent, typically reaching 200 m depth before dropping off at the shelf edge.',
  hydrothermal: 'Hydrothermal vent field simulation \u2014 chaotic terrain surrounding deep-sea black smokers, where superheated mineral-rich water erupts from the seafloor at temperatures exceeding 400\u00B0C.',
  arctic: 'Arctic seafloor simulation \u2014 a cold, barren polar ocean floor beneath seasonal ice cover. Dense marine snow falls through near-freezing water to the broad, gently undulating basin floor.',
  tonga: 'Tonga Trench \u2014 the second deepest ocean trench on Earth at 10,823 m. This South Pacific subduction zone connects to the Kermadec Trench in a 2,500 km long feature.',
  cayman: 'Cayman Trough \u2014 the deepest point in the Caribbean Sea at 7,686 m. Home to the Beebe Vent Field, the deepest known hydrothermal vents at nearly 5,000 m.',
  southsandwich: 'South Sandwich Trench \u2014 the deepest trench in the Southern Atlantic at 8,264 m. A remote subduction zone near Antarctica with active volcanism along the island arc.',
}

async function switchView(name) {
  document.querySelectorAll('#ocean-app .view-btn').forEach(b => { b.disabled = true })

  if (activeView) activeView.dispose()
  activeView = views[name]

  await activeView.init(_renderer)

  document.querySelectorAll('#ocean-app .view-btn').forEach(b => {
    b.disabled = false
    b.classList.toggle('active', b.dataset.view === name)
    if (b.dataset.view === name) {
      const pg = b.closest('.nav-group')
      if (pg) pg.classList.remove('collapsed')
    }
  })

  updateClickTargets()
  ocDescriptionText.textContent = ocDescriptions[name] || ''
}

function runLoadingAnimation() {
  const steps = [
    [15,'INITIALIZING SONAR ARRAY...'], [30,'CALIBRATING DEPTH SENSORS...'],
    [50,'MAPPING SEAFLOOR TOPOLOGY...'], [70,'SCANNING FOR CONTACTS...'],
    [90,'PRESSURIZING HULL...'], [100,'SYSTEM READY'],
  ]
  let idx = 0
  const bar = document.getElementById('oc-loading-bar')
  const statusEl = document.getElementById('oc-loading-status')
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
      procedural:     proceduralView,
      abyssal:        createProceduralView('abyssal'),
      volcanic:       createProceduralView('volcanic'),
      shelf:          createProceduralView('shelf'),
      hydrothermal:   createProceduralView('hydrothermal'),
      arctic:         createProceduralView('arctic'),
      mariana:        createBathymetryView('mariana'),
      hawaiian:       createBathymetryView('hawaiian'),
      philippine:     createBathymetryView('philippine'),
      midatlantic:    createBathymetryView('midatlantic'),
      puertorico:     createBathymetryView('puertorico'),
      java:           createBathymetryView('java'),
      tonga:          createBathymetryView('tonga'),
      cayman:         createBathymetryView('cayman'),
      southsandwich:  createBathymetryView('southsandwich'),
      reef:           createReefView(),
    }

    // Nav buttons
    document.querySelectorAll('#ocean-app .view-btn').forEach(btn => {
      btn.addEventListener('click', () => switchView(btn.dataset.view))
    })

    // Collapsible nav groups
    document.querySelectorAll('#ocean-app .nav-group').forEach(group => {
      const label = group.querySelector('.nav-group-label')
      const buttons = group.querySelectorAll('.view-btn')
      if (buttons.length >= 3) group.classList.add('collapsed')
      label.addEventListener('click', () => group.classList.toggle('collapsed'))
    })
    const ocActiveBtn = document.querySelector('#ocean-app .view-btn.active')
    if (ocActiveBtn) {
      const pg = ocActiveBtn.closest('.nav-group')
      if (pg) pg.classList.remove('collapsed')
    }

    // Raycaster click handler
    _renderer.domElement.addEventListener('click', onCanvasClick)

    // Close detail panel
    document.getElementById('oc-close-detail')?.addEventListener('click', () =>
      document.getElementById('oc-contact-detail').classList.add('hidden'))

    document.getElementById('oc-hud')?.addEventListener('click', (e) => {
      const panel = document.getElementById('oc-contact-detail')
      if (!panel.classList.contains('hidden') && !panel.contains(e.target))
        panel.classList.add('hidden')
    })

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
