import http from 'http';

http.get('http://localhost:3000/api/ticket/abc', (res) => {
  console.log('Status:', res.statusCode);
  console.log('Headers:', res.headers);
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Body:', data.substring(0, 500)));
});
http.get('http://localhost:3000/api/ticket/abc/messages', (res) => {
  console.log('Status (messages):', res.statusCode);
  console.log('Headers (messages):', res.headers);
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Body (messages):', data.substring(0, 500)));
});
