import { useState, useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import { mapLayers, getLayersByCategory, getLayerById } from './mapLayers';

/**
 * Map layer switcher component
 * Allows users to switch between different map tile providers
 */
export default function LayerSwitcher({ defaultLayerId = 'osm' }) {
  const map = useMap();
  const [isOpen, setIsOpen] = useState(false);
  const [currentLayerId, setCurrentLayerId] = useState(defaultLayerId);
  const [tileLayer, setTileLayer] = useState(null);
  const containerRef = useRef(null);

  const categorizedLayers = getLayersByCategory();
  const currentLayer = getLayerById(currentLayerId);

  // Create control container
  useEffect(() => {
    const container = L.DomUtil.create('div', 'leaflet-control leaflet-bar');
    container.style.cssText = 'position: absolute; top: 10px; right: 10px; z-index: 1000;';

    // Prevent map interactions when clicking on control
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);

    map.getContainer().appendChild(container);
    containerRef.current = container;

    return () => {
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
    };
  }, [map]);

  // Initialize tile layer
  useEffect(() => {
    // Load saved preference or use default
    const savedLayerId = localStorage.getItem('mapLayerId');
    const initialLayerId = (savedLayerId && getLayerById(savedLayerId)) ? savedLayerId : defaultLayerId;

    const layer = getLayerById(initialLayerId);
    const newTileLayer = L.tileLayer(layer.url, {
      attribution: layer.attribution,
      maxZoom: layer.maxZoom,
    });
    newTileLayer.addTo(map);
    setTileLayer(newTileLayer);
    setCurrentLayerId(initialLayerId);

    return () => {
      if (newTileLayer) {
        map.removeLayer(newTileLayer);
      }
    };
  }, [map, defaultLayerId]);

  // Change map layer
  const changeLayer = (layerId) => {
    const layer = getLayerById(layerId);
    if (!layer) return;

    // Remove old tile layer
    if (tileLayer) {
      map.removeLayer(tileLayer);
    }

    // Add new tile layer
    const newTileLayer = L.tileLayer(layer.url, {
      attribution: layer.attribution,
      maxZoom: layer.maxZoom,
    });
    newTileLayer.addTo(map);

    setTileLayer(newTileLayer);
    setCurrentLayerId(layerId);
    setIsOpen(false);

    // Save preference
    localStorage.setItem('mapLayerId', layerId);
  };

  // Render nothing if container not ready
  if (!containerRef.current) return null;

  return createPortal(
    <div className="bg-white rounded-lg shadow-lg">
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 hover:bg-gray-100 rounded-lg transition-colors"
        title="Change map style"
      >
        <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
        <span className="text-sm font-medium text-gray-700">
          {currentLayer.name}
        </span>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute top-full right-0 mt-1 w-64 max-h-80 overflow-y-auto bg-white rounded-lg shadow-xl border border-gray-200">
          {Object.entries(categorizedLayers).map(([category, layers]) => (
            <div key={category}>
              <div className="px-3 py-2 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 sticky top-0">
                {category}
              </div>
              {layers.map(layer => (
                <button
                  key={layer.id}
                  onClick={() => changeLayer(layer.id)}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center justify-between ${
                    currentLayerId === layer.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                  }`}
                >
                  <span>{layer.name}</span>
                  {currentLayerId === layer.id && (
                    <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>,
    containerRef.current
  );
}
