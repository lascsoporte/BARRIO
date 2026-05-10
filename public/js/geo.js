// Geolocation utilities
const Geo = {
  userLat: null,
  userLng: null,

  async getUserLocation(forceFresh = false) {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocalización no soportada'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          Geo.userLat = pos.coords.latitude;
          Geo.userLng = pos.coords.longitude;
          resolve({ lat: Geo.userLat, lng: Geo.userLng });
        },
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: forceFresh ? 10000 : 300000 }
      );
    });
  },

  formatDistance(meters) {
    if (meters < 1000) return `${meters}m`;
    return `${(meters / 1000).toFixed(1)}km`;
  },

  openGoogleMaps(lat, lng, name) {
    const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}&query_place_id=${encodeURIComponent(name)}`;
    window.open(url, '_blank');
  },

  openWaze(lat, lng) {
    window.open(`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`, '_blank');
  }
};
