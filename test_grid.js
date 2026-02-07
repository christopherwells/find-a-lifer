async function testGrid() {
  try {
    const res = await fetch('http://localhost:8000/api/grid');
    const data = await res.json();

    console.log('Response type:', data.type);
    console.log('Is FeatureCollection:', data.type === 'FeatureCollection');
    console.log('Number of features:', data.features ? data.features.length : 0);

    if (data.features && data.features.length > 0) {
      const firstFeature = data.features[0];
      console.log('First feature properties:', Object.keys(firstFeature.properties || {}));
      console.log('Has cell_id:', 'cell_id' in (firstFeature.properties || {}));
      console.log('Geometry type:', firstFeature.geometry ? firstFeature.geometry.type : 'none');
      console.log('Has coordinates:', firstFeature.geometry && firstFeature.geometry.coordinates ? 'yes' : 'no');

      if (firstFeature.geometry && firstFeature.geometry.coordinates) {
        const coords = firstFeature.geometry.coordinates;
        console.log('Coordinates structure (depth):', Array.isArray(coords) ? 'array' : typeof coords);

        // For polygon, coordinates should be array of arrays
        if (coords[0] && coords[0][0]) {
          const firstCoord = coords[0][0];
          console.log('Sample coordinate:', firstCoord);

          // Check if lat/lng are valid ranges
          const lng = firstCoord[0];
          const lat = firstCoord[1];
          console.log('Longitude:', lng, 'Valid:', lng >= -180 && lng <= 180);
          console.log('Latitude:', lat, 'Valid:', lat >= -90 && lat <= 90);
        }
      }
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

testGrid();
