const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
// You'll need to add your Firebase service account key
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT 
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  : require('./kostgo-service-account.json'); // For local development

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.firestore();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Store active connections
const activeUsers = new Map();
const userSockets = new Map();

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'Chat server is running', timestamp: new Date().toISOString() });
});

// Get user's active chats
app.get('/api/chats/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const chatsRef = db.collection('chats');
    const snapshot = await chatsRef.where('participants', 'array-contains', userId).get();
    
    const chats = [];
    snapshot.forEach(doc => {
      chats.push({ id: doc.id, ...doc.data() });
    });
    
    res.json(chats);
  } catch (error) {
    console.error('Error fetching chats:', error);
    res.status(500).json({ error: 'Failed to fetch chats' });
  }
});

// Create or get existing chat
app.post('/api/chats', async (req, res) => {
  try {
    const { participants } = req.body;
    
    if (!participants || participants.length !== 2) {
      return res.status(400).json({ error: 'Exactly 2 participants required' });
    }
    
    const sortedParticipants = participants.sort();
    const chatId = sortedParticipants.join('_');
    
    const chatRef = db.collection('chats').doc(chatId);
    const chatDoc = await chatRef.get();
    
    if (!chatDoc.exists) {
      await chatRef.set({
        participants: sortedParticipants,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastMessage: null,
        lastMessageAt: null
      });
    }
    
    res.json({ chatId, participants: sortedParticipants });
  } catch (error) {
    console.error('Error creating chat:', error);
    res.status(500).json({ error: 'Failed to create chat' });
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  // User authentication and joining
  socket.on('join', async (data) => {
    try {
      const { userId, chatId } = data;
      
      if (!userId || !chatId) {
        socket.emit('error', 'UserId and chatId are required');
        return;
      }
      
      // Verify chat exists and user is participant
      const chatRef = db.collection('chats').doc(chatId);
      const chatDoc = await chatRef.get();
      
      if (!chatDoc.exists) {
        socket.emit('error', 'Chat not found');
        return;
      }
      
      const chatData = chatDoc.data();
      if (!chatData.participants.includes(userId)) {
        socket.emit('error', 'Not authorized for this chat');
        return;
      }
      
      // Join socket room
      socket.join(chatId);
      socket.userId = userId;
      socket.chatId = chatId;
      
      // Track active users
      activeUsers.set(userId, socket.id);
      userSockets.set(socket.id, { userId, chatId });
      
      // Notify other participant that user is online
      socket.to(chatId).emit('userOnline', { userId });
      
      console.log(`User ${userId} joined chat ${chatId}`);
      
      socket.emit('joined', { chatId, userId });
      
    } catch (error) {
      console.error('Error in join:', error);
      socket.emit('error', 'Failed to join chat');
    }
  });
  
  // Handle sending messages
  socket.on('sendMessage', async (data) => {
    try {
      const { message, timestamp } = data;
      const { userId, chatId } = userSockets.get(socket.id) || {};
      
      if (!userId || !chatId) {
        socket.emit('error', 'Not properly connected to chat');
        return;
      }
      
      if (!message || !message.trim()) {
        socket.emit('error', 'Message cannot be empty');
        return;
      }
      
      // Save message to Firestore
      const messageData = {
        senderId: userId,
        message: message.trim(),
        timestamp: timestamp || admin.firestore.FieldValue.serverTimestamp(),
        chatId
      };
      
      const messageRef = await db.collection('messages').add(messageData);
      const messageDoc = await messageRef.get();
      const savedMessage = { id: messageDoc.id, ...messageDoc.data() };
      
      // Update chat's last message
      await db.collection('chats').doc(chatId).update({
        lastMessage: message.trim(),
        lastMessageAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // Broadcast message to all users in the chat
      io.to(chatId).emit('newMessage', savedMessage);
      
      console.log(`Message sent in chat ${chatId} by user ${userId}`);
      
    } catch (error) {
      console.error('Error sending message:', error);
      socket.emit('error', 'Failed to send message');
    }
  });
  
  // Handle typing indicators
  socket.on('typing', (data) => {
    const { userId, chatId } = userSockets.get(socket.id) || {};
    if (userId && chatId) {
      socket.to(chatId).emit('userTyping', { userId, isTyping: data.isTyping });
    }
  });
  
  // Handle disconnect
  socket.on('disconnect', () => {
    const userData = userSockets.get(socket.id);
    if (userData) {
      const { userId, chatId } = userData;
      
      // Remove from active users
      activeUsers.delete(userId);
      userSockets.delete(socket.id);
      
      // Notify other participant that user is offline
      socket.to(chatId).emit('userOffline', { userId });
      
      console.log(`User ${userId} disconnected from chat ${chatId}`);
    }
    
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Chat server running on port ${PORT}`);
});