import * as THREE from 'three'
import * as proceduralView from './surface/views/procedural.js'
import { createSurfaceProceduralView } from './surface/views/procedural.js'
import { createMarsView }  from './surface/views/mars.js'
import { createEarthView } from './surface/views/earth.js'
import { createPhotoView, setResolutionOffset, getResolutionOffset } from './surface/views/everest-v2.js'
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

const PHOTO_VIEWS = new Set([
  'everestv2', 'grandcanyonv2', 'yosemite', 'fjords', 'craterlake',
  'hawaii', 'patagonia', 'dolomites', 'matterhorn', 'iceland',
  'zhangjiajie', 'deadsea', 'santorini', 'borabora', 'namibia',
  'fuji', 'cappadocia',
])

const svDescriptionText = document.getElementById('sv-view-description-text')
const svDescriptions = {
  procedural: 'Procedurally generated terrain with simplex noise heightmaps, mineral deposits placed by geological simulation. Click deposits to analyze composition.',
  valles: 'Valles Marineris \u2014 the solar system\'s largest canyon, stretching 4,000 km across Mars. Elevation data from NASA MOLA laser altimeter at ~460 m/pixel resolution.',
  olympus: 'Olympus Mons \u2014 the tallest volcano in the solar system at 21.9 km. MOLA elevation data reveals the massive caldera complex and surrounding aureole deposits.',
  hellas: 'Hellas Basin \u2014 a 2,300 km wide impact basin, the deepest point on Mars at 7.1 km below datum. MOLA data shows the basin floor and heavily eroded rim.',
  grandcanyon: 'Grand Canyon, Arizona \u2014 277 miles of the Colorado River carved through 2 billion years of geological history. Terrain from Mapzen Terrarium elevation tiles.',
  himalayas: 'The Himalayan range viewed from elevation tiles, showing the collision zone between the Indian and Eurasian plates. Peaks exceed 8,000 m across the range.',
  grandcanyonv2: 'Grand Canyon from high-resolution satellite imagery draped over Mapzen Terrarium elevation data. ESRI World Imagery provides sub-meter detail.',
  yosemite: 'Yosemite Valley \u2014 glacially carved granite walls rising 1,000 m above the valley floor. Satellite imagery over elevation data reveals Half Dome and El Capitan.',
  craterlake: 'Crater Lake, Oregon \u2014 the deepest lake in the US at 594 m, formed in the collapsed caldera of Mount Mazama ~7,700 years ago.',
  hawaii: 'Hawai\u02BBi \u2014 the Big Island\'s volcanic landscape, from Mauna Kea\'s summit (4,207 m) to active lava flows at K\u012Blauea. Satellite imagery over elevation data.',
  patagonia: 'Torres del Paine, Chile \u2014 granite towers and glacial lakes in southern Patagonia. The iconic towers rise to 2,850 m above sea level.',
  fjords: 'Geirangerfjord, Norway \u2014 a UNESCO World Heritage fjord carved by glaciers to depths of 250 m. Surrounded by 1,500 m cliffs and waterfalls.',
  dolomites: 'The Dolomites, Italy \u2014 dramatic limestone peaks and spires in the Southern Alps, a UNESCO World Heritage site reaching 3,343 m at Marmolada.',
  matterhorn: 'The Matterhorn (4,478 m) \u2014 one of the Alps\' most iconic peaks, straddling the Swiss-Italian border. Its pyramidal form was shaped by glacial erosion.',
  iceland: 'Iceland\'s volcanic highlands \u2014 a landscape shaped by the Mid-Atlantic Ridge, with glaciers, lava fields, and geothermal areas visible in satellite imagery.',
  everestv2: 'Mount Everest (8,849 m) \u2014 the highest point on Earth, viewed from satellite imagery. The Khumbu Glacier and surrounding Himalayan peaks are visible.',
  zhangjiajie: 'Zhangjiajie, China \u2014 towering sandstone pillars that inspired the floating mountains of Avatar. Over 3,000 quartzite columns rise above subtropical forest.',
  deadsea: 'The Dead Sea \u2014 at 430 m below sea level, the lowest point on Earth\'s surface. Satellite imagery shows the hypersaline lake and surrounding rift valley.',
  glacial: 'Procedurally generated glacial terrain with broad U-shaped valleys and sharp arêtes. Simplex noise FBM simulates erosional patterns typical of glaciated landscapes.',
  volcanicSurface: 'Procedurally generated volcanic terrain with jagged peaks and deep calderas. High-frequency noise creates sharp detail reminiscent of active volcanic regions.',
  kilimanjaro: 'Mount Kilimanjaro, Tanzania \u2014 Africa\'s highest peak at 5,895 m, a massive stratovolcano rising from the East African savanna. Terrarium elevation tiles reveal three volcanic cones.',
  sognefjord: 'Sognefjorden, Norway \u2014 the longest and deepest fjord in Norway at 204 km and 1,308 m deep. Elevation data shows the dramatic U-shaped valleys carved by Pleistocene glaciers.',
  santorini: 'Santorini, Greece \u2014 a volcanic caldera island in the Aegean Sea, site of one of the largest eruptions in recorded history (~1600 BCE). Satellite imagery over elevation data.',
  borabora: 'Bora Bora, French Polynesia \u2014 a volcanic island surrounded by a turquoise lagoon and barrier reef. Satellite imagery captures the iconic profile of Mount Otemanu.',
  namibia: 'The Namib Desert \u2014 home to the world\'s tallest sand dunes at Sossusvlei, some exceeding 300 m. Satellite imagery reveals the dramatic red-orange dune fields.',
  fuji: 'Mount Fuji (3,776 m) \u2014 Japan\'s iconic symmetrical stratovolcano and highest peak. Satellite imagery over elevation data shows the perfect conical form and Five Lakes region.',
  cappadocia: 'Cappadocia, Turkey \u2014 a volcanic landscape shaped by millions of years of erosion, creating fairy chimneys, cave cities, and dramatic valleys in central Anatolia.',
}

let currentViewName = null
const resPanel = document.getElementById('sv-resolution')

async function switchView(name) {
  document.querySelectorAll('#surface-app .view-btn').forEach(b => { b.disabled = true })

  if (activeView) activeView.dispose()
  activeView = views[name]
  currentViewName = name

  await activeView.init(_renderer)

  document.querySelectorAll('#surface-app .view-btn').forEach(b => {
    b.disabled = false
    b.classList.toggle('active', b.dataset.view === name)
    if (b.dataset.view === name) {
      const pg = b.closest('.nav-group')
      if (pg) pg.classList.remove('collapsed')
    }
  })

  // Show resolution selector only for satellite photo views
  if (resPanel) resPanel.style.display = PHOTO_VIEWS.has(name) ? 'flex' : 'none'

  updateClickTargets()
  svDescriptionText.textContent = svDescriptions[name] || ''
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
      procedural:     proceduralView,
      glacial:        createSurfaceProceduralView('glacial'),
      volcanicSurface: createSurfaceProceduralView('volcanicSurface'),
      valles:         createMarsView('valles'),
      olympus:        createMarsView('olympus'),
      hellas:         createMarsView('hellas'),
      grandcanyon:    createEarthView('grandcanyon'),
      himalayas:      createEarthView('himalayas'),
      kilimanjaro:    createEarthView('kilimanjaro'),
      sognefjord:     createEarthView('sognefjord'),
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
      santorini:      createPhotoView('santorini'),
      borabora:       createPhotoView('borabora'),
      namibia:        createPhotoView('namibia'),
      fuji:           createPhotoView('fuji'),
      cappadocia:     createPhotoView('cappadocia'),
    }

    // Nav buttons
    document.querySelectorAll('#surface-app .view-btn').forEach(btn => {
      btn.addEventListener('click', () => switchView(btn.dataset.view))
    })

    // Collapsible nav groups
    document.querySelectorAll('#surface-app .nav-group').forEach(group => {
      const label = group.querySelector('.nav-group-label')
      const buttons = group.querySelectorAll('.view-btn')
      if (buttons.length >= 3) group.classList.add('collapsed')
      label.addEventListener('click', () => group.classList.toggle('collapsed'))
    })
    const svActiveBtn = document.querySelector('#surface-app .view-btn.active')
    if (svActiveBtn) {
      const pg = svActiveBtn.closest('.nav-group')
      if (pg) pg.classList.remove('collapsed')
    }

    // Resolution selector
    document.querySelectorAll('#sv-resolution .res-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const offset = parseInt(btn.dataset.res)
        if (offset === getResolutionOffset()) return
        setResolutionOffset(offset)
        document.querySelectorAll('#sv-resolution .res-btn').forEach(b =>
          b.classList.toggle('active', b === btn)
        )
        if (currentViewName && PHOTO_VIEWS.has(currentViewName)) {
          switchView(currentViewName)
        }
      })
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
