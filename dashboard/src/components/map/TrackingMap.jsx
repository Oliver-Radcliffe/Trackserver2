import { useEffect, useRef, useMemo } from 'react';
import { MapContainer, Marker, CircleMarker, Circle, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import useDevicesStore from '../../stores/devicesStore';
import LayerSwitcher from './LayerSwitcher';
import UserLocationMarker from './UserLocationMarker';

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

// Component to fly to user location
function FlyToUserLocation({ userLocation }) {
  const map = useMap();

  useEffect(() => {
    if (userLocation) {
      map.flyTo([userLocation.latitude, userLocation.longitude], 15, { duration: 1 });
    }
  }, [userLocation, map]);

  return null;
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
    isGettingUserLocation,
    requestUserLocation,
    clearUserLocation,
    otherUserLocations,
    fetchUserLocations,
  } = useDevicesStore();
  const mapRef = useRef(null);

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
        <MapController selectedDeviceId={selectedDeviceId} positions={positions} />
        <FlyToUserLocation userLocation={userLocation} />

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

      {/* My Location button */}
      <div className="absolute top-4 right-4 z-[1000]">
        <button
          onClick={requestUserLocation}
          disabled={isGettingUserLocation}
          className="bg-white rounded-lg shadow-lg p-2 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="My Location"
        >
          {isGettingUserLocation ? (
            <svg className="w-6 h-6 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            <svg className="w-6 h-6 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              <circle cx="12" cy="12" r="3" fill="currentColor" />
              <path strokeLinecap="round" d="M12 2v2m0 16v2m10-10h-2M4 12H2" />
            </svg>
          )}
        </button>
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
  );
}
