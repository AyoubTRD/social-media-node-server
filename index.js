const express = require("express");
const axios = require("axios");

const phpServer = axios.create({
  baseURL: process.env.PHP_SERVER || "http://localhost",
});

const app = express();

const cors = require("cors");
app.use(cors());

const PORT = process.env.PORT || 8080;
const server = app.listen(PORT, () => console.log("Server up on port " + PORT));

const io = require("socket.io")(server);

const connectedUsers = {};
io.on("connection", async (socket) => {
  const userId = socket.handshake.query.id;
  connectedUsers[userId] = connectedUsers[userId] || [];

  connectedUsers[userId].push(socket);

  if (connectedUsers[userId].length === 1) {
    console.log(`A user with id ${userId} has connected`);
    socket.broadcast.emit("online_user", {
      id: userId,
    });
    try {
      await phpServer.get(
        `/endpoints/user-status.php?user_id=${userId}&status=1`
      );
    } catch (e) {
      console.log(e.response.data);
    }
  }

  socket.on("disconnect", async () => {
    connectedUsers[userId] = connectedUsers[userId].filter(
      (s) => s.id !== socket.id
    );
    if (connectedUsers[userId].length === 0) {
      console.log("A user has disconnected");
      socket.broadcast.emit("offline_user", {
        id: userId,
      });
      try {
        await phpServer.get(
          `/endpoints/user-status.php?user_id=${userId}&status=0`
        );
      } catch (e) {
        console.log(e.response.data);
      }
    }
  });

  socket.on("send_message", async (message = {}) => {
    message.from = userId;
    message.createdAt = new Date();
    try {
      const res = await phpServer.post("/endpoints/messages.php", {
        message,
        create: true,
      });
      if (connectedUsers[message.to]) {
        emitToMultiple(connectedUsers[message.to], "message", {
          ...message,
          user_from: message.from,
        });
      }
    } catch (e) {}
  });
});

function emitToMultiple(sockets, ...args) {
  for (let socket of sockets) {
    socket.emit(...args);
  }
}
