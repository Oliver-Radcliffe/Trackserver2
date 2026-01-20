import { useState, useEffect, useRef, useCallback } from 'react';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import Layout from '../components/layout/Layout';
import HistoryMap from '../components/map/HistoryMap';
import useDevicesStore from '../stores/devicesStore';
import { devicesApi } from '../api/client';

export default function HistoryPage() {
  const { devices, fetchDevices } = useDevicesStore();

  // Selection state
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 1), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  // Data state
  const [positions, setPositions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackIndex, setPlaybackIndex] = useState(null);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const playbackRef = useRef(null);

  // Stats
  const [stats, setStats] = useState(null);

  // Fetch devices on mount
  useEffect(() => {
    fetchDevices();
  }, []);

  // Auto-select first device
  useEffect(() => {
    if (devices.length > 0 && !selectedDeviceId) {
      setSelectedDeviceId(devices[0].id);
    }
  }, [devices, selectedDeviceId]);

  // Fetch positions when device or date changes
  const fetchPositions = useCallback(async () => {
    if (!selectedDeviceId) return;

    setIsLoading(true);
    setError(null);
    setPositions([]);
    setStats(null);
    stopPlayback();

    try {
      const start = startOfDay(new Date(startDate)).toISOString();
      const end = endOfDay(new Date(endDate)).toISOString();

      const response = await devicesApi.getPositions(selectedDeviceId, {
        from: start,
        to: end,
        limit: 10000,
      });

      const positionData = response.positions || [];
      setPositions(positionData);

      // Calculate stats
      if (positionData.length > 0) {
        const totalDistance = calculateDistance(positionData);
        const maxSpeed = Math.max(...positionData.map(p => p.speed || 0));
        const avgSpeed = positionData.reduce((sum, p) => sum + (p.speed || 0), 0) / positionData.length;
        const duration = new Date(positionData[positionData.length - 1].timestamp) -
                        new Date(positionData[0].timestamp);

        setStats({
          points: positionData.length,
          distance: totalDistance,
          maxSpeed,
          avgSpeed,
          duration,
        });
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to fetch positions');
    } finally {
      setIsLoading(false);
    }
  }, [selectedDeviceId, startDate, endDate]);

  // Calculate total distance in km (Haversine formula)
  const calculateDistance = (positions) => {
    let total = 0;
    for (let i = 1; i < positions.length; i++) {
      const lat1 = positions[i - 1].latitude * Math.PI / 180;
      const lat2 = positions[i].latitude * Math.PI / 180;
      const dLat = lat2 - lat1;
      const dLon = (positions[i].longitude - positions[i - 1].longitude) * Math.PI / 180;

      const a = Math.sin(dLat / 2) ** 2 +
                Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      total += 6371 * c; // Earth radius in km
    }
    return total;
  };

  // Format duration
  const formatDuration = (ms) => {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  };

  // Playback controls
  const startPlayback = () => {
    if (positions.length === 0) return;

    setIsPlaying(true);
    if (playbackIndex === null || playbackIndex >= positions.length - 1) {
      setPlaybackIndex(0);
    }
  };

  const stopPlayback = () => {
    setIsPlaying(false);
    if (playbackRef.current) {
      clearInterval(playbackRef.current);
      playbackRef.current = null;
    }
  };

  const resetPlayback = () => {
    stopPlayback();
    setPlaybackIndex(null);
  };

  // Playback timer
  useEffect(() => {
    if (isPlaying && positions.length > 0) {
      playbackRef.current = setInterval(() => {
        setPlaybackIndex(prev => {
          if (prev === null) return 0;
          if (prev >= positions.length - 1) {
            stopPlayback();
            return prev;
          }
          return prev + 1;
        });
      }, 1000 / playbackSpeed);
    }

    return () => {
      if (playbackRef.current) {
        clearInterval(playbackRef.current);
      }
    };
  }, [isPlaying, playbackSpeed, positions.length]);

  // Handle point click on map
  const handlePointClick = (index) => {
    stopPlayback();
    setPlaybackIndex(index);
  };

  // Get selected device
  const selectedDevice = devices.find(d => d.id === selectedDeviceId);

  return (
    <Layout>
      <div className="flex h-full">
        {/* Sidebar */}
        <div className="w-80 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
          {/* Controls */}
          <div className="p-4 border-b border-gray-200 space-y-4">
            <h2 className="font-semibold text-gray-900">Track History</h2>

            {/* Device selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Device
              </label>
              <select
                value={selectedDeviceId || ''}
                onChange={(e) => setSelectedDeviceId(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                <option value="">Select device...</option>
                {devices.map(device => (
                  <option key={device.id} value={device.id}>
                    {device.name || device.serial_number}
                  </option>
                ))}
              </select>
            </div>

            {/* Date range */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  From
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  To
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                />
              </div>
            </div>

            {/* Load button */}
            <button
              onClick={fetchPositions}
              disabled={!selectedDeviceId || isLoading}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? 'Loading...' : 'Load Track'}
            </button>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
                {error}
              </div>
            )}
          </div>

          {/* Stats */}
          {stats && (
            <div className="p-4 border-b border-gray-200 bg-gray-50">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Track Statistics</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-gray-500">Points</p>
                  <p className="font-semibold">{stats.points}</p>
                </div>
                <div>
                  <p className="text-gray-500">Distance</p>
                  <p className="font-semibold">{stats.distance.toFixed(2)} km</p>
                </div>
                <div>
                  <p className="text-gray-500">Max Speed</p>
                  <p className="font-semibold">{stats.maxSpeed.toFixed(0)} km/h</p>
                </div>
                <div>
                  <p className="text-gray-500">Avg Speed</p>
                  <p className="font-semibold">{stats.avgSpeed.toFixed(0)} km/h</p>
                </div>
                <div className="col-span-2">
                  <p className="text-gray-500">Duration</p>
                  <p className="font-semibold">{formatDuration(stats.duration)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Playback controls */}
          {positions.length > 0 && (
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Playback</h3>
              <div className="flex items-center gap-2 mb-2">
                <button
                  onClick={isPlaying ? stopPlayback : startPlayback}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 px-3 rounded-lg text-sm font-medium transition-colors"
                >
                  {isPlaying ? '⏸ Pause' : '▶ Play'}
                </button>
                <button
                  onClick={resetPlayback}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 px-3 rounded-lg text-sm font-medium transition-colors"
                >
                  ⏹ Reset
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Speed:</span>
                <select
                  value={playbackSpeed}
                  onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                  className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                >
                  <option value={0.5}>0.5x</option>
                  <option value={1}>1x</option>
                  <option value={2}>2x</option>
                  <option value={5}>5x</option>
                  <option value={10}>10x</option>
                </select>
              </div>
              {playbackIndex !== null && (
                <div className="mt-2 text-sm text-gray-600">
                  Position {playbackIndex + 1} of {positions.length}
                </div>
              )}
            </div>
          )}

          {/* Position list */}
          <div className="flex-1 overflow-y-auto">
            {positions.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {positions.map((pos, idx) => (
                  <div
                    key={pos.id || idx}
                    onClick={() => handlePointClick(idx)}
                    className={`p-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                      playbackIndex === idx ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {new Date(pos.timestamp).toLocaleTimeString()}
                        </p>
                        <p className="text-xs text-gray-500">
                          {pos.latitude.toFixed(5)}, {pos.longitude.toFixed(5)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">{pos.speed?.toFixed(0) || 0} km/h</p>
                        <p className="text-xs text-gray-500">{pos.battery || '--'}%</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : !isLoading && selectedDeviceId ? (
              <div className="p-4 text-center text-gray-500 text-sm">
                No positions found for selected period.
                <br />
                Click "Load Track" to fetch data.
              </div>
            ) : null}
          </div>
        </div>

        {/* Map */}
        <div className="flex-1">
          <HistoryMap
            positions={positions}
            playbackIndex={playbackIndex}
            onPointClick={handlePointClick}
          />
        </div>
      </div>
    </Layout>
  );
}
