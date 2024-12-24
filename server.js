const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const mqtt = require('mqtt');

const app = express();
const port = 5001;

const mqttTopics = [
  'bme680/p1', 'bme680/p2', 'bme680/p3', 'bme680/p4', 'bme680/p5',
  'health/t1', 'health/t2', 'health/t3', 'health/t4', 'water/a1'
];

const buttonTopics = [
  'home/switch1', 'home/switch2', 'home/switch3', 'home/switch4', 
  'home/switch5', 'home/switch6', 'home/switch7', 'home/switch8', 
  'home/switch9', 'home/switch10', 'home/switch11', 'home/switch12'
];

let buttonStates = Array(12).fill('off'); // Initialize states of all 12 buttons to 'off'
let sensorData = {
  sensor1: '',
  sensor2: '',
  sensor3: '',
  sensor4: '',
  sensor5: ''
};
let healthData = {
  value1: '',
  value2: '',
  value3: '',
  value4: ''
};
let waterData = {
  water1: ''
};

const mqttClient = mqtt.connect('mqtt://34.131.79.148:1883');

mqttClient.on('connect', function () {
  console.log('Connected to broker');
  mqttClient.subscribe('device');
  mqttTopics.forEach(topic => mqttClient.subscribe(topic));
  buttonTopics.forEach(topic => mqttClient.subscribe(topic));
});

mqttClient.on('message', function (topic, message) {
  console.log(`Received message on topic: ${topic} - Message: ${message.toString()}`);
  
  // Handling sensor data
  if (mqttTopics.includes(topic)) {
    const sensorIndex = mqttTopics.indexOf(topic);
    sensorData[`sensor${sensorIndex + 1}`] = message.toString();
    broadcastToClients(sensorData);
  }

  // Handling health data
  const healthIndex = ['health/t1', 'health/t2', 'health/t3', 'health/t4'].indexOf(topic);
  if (healthIndex !== -1) {
    healthData[`value${healthIndex + 1}`] = message.toString();
    broadcastToClients(healthData);
  }

  // Handling water data
  const waterIndex = ['water/a1'].indexOf(topic);
  if (waterIndex !== -1) {
    waterData.water1 = message.toString();
    broadcastToClients(waterData);
  }
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('WebSocket connection established');
  ws.send(JSON.stringify({ buttonStates, sensorData, healthData, waterData }));
  
  // Handle incoming messages from WebSocket clients
  ws.on('message', (message) => {
    console.log(`Received message from client: ${message}`);
  });
});

// Broadcast data to all connected WebSocket clients
const broadcastToClients = (data) => {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
};

app.use(cors());
app.use(bodyParser.json());

// Action endpoint to handle switch actions (on/off)
app.post('/action/:buttonIndex/:state', (req, res) => {
  const { buttonIndex, state } = req.params;

  // Validate button index
  const buttonIdx = parseInt(buttonIndex) - 1; // Convert to 0-based index
  if (buttonIdx < 0 || buttonIdx >= buttonTopics.length) {
    return res.status(400).json({ message: 'Invalid button index' });
  }

  // Validate state
  if (state !== 'on' && state !== 'off') {
    return res.status(400).json({ message: 'Invalid state' });
  }

  // Update button state
  const value = state === 'on' ? 'true' : 'false';
  buttonStates[buttonIdx] = value;

  // Handle the action (publish to MQTT and broadcast)
  const buttonTopic = buttonTopics[buttonIdx];
  mqttClient.publish(buttonTopic, value); // Publish to MQTT
  broadcastToClients({ buttonStates });  // Broadcast to WebSocket clients

  res.json({ message: value === 'true' ? 'On' : 'Off', buttonPressed: buttonTopic });
});

server.listen(port, () => {
  console.log(`Express server running on port ${port}`);
});
