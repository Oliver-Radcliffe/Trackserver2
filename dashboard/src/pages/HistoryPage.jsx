import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import Layout from '../components/layout/Layout';
import HistoryMap from '../components/map/HistoryMap';
import TimelineBar from '../components/timeline/TimelineBar';
import DatePickerWithData from '../components/common/DatePickerWithData';
import useDevicesStore from '../stores/devicesStore';
import { devicesApi } from '../api/client';

export default function HistoryPage() {
  const { devices, fetchDevices } = useDevicesStore();

  // Selection state
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 1), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  // Dates with data (for calendar highlighting)
  const [datesWithData, setDatesWithData] = useState([]);
  const [loadingDates, setLoadingDates] = useState(false);

  // Data state
  const [positions, setPositions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Time range filter state
  const [timeRange, setTimeRange] = useState({ start: 0, end: 24 });

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackIndex, setPlaybackIndex] = useState(null);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const playbackRef = useRef(null);

  // Stats
  const [stats, setStats] = useState(null);

  // UI state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);
  const [followTarget, setFollowTarget] = useState(false);

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

  // Fetch dates with data when device changes
  useEffect(() => {
    if (!selectedDeviceId) {
      setDatesWithData([]);
      return;
    }

    const fetchDatesWithData = async () => {
      setLoadingDates(true);
      try {
        const response = await devicesApi.getDatesWithData(selectedDeviceId);
        setDatesWithData(response.dates || []);

        // Auto-select the most recent date with data
        if (response.dates && response.dates.length > 0) {
          const lastDate = response.dates[response.dates.length - 1];
          setStartDate(lastDate);
          setEndDate(lastDate);
        }
      } catch (err) {
        console.error('Failed to fetch dates with data:', err);
        setDatesWithData([]);
      } finally {
        setLoadingDates(false);
      }
    };

    fetchDatesWithData();
  }, [selectedDeviceId]);

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

  // Filter positions based on time range
  const filteredPositions = useMemo(() => {
    if (!positions || positions.length === 0) return [];

    return positions.filter(pos => {
      const date = new Date(pos.timestamp);
      const hour = date.getHours() + date.getMinutes() / 60;
      return hour >= timeRange.start && hour <= timeRange.end;
    });
  }, [positions, timeRange]);

  // Playback controls
  const startPlayback = () => {
    if (filteredPositions.length === 0) return;

    setIsPlaying(true);
    if (playbackIndex === null || playbackIndex >= filteredPositions.length - 1) {
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
    if (isPlaying && filteredPositions.length > 0) {
      playbackRef.current = setInterval(() => {
        setPlaybackIndex(prev => {
          if (prev === null) return 0;
          if (prev >= filteredPositions.length - 1) {
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
  }, [isPlaying, playbackSpeed, filteredPositions.length]);

  // Handle point click on map
  const handlePointClick = (index) => {
    stopPlayback();
    setPlaybackIndex(index);
  };

  // Get selected device
  const selectedDevice = devices.find(d => d.id === selectedDeviceId);

  // Handle time range change from timeline
  const handleTimeRangeChange = useCallback((newRange) => {
    setTimeRange(newRange);
    // Reset playback when range changes
    setPlaybackIndex(null);
  }, []);

  // Handle click on timeline to jump to position
  const handleTimelineClick = useCallback((index) => {
    // Find the index in filtered positions
    if (filteredPositions.length > 0 && index < positions.length) {
      const clickedPos = positions[index];
      const filteredIndex = filteredPositions.findIndex(p => p.id === clickedPos.id);
      if (filteredIndex !== -1) {
        stopPlayback();
        setPlaybackIndex(filteredIndex);
      }
    }
  }, [positions, filteredPositions]);

  return (
    <Layout>
      <div className="flex h-full">
        {/* Sidebar */}
        <div className={`bg-white border-r border-gray-200 flex flex-col overflow-hidden transition-all duration-300 ${sidebarCollapsed ? 'w-12' : 'w-80'}`}>
          {/* Collapse toggle */}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-2 hover:bg-gray-100 border-b border-gray-200 flex items-center justify-center"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg className={`w-5 h-5 text-gray-600 transition-transform ${sidebarCollapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>

          {!sidebarCollapsed && (
            <>
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
              <DatePickerWithData
                label="From"
                value={startDate}
                onChange={setStartDate}
                datesWithData={datesWithData}
                disabled={loadingDates}
              />
              <DatePickerWithData
                label="To"
                value={endDate}
                onChange={setEndDate}
                datesWithData={datesWithData}
                disabled={loadingDates}
              />
            </div>

            {/* Dates with data indicator */}
            {loadingDates && (
              <div className="text-sm text-gray-500">Loading available dates...</div>
            )}
            {!loadingDates && datesWithData.length === 0 && selectedDeviceId && (
              <div className="text-sm text-orange-600 bg-orange-50 p-2 rounded">
                No historical data found for this device.
              </div>
            )}
            {!loadingDates && datesWithData.length > 0 && (
              <div className="text-sm text-green-600 bg-green-50 p-2 rounded">
                {datesWithData.length} day{datesWithData.length !== 1 ? 's' : ''} with data available
              </div>
            )}

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
          {filteredPositions.length > 0 && (
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
                  Position {playbackIndex + 1} of {filteredPositions.length}
                </div>
              )}
            </div>
          )}

          {/* Position list */}
          <div className="flex-1 overflow-y-auto">
            {filteredPositions.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {filteredPositions.map((pos, idx) => (
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
            ) : positions.length > 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">
                No positions in selected time range.
                <br />
                Adjust the timeline sliders above.
              </div>
            ) : !isLoading && selectedDeviceId ? (
              <div className="p-4 text-center text-gray-500 text-sm">
                No positions found for selected period.
                <br />
                Click "Load Track" to fetch data.
              </div>
            ) : null}
          </div>
            </>
          )}
        </div>

        {/* Map area with timeline */}
        <div className="flex-1 flex flex-col">
          {/* Timeline bar with collapse toggle */}
          {positions.length > 0 && (
            <div className={`bg-white border-b border-gray-200 transition-all duration-300 ${timelineCollapsed ? 'h-8' : ''}`}>
              {/* Timeline collapse toggle */}
              <div className="flex items-center justify-between px-2 h-8 border-b border-gray-100">
                <span className="text-xs font-medium text-gray-600">Timeline</span>
                <button
                  onClick={() => setTimelineCollapsed(!timelineCollapsed)}
                  className="p-1 hover:bg-gray-100 rounded"
                  title={timelineCollapsed ? 'Expand timeline' : 'Collapse timeline'}
                >
                  <svg className={`w-4 h-4 text-gray-500 transition-transform ${timelineCollapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                </button>
              </div>
              {!timelineCollapsed && (
                <TimelineBar
                  positions={positions}
                  selectedDate={startDate}
                  onTimeRangeChange={handleTimeRangeChange}
                  onTimeClick={handleTimelineClick}
                  playbackIndex={playbackIndex !== null ? filteredPositions.findIndex((p, i) => i === playbackIndex) : null}
                />
              )}
            </div>
          )}

          {/* Map */}
          <div className="flex-1 relative">
            <HistoryMap
              positions={filteredPositions}
              playbackIndex={playbackIndex}
              onPointClick={handlePointClick}
              followTarget={followTarget}
            />

            {/* Map controls */}
            <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg p-2 z-[1000] flex flex-col gap-2">
              <button
                onClick={() => setFollowTarget(!followTarget)}
                className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                  followTarget
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                title={followTarget ? 'Click for free pan' : 'Click to follow target'}
              >
                {followTarget ? '🎯 Following' : '🗺️ Free Pan'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
