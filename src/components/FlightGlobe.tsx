import { useMemo, useState } from 'react'
import Map, { Layer, Popup, Source } from 'react-map-gl/mapbox'
import type { FogSpecification, LayerProps, MapEvent, MapMouseEvent } from 'react-map-gl/mapbox'
import type { FeatureCollection, Point } from 'geojson'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useFlights } from '../flights/FlightsContext'
import { NEAREST_COUNT, SFO, formatAltitude, formatSpeed } from '../hooks/useNearbyFlights'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

// Material "flight" icon, pointing north so icon-rotate can apply the heading.
// Drawn at 2x and registered as an SDF image so the layer can recolor it.
const PLANE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24">
  <path fill="#fff" d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
</svg>`

const FOG: FogSpecification = {
  color: 'rgb(20, 24, 36)',
  'high-color': 'rgb(36, 92, 223)',
  'horizon-blend': 0.02,
  'space-color': 'rgb(11, 11, 25)',
  'star-intensity': 0.6,
}

const flightLayer: LayerProps = {
  id: 'flights',
  type: 'symbol',
  layout: {
    'icon-image': 'plane',
    'icon-size': ['case', ['get', 'nearest'], 1, 0.7],
    'icon-rotate': ['coalesce', ['get', 'track'], 0],
    'icon-rotation-alignment': 'map',
    'icon-allow-overlap': true,
    'text-field': ['get', 'callsign'],
    'text-size': 11,
    'text-offset': [0, 1.4],
    'text-anchor': 'top',
    'text-optional': true,
  },
  paint: {
    // The 5 nearest flights (the ones in the table) are highlighted
    'icon-color': ['case', ['get', 'nearest'], '#f5a623', '#7fd4ff'],
    'icon-opacity': ['case', ['get', 'onGround'], 0.45, 1],
    'text-color': '#e6e6e6',
    'text-halo-color': '#000',
    'text-halo-width': 1,
  },
}

function FlightGlobe() {
  const { data } = useFlights()
  const [iconReady, setIconReady] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const flights = useMemo(() => data?.flights ?? [], [data])

  const geojson = useMemo<FeatureCollection<Point>>(
    () => ({
      type: 'FeatureCollection',
      features: flights.map((f, i) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [f.longitude, f.latitude] },
        properties: {
          icao24: f.icao24,
          callsign: f.callsign,
          track: f.trueTrack,
          onGround: f.onGround,
          nearest: i < NEAREST_COUNT,
        },
      })),
    }),
    [flights],
  )

  // Look the selection up in the latest data so the popup follows each poll,
  // and closes on its own if the aircraft leaves the search box
  const selected = flights.find((f) => f.icao24 === selectedId)

  function handleLoad(e: MapEvent) {
    const map = e.target
    const img = new Image(48, 48)
    img.onload = () => {
      if (!map.hasImage('plane')) map.addImage('plane', img, { sdf: true, pixelRatio: 2 })
      setIconReady(true)
    }
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(PLANE_SVG)}`

    // Open on the whole globe, then fly in close enough to tell flights apart
    map.flyTo({ center: [SFO.lon, SFO.lat], zoom: 9, duration: 4000, essential: true })
  }

  function handleClick(e: MapMouseEvent) {
    const icao24 = e.features?.[0]?.properties?.icao24
    setSelectedId(typeof icao24 === 'string' ? icao24 : null)
  }

  if (!MAPBOX_TOKEN) {
    return (
      <p>
        Add <code>VITE_MAPBOX_TOKEN</code> to <code>.env.local</code> and restart the dev server to
        show the globe.
      </p>
    )
  }

  return (
    <Map
      mapboxAccessToken={MAPBOX_TOKEN}
      initialViewState={{ longitude: -100, latitude: 40, zoom: 1.5 }}
      style={{ width: '100%', height: '100%' }}
      mapStyle="mapbox://styles/mapbox/dark-v11"
      projection="globe"
      fog={FOG}
      interactiveLayerIds={iconReady ? ['flights'] : []}
      onLoad={handleLoad}
      onClick={handleClick}
    >
      {iconReady && (
        <Source id="flights" type="geojson" data={geojson}>
          <Layer {...flightLayer} />
        </Source>
      )}
      {selected && (
        <Popup
          longitude={selected.longitude}
          latitude={selected.latitude}
          closeOnClick={false}
          onClose={() => setSelectedId(null)}
        >
          <strong>{selected.callsign}</strong>
          <div>{selected.originCountry}</div>
          <div>{formatAltitude(selected)}</div>
          <div>{formatSpeed(selected)}</div>
          <div>{selected.distanceKm.toFixed(1)} km from SFO</div>
        </Popup>
      )}
    </Map>
  )
}

export default FlightGlobe
