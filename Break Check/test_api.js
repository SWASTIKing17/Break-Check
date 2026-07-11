const https = require('https');

https.get('https://voluble-basbousa-2977b2.netlify.app/api/data', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Response:', data));
}).on('error', err => console.log('Error:', err.message));
