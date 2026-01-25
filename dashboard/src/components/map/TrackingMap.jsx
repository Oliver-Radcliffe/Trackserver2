import { useEffect, useRef, useMemo, useState } from 'react';
import { MapContainer, Marker, CircleMarker, Circle, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import useDevicesStore, { MAP_MODES } from '../../stores/devicesStore';
import LayerSwitcher from './LayerSwitcher';
import UserLocationMarker from './UserLocationMarker';
import MapControls from './MapControls';

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

// Component to handle map centering based on map mode
function MapController({ mapMode, positions, userLocation, otherUserLocations, selectedTargetId, selectedTargetType, getAllTargets }) {
  const map = useMap();
  const prevModeRef = useRef(mapMode);
  const prevTargetRef = useRef({ id: selectedTargetId, type: selectedTargetType });

  useEffect(() => {
    const modeChanged = prevModeRef.current !== mapMode;
    const targetChanged = prevTargetRef.current.id !== selectedTargetId || prevTargetRef.current.type !== selectedTargetType;

    prevModeRef.current = mapMode;
    prevTargetRef.current = { id: selectedTargetId, type: selectedTargetType };

    switch (mapMode) {
      case MAP_MODES.MY_LOCATION:
        if (userLocation) {
          map.flyTo([userLocation.latitude, userLocation.longitude], 15, { duration: 1 });
        }
        break;

      case MAP_MODES.TARGET:
        if (selectedTargetId && selectedTargetType) {
          let pos = null;
          if (selectedTargetType === 'device') {
            pos = positions[selectedTargetId];
          } else if (selectedTargetType === 'user') {
            pos = otherUserLocations[selectedTargetId];
          }
          if (pos) {
            map.flyTo([pos.latitude, pos.longitude], 15, { duration: 1 });
          }
        }
        break;

      case MAP_MODES.ALL_TARGETS:
        const allTargets = getAllTargets();
        if (allTargets.length > 0) {
          const bounds = L.latLngBounds(
            allTargets.map((t) => [t.latitude, t.longitude])
          );
          // Add user location to bounds if available
          if (userLocation) {
            bounds.extend([userLocation.latitude, userLocation.longitude]);
          }
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15, duration: 1 });
        }
        break;

      case MAP_MODES.FREE_PAN:
      default:
        // Do nothing - user controls the map
        break;
    }
  }, [mapMode, positions, userLocation, otherUserLocations, selectedTargetId, selectedTargetType, getAllTargets, map]);

  // For ALL_TARGETS mode, update bounds when positions change
  useEffect(() => {
    if (mapMode === MAP_MODES.ALL_TARGETS) {
      const allTargets = getAllTargets();
      if (allTargets.length > 0) {
        const bounds = L.latLngBounds(
          allTargets.map((t) => [t.latitude, t.longitude])
        );
        if (userLocation) {
          bounds.extend([userLocation.latitude, userLocation.longitude]);
        }
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15, animate: true });
      }
    }
  }, [positions, otherUserLocations]);

  // For TARGET mode, follow the selected target when its position updates
  useEffect(() => {
    if (mapMode === MAP_MODES.TARGET && selectedTargetId && selectedTargetType) {
      let pos = null;
      if (selectedTargetType === 'device') {
        pos = positions[selectedTargetId];
      } else if (selectedTargetType === 'user') {
        pos = otherUserLocations[selectedTargetId];
      }
      if (pos) {
        map.panTo([pos.latitude, pos.longitude], { animate: true });
      }
    }
  }, [positions, otherUserLocations]);

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


// Marker for other users' shared locations
function OtherUserMarker({ userLoc }) {
  if (!userLoc) return null;

  const { latitude, longitude, accuracy, user_name, user_email, timestamp } = userLoc;

  return (
    <>
      {/* Accuracy circle */}
      {accuracy && (
        <Circle
          center={[latitude, longitude]}
          radius={accuracy}
          pathOptions={{
            color: '#16a34a',
            fillColor: '#22c55e',
            fillOpacity: 0.15,
            weight: 1,
          }}
        />
      )}

      {/* User position marker (green dot) */}
      <CircleMarker
        center={[latitude, longitude]}
        radius={8}
        pathOptions={{
          color: '#ffffff',
          fillColor: '#16a34a',
          fillOpacity: 1,
          weight: 3,
        }}
      >
        <Popup>
          <div className="min-w-40">
            <h3 className="font-bold text-lg">{user_name || 'User'}</h3>
            <p className="text-sm text-gray-600">{user_email}</p>
            <div className="mt-2 space-y-1 text-sm">
              <p><strong>Latitude:</strong> {latitude.toFixed(6)}</p>
              <p><strong>Longitude:</strong> {longitude.toFixed(6)}</p>
              {accuracy && <p><strong>Accuracy:</strong> {accuracy.toFixed(0)} m</p>}
              <p className="text-xs text-gray-500">
                Updated: {new Date(timestamp).toLocaleTimeString()}
              </p>
            </div>
          </div>
        </Popup>
      </CircleMarker>
    </>
  );
}

export default function TrackingMap() {
  const {
    devices,
    positions,
    positionTrails,
    selectedDeviceId,
    selectDevice,
    getAllDevicesWithPositions,
    userLocation,
    userLocationError,
    clearUserLocation,
    otherUserLocations,
    fetchUserLocations,
    mapMode,
    selectedTargetId,
    selectedTargetType,
    getAllTargets,
    requestUserLocation,
  } = useDevicesStore();
  const mapRef = useRef(null);
  const [legendOpen, setLegendOpen] = useState(false);

  // Fetch other users' locations on mount
  useEffect(() => {
    fetchUserLocations();
  }, []);

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
        <LayerSwitcher defaultLayerId="osm" />
        <MapController
          mapMode={mapMode}
          positions={positions}
          userLocation={userLocation}
          otherUserLocations={otherUserLocations}
          selectedTargetId={selectedTargetId}
          selectedTargetType={selectedTargetType}
          getAllTargets={getAllTargets}
        />

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

        <UserLocationMarker location={userLocation} />

        {/* Other users' locations */}
        {Object.values(otherUserLocations).map((userLoc) => (
          <OtherUserMarker key={userLoc.user_id} userLoc={userLoc} />
        ))}
      </MapContainer>

      {/* Map controls - bottom center */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-[1000]">
        <div className="flex items-end gap-2">
          <MapControls />
          {/* Share location button */}
          <button
            onClick={requestUserLocation}
            className="bg-white rounded-lg shadow-lg p-2 lg:p-3 hover:bg-gray-100 transition-colors flex items-center gap-2"
            title="Share My Location"
          >
            <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            <span className="hidden lg:inline text-sm font-medium text-gray-700">Share</span>
          </button>
        </div>
      </div>

      {/* User location error message */}
      {userLocationError && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[1000] bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded-lg shadow-lg">
          {userLocationError}
          <button
            onClick={clearUserLocation}
            className="ml-2 text-red-900 font-bold hover:text-red-700"
          >
            &times;
          </button>
        </div>
      )}

      {/* Map legend - collapsible on mobile */}
      <div className="absolute bottom-4 left-4 z-[1000]">
        {/* Legend toggle button (mobile) */}
        <button
          onClick={() => setLegendOpen(!legendOpen)}
          className="lg:hidden bg-white rounded-lg shadow-lg p-2 mb-2"
          aria-label="Toggle legend"
        >
          <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>

        {/* Legend content */}
        <div className={`bg-white rounded-lg shadow-lg p-3 ${legendOpen ? 'block' : 'hidden lg:block'}`}>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold">Legend</h4>
            <button
              onClick={() => setLegendOpen(false)}
              className="lg:hidden text-gray-400 hover:text-gray-600"
              aria-label="Close legend"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
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
            <div className="flex items-center gap-2 pt-1 border-t border-gray-200 mt-1">
              <svg width="16" height="16" viewBox="0 0 16 16">
                <circle cx="8" cy="8" r="5" fill="#2563eb" stroke="#fff" strokeWidth="2"/>
              </svg>
              <span>Your Location</span>
            </div>
            <div className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 16 16">
                <circle cx="8" cy="8" r="5" fill="#16a34a" stroke="#fff" strokeWidth="2"/>
              </svg>
              <span>Other Users</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
