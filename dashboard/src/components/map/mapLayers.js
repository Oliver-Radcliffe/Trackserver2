/**
 * Map tile layer configurations for Leaflet
 * Based on ciView Maps.xml and additional free providers
 */

export const mapLayers = [
  // OpenStreetMap variants
  {
    id: 'osm',
    name: 'OpenStreetMap',
    category: 'Street Maps',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  },
  {
    id: 'osm-hot',
    name: 'OSM Humanitarian',
    category: 'Street Maps',
    url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, Tiles by HOT',
    maxZoom: 19,
  },

  // CartoDB / Carto
  {
    id: 'carto-positron',
    name: 'CartoDB Positron',
    category: 'Light',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
    maxZoom: 20,
  },
  {
    id: 'carto-dark',
    name: 'CartoDB Dark',
    category: 'Dark',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
    maxZoom: 20,
  },
  {
    id: 'carto-voyager',
    name: 'CartoDB Voyager',
    category: 'Street Maps',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
    maxZoom: 20,
  },

  // Esri / ArcGIS
  {
    id: 'esri-street',
    name: 'Esri Street Map',
    category: 'Street Maps',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri',
    maxZoom: 19,
  },
  {
    id: 'esri-satellite',
    name: 'Esri Satellite',
    category: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri',
    maxZoom: 19,
  },
  {
    id: 'esri-topo',
    name: 'Esri Topographic',
    category: 'Terrain',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri',
    maxZoom: 19,
  },
  {
    id: 'esri-natgeo',
    name: 'National Geographic',
    category: 'Terrain',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri, National Geographic',
    maxZoom: 16,
  },
  {
    id: 'esri-relief',
    name: 'Esri Shaded Relief',
    category: 'Terrain',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri',
    maxZoom: 13,
  },
  {
    id: 'esri-gray',
    name: 'Esri Light Gray',
    category: 'Light',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri',
    maxZoom: 16,
  },

  // Stadia Maps (successor to Stamen)
  {
    id: 'stadia-terrain',
    name: 'Stadia Terrain',
    category: 'Terrain',
    url: 'https://tiles.stadiamaps.com/tiles/stamen_terrain/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>, &copy; <a href="https://stamen.com/">Stamen Design</a>',
    maxZoom: 18,
  },
  {
    id: 'stadia-toner',
    name: 'Stadia Toner',
    category: 'Monochrome',
    url: 'https://tiles.stadiamaps.com/tiles/stamen_toner/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>, &copy; <a href="https://stamen.com/">Stamen Design</a>',
    maxZoom: 20,
  },
  {
    id: 'stadia-watercolor',
    name: 'Stadia Watercolor',
    category: 'Artistic',
    url: 'https://tiles.stadiamaps.com/tiles/stamen_watercolor/{z}/{x}/{y}.jpg',
    attribution: '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>, &copy; <a href="https://stamen.com/">Stamen Design</a>',
    maxZoom: 16,
  },

  // OpenTopoMap
  {
    id: 'opentopomap',
    name: 'OpenTopoMap',
    category: 'Terrain',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
    maxZoom: 17,
  },

  // CyclOSM - cycling map
  {
    id: 'cyclosm',
    name: 'CyclOSM (Cycling)',
    category: 'Special',
    url: 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.cyclosm.org">CyclOSM</a>',
    maxZoom: 19,
  },
];

// Get layers grouped by category
export function getLayersByCategory() {
  const categories = {};
  mapLayers.forEach(layer => {
    if (!categories[layer.category]) {
      categories[layer.category] = [];
    }
    categories[layer.category].push(layer);
  });
  return categories;
}

// Get default layer
export function getDefaultLayer() {
  return mapLayers.find(l => l.id === 'osm');
}

// Get layer by ID
export function getLayerById(id) {
  return mapLayers.find(l => l.id === id) || getDefaultLayer();
}
