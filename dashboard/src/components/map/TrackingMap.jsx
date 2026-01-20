import { useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, CircleMarker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import useDevicesStore from '../../stores/devicesStore';

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
  return (bearing + 360) % 360;
}

// Create arrow icon with rotation and status color
function createArrowIcon(bearing, statusColor) {
  const svgArrow = `
    <svg width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
      <g transform="rotate(${bearing}, 18, 18)">
        <path d="M18 4 L28 32 L18 26 L8 32 Z"
              fill="${statusColor}"
              stroke="#ffffff"
              stroke-width="2"
              stroke-linejoin="round"/>
      </g>
    </svg>
  `;

  return L.divIcon({
    html: svgArrow,
    className: 'arrow-marker',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18],
  });
}

// Get status color based on device state
function getStatusColor(device, position) {
  const isMoving = position?.is_moving;
  const isOnline = device.last_seen_at &&
    (new Date() - new Date(device.last_seen_at)) < 5 * 60 * 1000;

  if (!isOnline) return '#9ca3af'; // gray - offline
  if (isMoving) return '#ef4444'; // red - moving
  return '#3b82f6'; // blue - stationary
}

// Component to handle map centering
function MapController({ selectedDeviceId, positions }) {
  const map = useMap();

  useEffect(() => {
    if (selectedDeviceId && positions[selectedDeviceId]) {
      const pos = positions[selectedDeviceId];
      map.flyTo([pos.latitude, pos.longitude], 15, { duration: 1 });
    }
  }, [selectedDeviceId, positions, map]);

  return null;
}

// Trail markers showing recent positions
function TrailMarkers({ trail, statusColor }) {
  if (!trail || trail.length < 2) return null;

  // Skip the first position (current) and show the rest as trail
  const trailPositions = trail.slice(1);

  return (
    <>
      {/* Trail line connecting points */}
      <Polyline
        positions={trail.map(p => [p.latitude, p.longitude])}
        pathOptions={{
          color: statusColor,
          weight: 3,
          opacity: 0.4,
          dashArray: '5, 10',
        }}
      />

      {/* Trail dots with fading opacity */}
      {trailPositions.map((pos, idx) => {
        // Opacity decreases from 0.6 to 0.1 as we go further back
        const opacity = 0.6 - (idx / trailPositions.length) * 0.5;

        return (
          <CircleMarker
            key={`trail-${idx}-${pos.timestamp}`}
            center={[pos.latitude, pos.longitude]}
            radius={4}
            pathOptions={{
              color: statusColor,
              fillColor: statusColor,
              fillOpacity: opacity,
              weight: 1,
              opacity: opacity,
            }}
          />
        );
      })}
    </>
  );
}

// Device marker component with directional arrow
function DeviceMarker({ device, position, trail, isSelected, onSelect }) {
  if (!position) return null;

  const statusColor = getStatusColor(device, position);

  // Calculate bearing from previous position in trail, or default to 0
  const bearing = useMemo(() => {
    if (trail && trail.length >= 2) {
      const current = trail[0];
      const previous = trail[1];
      return calculateBearing(
        previous.latitude, previous.longitude,
        current.latitude, current.longitude
      );
    }
    return 0;
  }, [trail]);

  const icon = useMemo(
    () => createArrowIcon(bearing, statusColor),
    [bearing, statusColor]
  );

  return (
    <>
      {/* Trail markers */}
      <TrailMarkers trail={trail} statusColor={statusColor} />

      {/* Main device marker */}
      <Marker
        position={[position.latitude, position.longitude]}
        icon={icon}
        eventHandlers={{
          click: () => onSelect(device.id),
        }}
      >
        <Popup>
          <div className="min-w-48">
            <h3 className="font-bold text-lg">{device.name || device.serial_number}</h3>
            <p className="text-sm text-gray-600">{device.serial_number}</p>
            <div className="mt-2 space-y-1 text-sm">
              <p><strong>Speed:</strong> {position.speed?.toFixed(1) || 0} km/h</p>
              <p><strong>Heading:</strong> {bearing.toFixed(0)}°</p>
              <p><strong>Battery:</strong> {position.battery || '--'}%</p>
              <p><strong>Satellites:</strong> {position.satellites || '--'}</p>
              <p><strong>Last Update:</strong> {new Date(position.timestamp).toLocaleTimeString()}</p>
              <p className="text-xs text-gray-500">
                {position.latitude.toFixed(6)}, {position.longitude.toFixed(6)}
              </p>
            </div>
          </div>
        </Popup>
      </Marker>
    </>
  );
}

export default function TrackingMap() {
  const { devices, positions, positionTrails, selectedDeviceId, selectDevice, getAllDevicesWithPositions } = useDevicesStore();
  const mapRef = useRef(null);

  // Default center (London)
  const defaultCenter = [51.505, -0.09];
  const defaultZoom = 10;

  // Calculate bounds to fit all devices
  const devicesWithPositions = getAllDevicesWithPositions().filter(d => d.position);

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

        <MapController selectedDeviceId={selectedDeviceId} positions={positions} />

        {devicesWithPositions.map((device) => (
          <DeviceMarker
            key={device.id}
            device={device}
            position={device.position}
            trail={positionTrails[device.id]}
            isSelected={selectedDeviceId === device.id}
            onSelect={selectDevice}
          />
        ))}
      </MapContainer>

      {/* Map legend */}
      <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg p-3 z-[1000]">
        <h4 className="text-sm font-semibold mb-2">Legend</h4>
        <div className="space-y-1 text-sm">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 16 16">
              <path d="M8 2 L12 14 L8 11 L4 14 Z" fill="#ef4444" stroke="#fff" strokeWidth="1"/>
            </svg>
            <span>Moving</span>
          </div>
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 16 16">
              <path d="M8 2 L12 14 L8 11 L4 14 Z" fill="#3b82f6" stroke="#fff" strokeWidth="1"/>
            </svg>
            <span>Stationary</span>
          </div>
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 16 16">
              <path d="M8 2 L12 14 L8 11 L4 14 Z" fill="#9ca3af" stroke="#fff" strokeWidth="1"/>
            </svg>
            <span>Offline</span>
          </div>
          <div className="flex items-center gap-2 pt-1 border-t border-gray-200 mt-1">
            <span className="w-4 border-t-2 border-dashed border-gray-400"></span>
            <span className="text-xs text-gray-500">Trail (last 10)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
