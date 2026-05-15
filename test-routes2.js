import http from 'http';

http.get('http://localhost:3000/api/ticket/', (res) => {
  console.log('Status /api/ticket/:', res.statusCode);
  console.log('Content-Type:', res.headers['content-type']);
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Body:', data.substring(0, 150)));
});

http.get('http://localhost:3000/api/ticket//messages', (res) => {
  console.log('Status //messages:', res.statusCode);
  console.log('Content-Type:', res.headers['content-type']);
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Body:', data.substring(0, 150)));
});
