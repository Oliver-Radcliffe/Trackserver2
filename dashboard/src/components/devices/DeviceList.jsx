import { formatDistanceToNow } from 'date-fns';
import useDevicesStore from '../../stores/devicesStore';

function DeviceCard({ device, position, isSelected, onSelect }) {
  const isOnline = device.last_seen_at &&
    (new Date() - new Date(device.last_seen_at)) < 5 * 60 * 1000;

  const isMoving = position?.is_moving;

  let statusColor = 'bg-gray-400';
  let statusText = 'Offline';
  if (isOnline) {
    if (isMoving) {
      statusColor = 'bg-green-500';
      statusText = 'Moving';
    } else {
      statusColor = 'bg-blue-500';
      statusText = 'Stationary';
    }
  }

  return (
    <div
      onClick={() => onSelect(device.id)}
      className={`p-4 rounded-lg cursor-pointer transition-all ${
        isSelected
          ? 'bg-blue-50 border-2 border-blue-500'
          : 'bg-white hover:bg-gray-50 border border-gray-200'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-gray-900 truncate">
            {device.name || device.serial_number}
          </h3>
          <p className="text-sm text-gray-500 truncate">{device.serial_number}</p>
        </div>
        <div className="flex items-center gap-1">
          <span className={`w-2 h-2 rounded-full ${statusColor}`}></span>
          <span className="text-xs text-gray-500">{statusText}</span>
        </div>
      </div>

      {position && (
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-gray-500">Speed</span>
            <p className="font-medium">{position.speed?.toFixed(0) || 0} km/h</p>
          </div>
          <div>
            <span className="text-gray-500">Battery</span>
            <p className="font-medium">{position.battery || '--'}%</p>
          </div>
        </div>
      )}

      {device.last_seen_at && (
        <p className="mt-2 text-xs text-gray-400">
          Last seen {formatDistanceToNow(new Date(device.last_seen_at), { addSuffix: true })}
        </p>
      )}
    </div>
  );
}

export default function DeviceList({ onDeviceClick }) {
  const { devices, positions, selectedDeviceId, selectDevice, isLoading } = useDevicesStore();

  const handleDeviceSelect = (deviceId) => {
    selectDevice(deviceId);
    if (onDeviceClick) {
      onDeviceClick();
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 text-center text-gray-500">
        Loading devices...
      </div>
    );
  }

  if (devices.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        No devices found
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {devices.map((device) => (
        <DeviceCard
          key={device.id}
          device={device}
          position={positions[device.id]}
          isSelected={selectedDeviceId === device.id}
          onSelect={handleDeviceSelect}
        />
      ))}
    </div>
  );
}
