import 'dotenv/config';

async function test() {
  const res = await fetch('http://localhost:3000/api/dashboard-data');
  const data = await res.json();
  if(!data.tickets || data.tickets.length === 0) {
     console.log("No tickets");
     return;
  }
  const ticketId = data.tickets[0]._id || data.tickets[0].id;
  console.log("Testing ticket:", ticketId);
  
  const tickRes = await fetch(`http://localhost:3000/api/ticket/${ticketId}`);
  const tickText = await tickRes.text();
  console.log("Ticket Resp:", tickRes.status, tickText.substring(0,200));

  const msgRes = await fetch(`http://localhost:3000/api/ticket/${ticketId}/messages`);
  const msgText = await msgRes.text();
  console.log("Msg Resp:", msgRes.status, msgText.substring(0,200));
}
test();
