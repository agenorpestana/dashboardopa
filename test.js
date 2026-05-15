import http from 'http';

http.get('http://localhost:3000/api/ticket/5d1642ad4b16a50312cc8f4d/messages', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(res.statusCode, data));
});
