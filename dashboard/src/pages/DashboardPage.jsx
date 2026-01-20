import { useEffect } from 'react';
import Layout from '../components/layout/Layout';
import TrackingMap from '../components/map/TrackingMap';
import DeviceList from '../components/devices/DeviceList';
import useDevicesStore from '../stores/devicesStore';

export default function DashboardPage() {
  const { fetchDevices, initWebSocket } = useDevicesStore();

  useEffect(() => {
    fetchDevices();
    initWebSocket();
  }, []);

  return (
    <Layout>
      <div className="flex h-full">
        {/* Device sidebar */}
        <div className="w-80 bg-gray-50 border-r border-gray-200 overflow-y-auto">
          <div className="p-4 border-b border-gray-200 bg-white sticky top-0 z-10">
            <h2 className="font-semibold text-gray-900">Devices</h2>
            <p className="text-sm text-gray-500">Click to center on map</p>
          </div>
          <div className="p-4">
            <DeviceList />
          </div>
        </div>

        {/* Map */}
        <div className="flex-1">
          <TrackingMap />
        </div>
      </div>
    </Layout>
  );
}
