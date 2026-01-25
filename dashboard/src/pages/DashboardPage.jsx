import { useEffect, useState } from 'react';
import Layout from '../components/layout/Layout';
import TrackingMap from '../components/map/TrackingMap';
import DeviceList from '../components/devices/DeviceList';
import useDevicesStore from '../stores/devicesStore';

export default function DashboardPage() {
  const { fetchDevices, initWebSocket } = useDevicesStore();
  const [deviceSidebarOpen, setDeviceSidebarOpen] = useState(false);

  useEffect(() => {
    fetchDevices();
    initWebSocket();
  }, []);

  return (
    <Layout>
      <div className="flex h-full relative">
        {/* Mobile device sidebar toggle */}
        <button
          onClick={() => setDeviceSidebarOpen(!deviceSidebarOpen)}
          className="lg:hidden fixed top-4 right-4 z-[1000] bg-white text-gray-700 p-2 rounded-lg shadow-lg"
          aria-label="Toggle devices"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </button>

        {/* Mobile overlay */}
        {deviceSidebarOpen && (
          <div
            className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-[999]"
            onClick={() => setDeviceSidebarOpen(false)}
          />
        )}

        {/* Device sidebar */}
        <div
          className={`
            fixed lg:static inset-y-0 right-0 z-[1000] lg:z-auto
            w-80 bg-gray-50 border-l lg:border-l-0 lg:border-r border-gray-200 overflow-y-auto
            transform transition-transform duration-300 ease-in-out
            ${deviceSidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
          `}
        >
          <div className="p-4 border-b border-gray-200 bg-white sticky top-0 z-10 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-900">Devices</h2>
              <p className="text-sm text-gray-500">Click to center on map</p>
            </div>
            {/* Close button for mobile */}
            <button
              onClick={() => setDeviceSidebarOpen(false)}
              className="lg:hidden text-gray-400 hover:text-gray-600"
              aria-label="Close devices"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="p-4">
            <DeviceList onDeviceClick={() => setDeviceSidebarOpen(false)} />
          </div>
        </div>

        {/* Map */}
        <div className="flex-1 h-full">
          <TrackingMap />
        </div>
      </div>
    </Layout>
  );
}
