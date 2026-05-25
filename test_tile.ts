import https from 'https';
https.get('https://mt0.google.com/vt/lyrs=h,traffic&x=2621&y=6331&z=14', (res) => {
  console.log('h,traffic statusCode:', res.statusCode, res.headers['content-type']);
});
https.get('https://mt0.google.com/vt/lyrs=m,traffic&x=2621&y=6331&z=14', (res) => {
  console.log('m,traffic statusCode:', res.statusCode, res.headers['content-type']);
});
