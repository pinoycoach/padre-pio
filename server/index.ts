console.log('[Server] Starting...');
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import { MessageHandler } from './components/message_handler';

console.log('[Server] Imports loaded.');

dotenv.config();

console.log('[Server] dotenv configured.');

const app = express();
app.use(cors());
app.use(express.json());

console.log('[Server] Express app configured.');

const server = createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 4000;

console.log(`[Server] Port is ${PORT}.`);

wss.on('connection', async (ws: WebSocket) => {
    console.log('[Server] New client connected');
    const handler = new MessageHandler(ws);
    await handler.init();

    ws.on('message', async (data) => {
        await handler.handleMessage(data);
    });

    ws.on('close', async () => {
        console.log('[Server] Client disconnected');
        await handler.cleanup();
    });
});

app.get('/health', (req, res) => {
    res.send({ status: 'ok', version: '2.0.0 (Native Voice Agent)' });
});

console.log('[Server] Starting server...');
server.listen(PORT, () => {
    console.log(`[Server] Listening on port ${PORT}`);
});
console.log('[Server] Server started.');
