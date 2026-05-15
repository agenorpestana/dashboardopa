import http from 'http';

http.get('http://localhost:3000/api/ticket/5bf73d1d186f7d2b0d647a61', (res) => {
  console.log('Status /api/ticket/:', res.statusCode);
  console.log('Content-Type:', res.headers['content-type']);
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Body:', data.substring(0, 150)));
});
