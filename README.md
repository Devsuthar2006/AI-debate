# DebAItor - AI-Powered Debate Judge

A turn-based, room-based web application for live debate scoring. Perfect for hackathon demos where participants can join via smartphone, submit voice arguments, and receive AI-generated debate scores.

## Features

- **Room-based debates**: Host creates a room with a topic, participants join via code or QR
- **Voice recording**: Mobile-friendly 30-second voice recording
- **AI evaluation**: Uses Groq's LLaMA 3.3 70B to score on Logic, Clarity, Relevance, and Emotional Bias
- **Fast transcription**: Groq's Whisper for lightning-fast speech-to-text
- **Instant results**: See individual scores and rankings immediately
- **No authentication**: Simple, demo-friendly experience

## Quick Start

### Prerequisites

- Node.js 18+
- Groq API key (free at https://console.groq.com)

### Setup

1. **Clone and install dependencies:**
   ```bash
   cd AIdebate
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env and add your Groq API key
   ```

3. **Start the server:**
   ```bash
   npm start
   ```

4. **Open in browser:**
   - Host: http://localhost:3000/host.html
   - Participants: http://localhost:3000 (or scan QR code)

## User Flow

### For the Host
1. Go to `/host.html`
2. Enter a debate topic
3. Share the room code or QR with participants
4. Watch as participants join and submit responses
5. Click "View Results" to see ranked scores

### For Participants
1. Scan QR code or enter room code at home page
2. Enter your name
3. Read the debate topic
4. Tap to record your response (max 30 seconds)
5. Submit and view your scores

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/rooms` | Create a new room |
| GET | `/api/rooms/:code` | Get room info |
| GET | `/api/rooms/:code/qr` | Get QR code for room |
| POST | `/api/rooms/:code/join` | Join a room |
| POST | `/api/rooms/:code/submit` | Submit audio response |
| GET | `/api/rooms/:code/results` | Get rankings |

## Scoring System

Each response is evaluated on:
- **Logic (0-10)**: How well-reasoned is the argument?
- **Clarity (0-10)**: How clear is the expression?
- **Relevance (0-10)**: How relevant to the topic?
- **Emotional Bias (0-10)**: Higher = more emotional (penalized)

**Final Score** = Logic(35%) + Clarity(25%) + Relevance(30%) + (10-EmotionalBias)(10%)

## Tech Stack

- **Backend**: Node.js + Express
- **Frontend**: Vanilla HTML/CSS/JS
- **AI**: Groq Whisper (transcription) + LLaMA 3.3 70B (evaluation)
- **Storage**: In-memory (no database)

## Project Structure

```
AIdebate/
├── server.js          # Express server + API routes
├── package.json       # Dependencies
├── .env.example       # Environment template
├── README.md          # This file
└── public/
    ├── index.html     # Home page
    ├── host.html      # Host screen
    ├── join.html      # Participant screen
    └── styles.css     # All styles
```

## Demo Tips

1. **Test beforehand**: Run through the full flow before your demo
2. **Good microphone**: Ensure participants are in a quiet environment
3. **Backup plan**: If AI fails, mock scores are returned
4. **Network**: Ensure all devices are on the same network (or deploy to cloud)

## Deployment

For a live demo, you can deploy to:
- **Render**: Free tier available
- **Railway**: Quick deploy
- **Heroku**: Classic choice

Remember to set the `GROQ_API_KEY` environment variable on your hosting platform.

---

Built for Hackathon Demo • 2026
