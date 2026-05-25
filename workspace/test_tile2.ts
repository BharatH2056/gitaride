import https from 'https';

const testUrls = [
  'https://mt0.google.com/vt/lyrs=traffic&x=2621&y=6331&z=14',
  'https://mt1.google.com/vt/lyrs=traffic,m&x=2621&y=6331&z=14',
  'https://mt2.google.com/vt/lyrs=h,traffic&x=2621&y=6331&z=14',
  'https://core-jams-rdr.maps.yandex.net/3.0/tiles?l=trf,trf&x=2621&y=6331&z=14'
];

testUrls.forEach(u => {
  https.get(u, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }, (res) => {
    console.log(u, ' statusCode:', res.statusCode);
  });
});
