import { useState, useRef, useEffect, useMemo, useCallback } from 'react';

export default function TimelineBar({
  positions,
  selectedDate,
  onTimeRangeChange,
  onTimeClick,
  playbackIndex
}) {
  const containerRef = useRef(null);
  const [isDragging, setIsDragging] = useState(null); // 'start', 'end', 'playback', or null
  const [timeRange, setTimeRange] = useState({ start: 0, end: 24 }); // Hours (0-24)
  const [containerWidth, setContainerWidth] = useState(0);

  // Update container width on resize
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // Calculate max speed for scaling
  const maxSpeed = useMemo(() => {
    if (!positions || positions.length === 0) return 100;
    return Math.max(...positions.map(p => p.speed || 0), 1);
  }, [positions]);

  // Group positions into time buckets (every 10 minutes = 144 buckets per day)
  const speedBuckets = useMemo(() => {
    const buckets = new Array(144).fill(0); // 24 hours * 6 (10-min intervals)

    if (!positions || positions.length === 0) return buckets;

    positions.forEach(pos => {
      const date = new Date(pos.timestamp);
      const minutes = date.getHours() * 60 + date.getMinutes();
      const bucketIndex = Math.floor(minutes / 10);
      if (bucketIndex >= 0 && bucketIndex < 144) {
        // Take the max speed in each bucket
        buckets[bucketIndex] = Math.max(buckets[bucketIndex], pos.speed || 0);
      }
    });

    return buckets;
  }, [positions]);

  // Convert hour to pixel position
  const hourToPixel = useCallback((hour) => {
    return (hour / 24) * containerWidth;
  }, [containerWidth]);

  // Convert pixel to hour
  const pixelToHour = useCallback((pixel) => {
    return Math.max(0, Math.min(24, (pixel / containerWidth) * 24));
  }, [containerWidth]);

  // Find closest position index to a given hour
  const findClosestPositionIndex = useCallback((hour) => {
    if (!positions || positions.length === 0) return 0;

    const targetMinutes = hour * 60;
    let closestIndex = 0;
    let closestDiff = Infinity;

    positions.forEach((pos, idx) => {
      const date = new Date(pos.timestamp);
      const posMinutes = date.getHours() * 60 + date.getMinutes();
      const diff = Math.abs(posMinutes - targetMinutes);
      if (diff < closestDiff) {
        closestDiff = diff;
        closestIndex = idx;
      }
    });

    return closestIndex;
  }, [positions]);

  // Handle mouse down on slider handles
  const handleMouseDown = (handle) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(handle);
  };

  // Handle mouse move
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e) => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const hour = pixelToHour(x);

      if (isDragging === 'start') {
        setTimeRange(prev => ({ ...prev, start: Math.min(hour, prev.end - 0.5) }));
      } else if (isDragging === 'end') {
        setTimeRange(prev => ({ ...prev, end: Math.max(hour, prev.start + 0.5) }));
      } else if (isDragging === 'playback') {
        // Find closest position and notify parent
        const index = findClosestPositionIndex(hour);
        if (onTimeClick) {
          onTimeClick(index);
        }
      }
    };

    const handleMouseUp = () => {
      if (isDragging === 'start' || isDragging === 'end') {
        // Notify parent of time range change
        if (onTimeRangeChange) {
          onTimeRangeChange(timeRange);
        }
      }
      setIsDragging(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, pixelToHour, onTimeRangeChange, onTimeClick, timeRange, findClosestPositionIndex]);

  // Notify parent when time range changes
  useEffect(() => {
    if (onTimeRangeChange && !isDragging) {
      onTimeRangeChange(timeRange);
    }
  }, [timeRange, onTimeRangeChange, isDragging]);

  // Handle click on timeline to jump to that time
  const handleTimelineClick = (e) => {
    if (isDragging) return;
    if (!containerRef.current || !onTimeClick) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const hour = pixelToHour(x);

    const index = findClosestPositionIndex(hour);
    onTimeClick(index);
  };

  // Get current playback time position
  const playbackTimePosition = useMemo(() => {
    if (playbackIndex === null || !positions || !positions[playbackIndex]) return null;
    const date = new Date(positions[playbackIndex].timestamp);
    const hour = date.getHours() + date.getMinutes() / 60;
    return hourToPixel(hour);
  }, [playbackIndex, positions, hourToPixel]);

  // Format hour for display
  const formatHour = (hour) => {
    const h = Math.floor(hour);
    const m = Math.floor((hour % 1) * 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-white border-b border-gray-200 px-4 py-2" style={{ height: '10vh', minHeight: '70px', maxHeight: '100px' }}>
      <div className="h-full flex flex-col">
        {/* Time labels */}
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>00:00</span>
          <span>06:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>24:00</span>
        </div>

        {/* Timeline container */}
        <div
          ref={containerRef}
          className="flex-1 relative bg-gray-100 rounded cursor-pointer"
          onClick={handleTimelineClick}
        >
          {/* Speed bars */}
          <div className="absolute inset-0 flex items-end pointer-events-none">
            {speedBuckets.map((speed, idx) => {
              const height = speed > 0 ? Math.max(4, (speed / maxSpeed) * 100) : 0;
              const bucketHour = (idx * 10) / 60;
              const isInRange = bucketHour >= timeRange.start && bucketHour <= timeRange.end;

              return (
                <div
                  key={idx}
                  className="flex-1"
                  style={{ height: '100%', display: 'flex', alignItems: 'flex-end' }}
                >
                  <div
                    className={`w-full transition-colors ${
                      isInRange
                        ? speed > 80 ? 'bg-red-500' : speed > 40 ? 'bg-orange-400' : 'bg-blue-400'
                        : 'bg-gray-300'
                    }`}
                    style={{
                      height: `${height}%`,
                      minHeight: speed > 0 ? '2px' : '0'
                    }}
                  />
                </div>
              );
            })}
          </div>

          {/* Selection overlay - dim areas outside range */}
          <div
            className="absolute inset-y-0 left-0 bg-gray-900/30 pointer-events-none"
            style={{ width: hourToPixel(timeRange.start) }}
          />
          <div
            className="absolute inset-y-0 right-0 bg-gray-900/30 pointer-events-none"
            style={{ width: containerWidth - hourToPixel(timeRange.end) }}
          />

          {/* Start handle - larger hit area */}
          <div
            className="absolute top-0 bottom-0 cursor-ew-resize group"
            style={{ left: hourToPixel(timeRange.start) - 12, width: 24 }}
            onMouseDown={handleMouseDown('start')}
          >
            <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-4 bg-blue-600 hover:bg-blue-700 group-hover:bg-blue-700 rounded-l flex items-center justify-center shadow-md">
              <div className="w-0.5 h-6 bg-white/80 rounded" />
              <div className="w-0.5 h-6 bg-white/80 rounded ml-1" />
            </div>
          </div>

          {/* End handle - larger hit area */}
          <div
            className="absolute top-0 bottom-0 cursor-ew-resize group"
            style={{ left: hourToPixel(timeRange.end) - 12, width: 24 }}
            onMouseDown={handleMouseDown('end')}
          >
            <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-4 bg-blue-600 hover:bg-blue-700 group-hover:bg-blue-700 rounded-r flex items-center justify-center shadow-md">
              <div className="w-0.5 h-6 bg-white/80 rounded" />
              <div className="w-0.5 h-6 bg-white/80 rounded ml-1" />
            </div>
          </div>

          {/* Playback position indicator - draggable with large hit area */}
          {playbackTimePosition !== null && (
            <div
              className="absolute top-0 bottom-0 cursor-grab active:cursor-grabbing group"
              style={{ left: playbackTimePosition - 14, width: 28 }}
              onMouseDown={handleMouseDown('playback')}
            >
              {/* Line */}
              <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-1 bg-red-600 group-hover:w-1.5 transition-all" />
              {/* Top handle - triangle */}
              <div className="absolute left-1/2 -translate-x-1/2 -top-1 w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[10px] border-t-red-600 group-hover:border-t-red-700" />
              {/* Bottom handle - triangle */}
              <div className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-b-[10px] border-b-red-600 group-hover:border-b-red-700" />
              {/* Glow effect on hover */}
              <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-3 bg-red-400/0 group-hover:bg-red-400/30 transition-all rounded" />
            </div>
          )}

          {/* Hour grid lines */}
          {[6, 12, 18].map(hour => (
            <div
              key={hour}
              className="absolute top-0 bottom-0 w-px bg-gray-300 pointer-events-none"
              style={{ left: hourToPixel(hour) }}
            />
          ))}
        </div>

        {/* Selected time range display */}
        <div className="flex justify-between items-center mt-1">
          <span className="text-xs font-medium text-blue-600">
            {formatHour(timeRange.start)}
          </span>
          <span className="text-xs text-gray-500">
            {playbackIndex !== null && positions[playbackIndex] ? (
              <span className="text-red-600 font-medium">
                {new Date(positions[playbackIndex].timestamp).toLocaleTimeString()}
              </span>
            ) : (
              `${positions.length} points`
            )}
          </span>
          <span className="text-xs font-medium text-blue-600">
            {formatHour(timeRange.end)}
          </span>
        </div>
      </div>
    </div>
  );
}
