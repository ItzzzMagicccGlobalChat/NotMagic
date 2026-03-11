import express from "express";
import http from "http";
import WebSocket from "ws";
import dotenv from "dotenv";

dotenv.config();

const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
res.json({
status: "online",
service: "NotMagic Chat"
});
});

const server = http.createServer(app);

const wss = new WebSocket.Server({ server });

const clients = new Set();

/* WebSocket connection */

wss.on("connection", (ws) => {

clients.add(ws);

ws.on("message", (data) => {

```
let message;

try {
  message = JSON.parse(data);
} catch {
  return;
}

const payload = JSON.stringify({
  type: "chat",
  message
});

for (const client of clients) {

  if (client.readyState === WebSocket.OPEN) {
    client.send(payload);
  }

}
```

});

ws.on("close", () => {
clients.delete(ws);
});

});

/* Start server */

server.listen(PORT, "0.0.0.0", () => {
console.log(`Server running on port ${PORT}`);
});
