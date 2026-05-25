import https from 'https';

const testUrls = [
  'https://mt0.google.com/vt/lyrs=h,traffic&x=2621&y=6331&z=14',
  'https://mt0.google.com/vt/lyrs=traffic&x=2621&y=6331&z=14',
  'https://mt0.google.com/vt/lyrs=m,traffic&x=2621&y=6331&z=14'
];

testUrls.forEach(u => {
  https.get(u, (res) => {
    console.log(u, ' statusCode:', res.statusCode, res.headers['content-type']);
  });
});
