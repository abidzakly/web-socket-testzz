# WebSocket Chat Server

A lightweight, real-time chat server built with Node.js, Socket.IO, and Firebase Firestore.

## Features

- Real-time messaging between two users
- Firebase Firestore integration for message persistence
- Typing indicators
- User online/offline status
- Auto-reconnection
- Optimized for mobile apps

## Quick Start

1. Install dependencies: `npm install`
2. Add your Firebase service account key as `serviceAccountKey.json`
3. Run locally: `npm run dev`
4. Deploy to Railway or Render

## API Endpoints

- `GET /` - Health check
- `GET /api/chats/:userId` - Get user's chats
- `POST /api/chats` - Create new chat

## WebSocket Events

- `join` - Join a chat room
- `sendMessage` - Send a message
- `typing` - Send typing indicator
- `newMessage` - Receive new message
- `userTyping` - Receive typing indicator
- `userOnline/userOffline` - User status updates

## Environment Variables

- `PORT` - Server port (default: 3000)
- `FIREBASE_DATABASE_URL` - Firebase database URL
- `FIREBASE_SERVICE_ACCOUNT` - Firebase service account JSON

---