const net = require('net');

// Тест прямого TCP подключения к RCON
const client = new net.Socket();

client.connect(28015, '127.0.0.1', () => {
  console.log('Connected to RCON server');
  
  // Source RCON auth packet
  const password = '789321';
  const packetId = 1;
  const type = 3; // SERVERDATA_AUTH
  
  // Create auth packet
  const body = Buffer.from(password, 'utf8');
  const packetSize = 4 + 4 + body.length + 2; // id + type + body + null terminators
  const packet = Buffer.alloc(packetSize + 4); // +4 for size field
  
  packet.writeInt32LE(packetSize, 0);
  packet.writeInt32LE(packetId, 4);
  packet.writeInt32LE(type, 8);
  body.copy(packet, 12);
  packet.writeInt16LE(0, 12 + body.length); // null terminator
  
  console.log('Sending auth packet...');
  client.write(packet);
});

client.on('data', (data) => {
  console.log('Received data:', data.toString('hex'));
  console.log('Data length:', data.length);
  
  if (data.length >= 12) {
    const responseId = data.readInt32LE(4);
    const responseType = data.readInt32LE(8);
    console.log('Response ID:', responseId);
    console.log('Response Type:', responseType);
    
    if (responseId === -1) {
      console.log('ERROR: Wrong password!');
    } else if (responseType === 2) {
      console.log('SUCCESS: Authenticated!');
    }
  }
  
  client.destroy();
});

client.on('error', (err) => {
  console.error('Connection error:', err.message);
});

client.on('close', () => {
  console.log('Connection closed');
});
