import { create } from 'zustand';
import { devicesApi, authApi } from '../api/client';
import wsClient from '../api/websocket';

const MAX_TRAIL_LENGTH = 10;

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
    set({ selectedDeviceId: deviceId });
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
}));

export default useDevicesStore;
