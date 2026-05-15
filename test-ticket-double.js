import http from 'http';

http.get('http://localhost:3000/api/ticket//messages', (res) => {
  console.log('Status //:', res.statusCode);
  console.log('Content-Type:', res.headers['content-type']);
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Body:', data.substring(0, 150)));
});
