import { useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import Layout from '../components/layout/Layout';
import useDevicesStore from '../stores/devicesStore';

export default function DevicesPage() {
  const { devices, positions, fetchDevices, isLoading } = useDevicesStore();

  useEffect(() => {
    fetchDevices();
  }, []);

  return (
    <Layout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Devices</h1>
            <p className="text-gray-500">Manage your tracking devices</p>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-gray-500">Loading...</div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Device
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Position
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Battery
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Seen
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {devices.map((device) => {
                  const position = positions[device.id];
                  const isOnline = device.last_seen_at &&
                    (new Date() - new Date(device.last_seen_at)) < 5 * 60 * 1000;

                  return (
                    <tr key={device.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="font-medium text-gray-900">
                            {device.name || device.serial_number}
                          </div>
                          <div className="text-sm text-gray-500">{device.serial_number}</div>
                          <div className="text-xs text-gray-400">
                            Key: 0x{device.device_key.toString(16).toUpperCase().padStart(8, '0')}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          isOnline
                            ? position?.is_moving
                              ? 'bg-green-100 text-green-800'
                              : 'bg-blue-100 text-blue-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {isOnline
                            ? position?.is_moving ? 'Moving' : 'Stationary'
                            : 'Offline'
                          }
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {position ? (
                          <div>
                            <div>{position.latitude.toFixed(5)}, {position.longitude.toFixed(5)}</div>
                            <div className="text-xs">{position.speed?.toFixed(0) || 0} km/h</div>
                          </div>
                        ) : (
                          '--'
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {position?.battery !== undefined ? (
                          <div className="flex items-center">
                            <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                              <div
                                className={`h-2 rounded-full ${
                                  position.battery > 50
                                    ? 'bg-green-500'
                                    : position.battery > 20
                                    ? 'bg-yellow-500'
                                    : 'bg-red-500'
                                }`}
                                style={{ width: `${position.battery}%` }}
                              ></div>
                            </div>
                            <span className="text-sm text-gray-600">{position.battery}%</span>
                          </div>
                        ) : (
                          '--'
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {device.last_seen_at
                          ? formatDistanceToNow(new Date(device.last_seen_at), { addSuffix: true })
                          : 'Never'
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
