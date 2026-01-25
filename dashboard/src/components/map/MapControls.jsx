import { useState, useRef, useEffect } from 'react';
import useDevicesStore, { MAP_MODES } from '../../stores/devicesStore';

export default function MapControls() {
  const {
    mapMode,
    setMapMode,
    selectedTargetId,
    selectedTargetType,
    setSelectedTarget,
    centerOnMyLocation,
    centerOnAllTargets,
    setFreePan,
    getAllTargets,
    userLocation,
    isGettingUserLocation,
  } = useDevicesStore();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [targetDropdownOpen, setTargetDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const targetDropdownRef = useRef(null);

  const targets = getAllTargets();

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
      if (targetDropdownRef.current && !targetDropdownRef.current.contains(event.target)) {
        setTargetDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getModeLabel = () => {
    switch (mapMode) {
      case MAP_MODES.MY_LOCATION:
        return 'My Location';
      case MAP_MODES.TARGET:
        return 'Target';
      case MAP_MODES.ALL_TARGETS:
        return 'All Targets';
      case MAP_MODES.FREE_PAN:
      default:
        return 'Free Pan';
    }
  };

  const getModeIcon = () => {
    switch (mapMode) {
      case MAP_MODES.MY_LOCATION:
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" fill="currentColor" />
            <path strokeLinecap="round" d="M12 2v3m0 14v3m10-10h-3M5 12H2" />
          </svg>
        );
      case MAP_MODES.TARGET:
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="6" />
            <circle cx="12" cy="12" r="2" fill="currentColor" />
          </svg>
        );
      case MAP_MODES.ALL_TARGETS:
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8" cy="8" r="2" fill="currentColor" />
            <circle cx="16" cy="16" r="2" fill="currentColor" />
            <circle cx="16" cy="8" r="2" fill="currentColor" />
          </svg>
        );
      case MAP_MODES.FREE_PAN:
      default:
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 11l5-5m0 0l5 5m-5-5v12" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 13l-5 5m0 0l-5-5" />
          </svg>
        );
    }
  };

  const getSelectedTargetName = () => {
    if (!selectedTargetId) return 'Select target...';
    const target = targets.find(
      (t) => t.originalId === selectedTargetId && t.type === selectedTargetType
    );
    return target ? target.name : 'Select target...';
  };

  const handleModeSelect = (mode) => {
    switch (mode) {
      case MAP_MODES.MY_LOCATION:
        centerOnMyLocation();
        break;
      case MAP_MODES.ALL_TARGETS:
        centerOnAllTargets();
        break;
      case MAP_MODES.FREE_PAN:
        setFreePan();
        break;
      case MAP_MODES.TARGET:
        setMapMode(MAP_MODES.TARGET);
        break;
    }
    setDropdownOpen(false);
  };

  const handleTargetSelect = (target) => {
    setSelectedTarget(target.originalId, target.type);
    setTargetDropdownOpen(false);
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Mode selector */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="bg-white rounded-lg shadow-lg p-2 lg:p-3 hover:bg-gray-100 transition-colors flex items-center gap-2 min-w-[44px]"
          title={getModeLabel()}
        >
          {isGettingUserLocation && mapMode === MAP_MODES.MY_LOCATION ? (
            <svg className="w-5 h-5 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            <span className="text-blue-600">{getModeIcon()}</span>
          )}
          <span className="hidden lg:inline text-sm font-medium text-gray-700">{getModeLabel()}</span>
          <svg className="w-4 h-4 text-gray-500 hidden lg:block" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Mode dropdown - opens upward */}
        {dropdownOpen && (
          <div className="absolute bottom-full left-0 mb-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[180px] z-[1001]">
            <button
              onClick={() => handleModeSelect(MAP_MODES.MY_LOCATION)}
              className={`w-full px-4 py-2 text-left text-sm flex items-center gap-3 hover:bg-gray-100 ${
                mapMode === MAP_MODES.MY_LOCATION ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
              }`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" fill="currentColor" />
                <path strokeLinecap="round" d="M12 2v3m0 14v3m10-10h-3M5 12H2" />
              </svg>
              Center on My Location
            </button>
            <button
              onClick={() => handleModeSelect(MAP_MODES.TARGET)}
              className={`w-full px-4 py-2 text-left text-sm flex items-center gap-3 hover:bg-gray-100 ${
                mapMode === MAP_MODES.TARGET ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
              }`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="6" />
                <circle cx="12" cy="12" r="2" fill="currentColor" />
              </svg>
              Center on Target
            </button>
            <button
              onClick={() => handleModeSelect(MAP_MODES.ALL_TARGETS)}
              className={`w-full px-4 py-2 text-left text-sm flex items-center gap-3 hover:bg-gray-100 ${
                mapMode === MAP_MODES.ALL_TARGETS ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
              }`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8" cy="8" r="2" fill="currentColor" />
                <circle cx="16" cy="16" r="2" fill="currentColor" />
                <circle cx="16" cy="8" r="2" fill="currentColor" />
              </svg>
              Center on All Targets
            </button>
            <div className="border-t border-gray-200 my-1"></div>
            <button
              onClick={() => handleModeSelect(MAP_MODES.FREE_PAN)}
              className={`w-full px-4 py-2 text-left text-sm flex items-center gap-3 hover:bg-gray-100 ${
                mapMode === MAP_MODES.FREE_PAN ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
              }`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 11l5-5m0 0l5 5m-5-5v12" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 13l-5 5m0 0l-5-5" />
              </svg>
              Free Pan
            </button>
          </div>
        )}
      </div>

      {/* Target selector (shown when in TARGET mode) */}
      {mapMode === MAP_MODES.TARGET && (
        <div className="relative" ref={targetDropdownRef}>
          <button
            onClick={() => setTargetDropdownOpen(!targetDropdownOpen)}
            className="bg-white rounded-lg shadow-lg p-2 lg:p-3 hover:bg-gray-100 transition-colors flex items-center gap-2 w-full"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-sm text-gray-700 truncate flex-1 text-left">{getSelectedTargetName()}</span>
            <svg className="w-4 h-4 text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Target dropdown - opens upward */}
          {targetDropdownOpen && (
            <div className="absolute bottom-full left-0 mb-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 w-full max-h-60 overflow-y-auto z-[1001]">
              {targets.length === 0 ? (
                <div className="px-4 py-2 text-sm text-gray-500">No targets available</div>
              ) : (
                <>
                  {/* Devices section */}
                  {targets.filter((t) => t.type === 'device').length > 0 && (
                    <>
                      <div className="px-4 py-1 text-xs font-semibold text-gray-400 uppercase">Devices</div>
                      {targets
                        .filter((t) => t.type === 'device')
                        .map((target) => (
                          <button
                            key={target.id}
                            onClick={() => handleTargetSelect(target)}
                            className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 hover:bg-gray-100 ${
                              selectedTargetId === target.originalId && selectedTargetType === 'device'
                                ? 'bg-blue-50 text-blue-700'
                                : 'text-gray-700'
                            }`}
                          >
                            <span
                              className={`w-2 h-2 rounded-full ${
                                !target.isOnline
                                  ? 'bg-gray-400'
                                  : target.isMoving
                                  ? 'bg-red-500'
                                  : 'bg-blue-500'
                              }`}
                            ></span>
                            <span className="truncate">{target.name}</span>
                          </button>
                        ))}
                    </>
                  )}

                  {/* Users section */}
                  {targets.filter((t) => t.type === 'user').length > 0 && (
                    <>
                      <div className="px-4 py-1 text-xs font-semibold text-gray-400 uppercase mt-2">Shared Locations</div>
                      {targets
                        .filter((t) => t.type === 'user')
                        .map((target) => (
                          <button
                            key={target.id}
                            onClick={() => handleTargetSelect(target)}
                            className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 hover:bg-gray-100 ${
                              selectedTargetId === target.originalId && selectedTargetType === 'user'
                                ? 'bg-blue-50 text-blue-700'
                                : 'text-gray-700'
                            }`}
                          >
                            <span className="w-2 h-2 rounded-full bg-green-500"></span>
                            <span className="truncate">{target.name}</span>
                          </button>
                        ))}
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
