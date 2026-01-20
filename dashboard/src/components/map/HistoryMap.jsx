import { useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';

// Calculate bearing between two points (in degrees, 0 = North)
function calculateBearing(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const toDeg = (rad) => (rad * 180) / Math.PI;

  const dLon = toRad(lon2 - lon1);
  const lat1Rad = toRad(lat1);
  const lat2Rad = toRad(lat2);

  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
            Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);

  let bearing = toDeg(Math.atan2(y, x));
  return (bearing + 360) % 360; // Normalize to 0-360
}

// Create arrow icon with rotation
function createArrowIcon(bearing) {
  const svgArrow = `
    <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      <g transform="rotate(${bearing}, 16, 16)">
        <path d="M16 4 L24 28 L16 22 L8 28 Z"
              fill="#ef4444"
              stroke="#ffffff"
              stroke-width="2"
              stroke-linejoin="round"/>
      </g>
    </svg>
  `;

  return L.divIcon({
    html: svgArrow,
    className: 'arrow-marker',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
}

// Fit map to track bounds
function MapBoundsController({ positions }) {
  const map = useMap();

  useEffect(() => {
    if (positions && positions.length > 0) {
      const bounds = L.latLngBounds(
        positions.map(p => [p.latitude, p.longitude])
      );
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [positions, map]);

  return null;
}

// Playback marker with directional arrow
function PlaybackMarker({ position, bearing }) {
  if (!position) return null;

  const icon = useMemo(() => createArrowIcon(bearing), [bearing]);

  return (
    <Marker
      position={[position.latitude, position.longitude]}
      icon={icon}
    >
      <Popup>
        <div className="text-sm">
          <p><strong>Time:</strong> {new Date(position.timestamp).toLocaleString()}</p>
          <p><strong>Speed:</strong> {position.speed?.toFixed(1) || 0} km/h</p>
          <p><strong>Heading:</strong> {bearing.toFixed(0)}°</p>
          <p><strong>Battery:</strong> {position.battery || '--'}%</p>
        </div>
      </Popup>
    </Marker>
  );
}

export default function HistoryMap({ positions, playbackIndex, onPointClick }) {
  const mapRef = useRef(null);

  // Default center
  const defaultCenter = [51.505, -0.09];
  const defaultZoom = 10;

  // Create polyline coordinates
  const trackCoordinates = useMemo(() => {
    if (!positions || positions.length === 0) return [];
    return positions.map(p => [p.latitude, p.longitude]);
  }, [positions]);

  // Color segments based on speed
  const getSpeedColor = (speed) => {
    if (speed > 80) return '#ef4444'; // red - fast
    if (speed > 40) return '#f59e0b'; // orange - medium
    if (speed > 10) return '#22c55e'; // green - slow
    return '#3b82f6'; // blue - stationary/very slow
  };

  // Current playback position and bearing
  const playbackPosition = playbackIndex !== null && positions
    ? positions[playbackIndex]
    : null;

  // Calculate bearing from current position to next (or from previous to current)
  const playbackBearing = useMemo(() => {
    if (!positions || playbackIndex === null) return 0;

    const current = positions[playbackIndex];
    let next = positions[playbackIndex + 1];

    // If at the last position, use direction from previous position
    if (!next && playbackIndex > 0) {
      const prev = positions[playbackIndex - 1];
      return calculateBearing(prev.latitude, prev.longitude, current.latitude, current.longitude);
    }

    if (next) {
      return calculateBearing(current.latitude, current.longitude, next.latitude, next.longitude);
    }

    return 0;
  }, [positions, playbackIndex]);

  return (
    <div className="h-full w-full relative">
      <MapContainer
        ref={mapRef}
        center={defaultCenter}
        zoom={defaultZoom}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapBoundsController positions={positions} />

        {/* Track polyline */}
        {trackCoordinates.length > 1 && (
          <Polyline
            positions={trackCoordinates}
            pathOptions={{
              color: '#3b82f6',
              weight: 4,
              opacity: 0.8,
            }}
          />
        )}

        {/* Start marker */}
        {positions && positions.length > 0 && (
          <CircleMarker
            center={[positions[0].latitude, positions[0].longitude]}
            radius={8}
            pathOptions={{
              color: '#22c55e',
              fillColor: '#22c55e',
              fillOpacity: 1,
              weight: 2,
            }}
          >
            <Popup>
              <div className="text-sm">
                <p className="font-bold text-green-600">Start</p>
                <p>{new Date(positions[0].timestamp).toLocaleString()}</p>
              </div>
            </Popup>
          </CircleMarker>
        )}

        {/* End marker */}
        {positions && positions.length > 1 && (
          <CircleMarker
            center={[
              positions[positions.length - 1].latitude,
              positions[positions.length - 1].longitude
            ]}
            radius={8}
            pathOptions={{
              color: '#ef4444',
              fillColor: '#ef4444',
              fillOpacity: 1,
              weight: 2,
            }}
          >
            <Popup>
              <div className="text-sm">
                <p className="font-bold text-red-600">End</p>
                <p>{new Date(positions[positions.length - 1].timestamp).toLocaleString()}</p>
              </div>
            </Popup>
          </CircleMarker>
        )}

        {/* Position points (clickable) */}
        {positions && positions.map((pos, idx) => (
          idx > 0 && idx < positions.length - 1 && (
            <CircleMarker
              key={pos.id || idx}
              center={[pos.latitude, pos.longitude]}
              radius={4}
              pathOptions={{
                color: getSpeedColor(pos.speed || 0),
                fillColor: getSpeedColor(pos.speed || 0),
                fillOpacity: 0.7,
                weight: 1,
              }}
              eventHandlers={{
                click: () => onPointClick && onPointClick(idx),
              }}
            >
              <Popup>
                <div className="text-sm">
                  <p><strong>Time:</strong> {new Date(pos.timestamp).toLocaleString()}</p>
                  <p><strong>Speed:</strong> {pos.speed?.toFixed(1) || 0} km/h</p>
                  <p><strong>Battery:</strong> {pos.battery || '--'}%</p>
                  <p className="text-xs text-gray-500">
                    {pos.latitude.toFixed(6)}, {pos.longitude.toFixed(6)}
                  </p>
                </div>
              </Popup>
            </CircleMarker>
          )
        ))}

        {/* Playback marker */}
        <PlaybackMarker position={playbackPosition} bearing={playbackBearing} />
      </MapContainer>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg p-3 z-[1000]">
        <h4 className="text-sm font-semibold mb-2">Speed Legend</h4>
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-500"></span>
            <span>&gt; 80 km/h</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-orange-500"></span>
            <span>40-80 km/h</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-green-500"></span>
            <span>10-40 km/h</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-blue-500"></span>
            <span>&lt; 10 km/h</span>
          </div>
        </div>
      </div>
    </div>
  );
}
