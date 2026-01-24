import { Circle, CircleMarker, Popup } from 'react-leaflet';

export default function UserLocationMarker({ location }) {
  if (!location) return null;

  const { latitude, longitude, accuracy, timestamp } = location;

  return (
    <>
      {/* Accuracy circle */}
      <Circle
        center={[latitude, longitude]}
        radius={accuracy}
        pathOptions={{
          color: '#2563eb',
          fillColor: '#3b82f6',
          fillOpacity: 0.15,
          weight: 1,
        }}
      />

      {/* User position marker (blue dot) */}
      <CircleMarker
        center={[latitude, longitude]}
        radius={8}
        pathOptions={{
          color: '#ffffff',
          fillColor: '#2563eb',
          fillOpacity: 1,
          weight: 3,
        }}
      >
        <Popup>
          <div className="min-w-40">
            <h3 className="font-bold text-lg">Your Location</h3>
            <div className="mt-2 space-y-1 text-sm">
              <p><strong>Latitude:</strong> {latitude.toFixed(6)}</p>
              <p><strong>Longitude:</strong> {longitude.toFixed(6)}</p>
              <p><strong>Accuracy:</strong> {accuracy.toFixed(0)} m</p>
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
