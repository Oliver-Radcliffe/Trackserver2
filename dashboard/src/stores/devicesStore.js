import { create } from 'zustand';
import { devicesApi, authApi } from '../api/client';
import wsClient from '../api/websocket';

const MAX_TRAIL_LENGTH = 10;

// Map control modes
const MAP_MODES = {
  FREE_PAN: 'free_pan',
  MY_LOCATION: 'my_location',
  TARGET: 'target',
  ALL_TARGETS: 'all_targets',
};

const useDevicesStore = create((set, get) => ({
  devices: [],
  positions: {}, // Map of deviceId -> latest position
  positionTrails: {}, // Map of deviceId -> array of last N positions
  selectedDeviceId: null,
  isLoading: false,
  error: null,

  // User location state
  userLocation: null, // { latitude, longitude, accuracy, timestamp }
  userLocationError: null,
  isGettingUserLocation: false,
  otherUserLocations: {}, // Map of userId -> { user_id, user_name, user_email, latitude, longitude, accuracy, timestamp }

  // Map control state
  mapMode: MAP_MODES.FREE_PAN, // Current map control mode
  selectedTargetId: null, // ID of selected target (device_xxx or user_xxx)
  selectedTargetType: null, // 'device' or 'user'

  fetchDevices: async () => {
    set({ isLoading: true, error: null });
    try {
      const devices = await devicesApi.list();
      set({ devices, isLoading: false });

      // Subscribe to all device updates
      const deviceIds = devices.map(d => d.id);
      if (deviceIds.length > 0) {
        wsClient.subscribe(deviceIds);
      }

      // Fetch latest positions for all devices
      get().fetchAllPositions(deviceIds);
    } catch (error) {
      set({
        error: error.response?.data?.detail || 'Failed to fetch devices',
        isLoading: false,
      });
    }
  },

  fetchAllPositions: async (deviceIds) => {
    const positions = { ...get().positions };

    await Promise.all(
      deviceIds.map(async (id) => {
        try {
          const position = await devicesApi.getLatestPosition(id);
          positions[id] = position;
        } catch {
          // Device may not have any positions yet
        }
      })
    );

    set({ positions });
  },

  selectDevice: (deviceId) => {
    set({
      selectedDeviceId: deviceId,
      selectedTargetId: deviceId,
      selectedTargetType: 'device',
      mapMode: MAP_MODES.TARGET,
    });
  },

  updatePosition: (deviceId, positionData) => {
    set((state) => {
      const newPosition = {
        ...state.positions[deviceId],
        ...positionData,
        device_id: deviceId,
      };

      // Update trail - add new position and keep only last N
      const currentTrail = state.positionTrails[deviceId] || [];
      const newTrail = [newPosition, ...currentTrail].slice(0, MAX_TRAIL_LENGTH);

      return {
        positions: {
          ...state.positions,
          [deviceId]: newPosition,
        },
        positionTrails: {
          ...state.positionTrails,
          [deviceId]: newTrail,
        },
        // Update last_seen_at on device
        devices: state.devices.map((d) =>
          d.id === deviceId
            ? { ...d, last_seen_at: positionData.timestamp }
            : d
        ),
      };
    });
  },

  // Initialize WebSocket listeners
  initWebSocket: () => {
    wsClient.on('position', (data) => {
      get().updatePosition(data.device_id, data.data);
    });

    wsClient.on('alert', (data) => {
      console.log('Alert received:', data);
      // Could show a notification here
    });

    wsClient.on('user_location', (data) => {
      get().updateUserLocation(data);
    });
  },

  // Fetch initial user locations from the server
  fetchUserLocations: async () => {
    try {
      const locations = await authApi.getUserLocations();
      const locationsMap = {};
      locations.forEach((loc) => {
        locationsMap[loc.user_id] = loc;
      });
      set({ otherUserLocations: locationsMap });
    } catch (err) {
      console.error('Failed to fetch user locations:', err);
    }
  },

  // Update a single user's location (from WebSocket)
  updateUserLocation: (data) => {
    set((state) => ({
      otherUserLocations: {
        ...state.otherUserLocations,
        [data.user_id]: {
          user_id: data.user_id,
          user_name: data.user_name,
          user_email: data.user_email,
          latitude: data.latitude,
          longitude: data.longitude,
          accuracy: data.accuracy,
          timestamp: data.timestamp,
        },
      },
    }));
  },

  getDeviceWithPosition: (deviceId) => {
    const state = get();
    const device = state.devices.find((d) => d.id === deviceId);
    const position = state.positions[deviceId];
    return device ? { ...device, position } : null;
  },

  getAllDevicesWithPositions: () => {
    const state = get();
    return state.devices.map((device) => ({
      ...device,
      position: state.positions[device.id],
    }));
  },

  requestUserLocation: () => {
    if (!navigator.geolocation) {
      set({ userLocationError: 'Geolocation is not supported by your browser' });
      return;
    }

    set({ isGettingUserLocation: true, userLocationError: null });

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const locationData = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        };

        set({
          userLocation: locationData,
          isGettingUserLocation: false,
          userLocationError: null,
        });

        // Share location to backend (broadcasts to other users)
        try {
          await authApi.shareLocation(
            locationData.latitude,
            locationData.longitude,
            locationData.accuracy
          );
        } catch (err) {
          console.error('Failed to share location:', err);
        }
      },
      (error) => {
        let errorMessage = 'Failed to get location';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Location permission denied';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Location unavailable';
            break;
          case error.TIMEOUT:
            errorMessage = 'Location request timed out';
            break;
        }
        set({
          userLocationError: errorMessage,
          isGettingUserLocation: false,
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  },

  clearUserLocation: () => {
    set({ userLocation: null, userLocationError: null });
  },

  // Map control functions
  setMapMode: (mode) => {
    set({ mapMode: mode });
  },

  setSelectedTarget: (targetId, targetType) => {
    set({
      selectedTargetId: targetId,
      selectedTargetType: targetType,
      mapMode: targetId ? MAP_MODES.TARGET : MAP_MODES.FREE_PAN,
    });
  },

  centerOnMyLocation: () => {
    const state = get();
    if (state.userLocation) {
      set({ mapMode: MAP_MODES.MY_LOCATION });
    } else {
      // Request location first, then set mode
      state.requestUserLocation();
      set({ mapMode: MAP_MODES.MY_LOCATION });
    }
  },

  centerOnAllTargets: () => {
    set({ mapMode: MAP_MODES.ALL_TARGETS });
  },

  setFreePan: () => {
    set({ mapMode: MAP_MODES.FREE_PAN, selectedTargetId: null, selectedTargetType: null });
  },

  // Get all targets (devices + shared user locations) for selection
  getAllTargets: () => {
    const state = get();
    const targets = [];

    // Add devices with positions
    state.devices.forEach((device) => {
      const position = state.positions[device.id];
      if (position) {
        targets.push({
          id: `device_${device.id}`,
          type: 'device',
          name: device.name || device.serial_number,
          latitude: position.latitude,
          longitude: position.longitude,
          isMoving: position.is_moving,
          isOnline: device.last_seen_at && (new Date() - new Date(device.last_seen_at)) < 5 * 60 * 1000,
          originalId: device.id,
        });
      }
    });

    // Add shared user locations
    Object.values(state.otherUserLocations).forEach((userLoc) => {
      targets.push({
        id: `user_${userLoc.user_id}`,
        type: 'user',
        name: userLoc.user_name || userLoc.user_email || 'User',
        latitude: userLoc.latitude,
        longitude: userLoc.longitude,
        isMoving: false,
        isOnline: true,
        originalId: userLoc.user_id,
      });
    });

    return targets;
  },

  // Get the currently selected target position
  getSelectedTargetPosition: () => {
    const state = get();
    if (!state.selectedTargetId || !state.selectedTargetType) return null;

    if (state.selectedTargetType === 'device') {
      const position = state.positions[state.selectedTargetId];
      return position ? { latitude: position.latitude, longitude: position.longitude } : null;
    } else if (state.selectedTargetType === 'user') {
      const userLoc = state.otherUserLocations[state.selectedTargetId];
      return userLoc ? { latitude: userLoc.latitude, longitude: userLoc.longitude } : null;
    }
    return null;
  },
}));

export { MAP_MODES };

export default useDevicesStore;
