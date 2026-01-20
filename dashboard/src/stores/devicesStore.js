import { create } from 'zustand';
import { devicesApi } from '../api/client';
import wsClient from '../api/websocket';

const MAX_TRAIL_LENGTH = 10;

const useDevicesStore = create((set, get) => ({
  devices: [],
  positions: {}, // Map of deviceId -> latest position
  positionTrails: {}, // Map of deviceId -> array of last N positions
  selectedDeviceId: null,
  isLoading: false,
  error: null,

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
}));

export default useDevicesStore;
