/**
 * DebAItor - Main Server (Turn-Based Version)
 * 
 * A turn-based debate app where:
 * - Host controls the flow
 * - Each player gets 30 seconds per turn
 * - Multiple rounds supported
 * - AI evaluates all responses at the end
 */

require('dotenv').config();

const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const OpenAI = require('openai');

const app = express();
const PORT = process.env.PORT || 3000;

// Check for Groq API key
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const USE_MOCK_AI = !GROQ_API_KEY || GROQ_API_KEY.startsWith('gsk_your');

if (USE_MOCK_AI) {
  console.warn('\n⚠️  WARNING: No valid Groq API key found!');
  console.warn('   Using MOCK responses. Add GROQ_API_KEY to .env for real AI.\n');
} else {
  console.log('\n✅ Groq API key detected - Real AI enabled!\n');
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configure multer for audio uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }
});

// In-memory storage for rooms
const rooms = new Map();

// Initialize Groq client
let groq = null;
if (!USE_MOCK_AI) {
  groq = new OpenAI({
    apiKey: GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1'
  });
}

// Generate room code
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ============ API ROUTES ============

/**
 * Create a new room
 */
app.post('/api/rooms', (req, res) => {
  const { topic } = req.body;
  
  if (!topic || topic.trim().length === 0) {
    return res.status(400).json({ error: 'Topic is required' });
  }

  const roomCode = generateRoomCode();
  const hostId = uuidv4();

  rooms.set(roomCode, {
    topic: topic.trim(),
    hostId,
    participants: new Map(),
    currentTurn: null,           // Current participant ID whose turn it is
    turnOrder: [],               // Array of participant IDs in turn order
    currentRound: 0,             // Current round number
    status: 'waiting',           // waiting, in_progress, ended
    createdAt: Date.now()
  });

  console.log(`Room created: ${roomCode} - "${topic}"`);
  res.json({ roomCode, topic, hostId });
});

/**
 * Get room info
 */
app.get('/api/rooms/:code', (req, res) => {
  const roomCode = req.params.code.toUpperCase();
  const room = rooms.get(roomCode);

  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  const participants = Array.from(room.participants.entries()).map(([id, data]) => ({
    id,
    name: data.name,
    responses: data.responses.length,
    isCurrentTurn: room.currentTurn === id
  }));

  res.json({
    roomCode,
    topic: room.topic,
    status: room.status,
    currentRound: room.currentRound,
    currentTurn: room.currentTurn,
    currentTurnName: room.currentTurn ? room.participants.get(room.currentTurn)?.name : null,
    participants,
    turnOrder: room.turnOrder
  });
});

/**
 * Generate QR code
 */
app.get('/api/rooms/:code/qr', async (req, res) => {
  const roomCode = req.params.code.toUpperCase();
  const room = rooms.get(roomCode);

  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  try {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const joinUrl = `${baseUrl}/join.html?code=${roomCode}`;
    
    const qrDataUrl = await QRCode.toDataURL(joinUrl, {
      width: 300,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' }
    });

    res.json({ qrCode: qrDataUrl, joinUrl });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

/**
 * Join a room
 */
app.post('/api/rooms/:code/join', (req, res) => {
  const roomCode = req.params.code.toUpperCase();
  const { name } = req.body;

  if (!name || name.trim().length === 0) {
    return res.status(400).json({ error: 'Name is required' });
  }

  const room = rooms.get(roomCode);

  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  if (room.status === 'ended') {
    return res.status(400).json({ error: 'Debate has ended' });
  }

  const participantId = uuidv4();

  room.participants.set(participantId, {
    name: name.trim(),
    responses: [],  // Array of { transcript, scores, round }
    joinedAt: Date.now()
  });

  // Add to turn order
  room.turnOrder.push(participantId);

  console.log(`${name} joined room ${roomCode}`);

  res.json({ 
    participantId, 
    name: name.trim(),
    topic: room.topic,
    roomCode 
  });
});

/**
 * HOST: Start the debate
 */
app.post('/api/rooms/:code/start', (req, res) => {
  const roomCode = req.params.code.toUpperCase();
  const room = rooms.get(roomCode);

  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  if (room.turnOrder.length === 0) {
    return res.status(400).json({ error: 'No participants yet' });
  }

  room.status = 'in_progress';
  room.currentRound = 1;
  room.currentTurn = room.turnOrder[0];

  const currentName = room.participants.get(room.currentTurn)?.name;
  console.log(`Debate started in ${roomCode}. Round 1, ${currentName}'s turn`);

  res.json({ 
    success: true, 
    message: 'Debate started',
    currentTurn: room.currentTurn,
    currentTurnName: currentName,
    round: room.currentRound
  });
});

/**
 * HOST: Move to next turn
 */
app.post('/api/rooms/:code/next-turn', (req, res) => {
  const roomCode = req.params.code.toUpperCase();
  const room = rooms.get(roomCode);

  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  if (room.status !== 'in_progress') {
    return res.status(400).json({ error: 'Debate not in progress' });
  }

  // Find current turn index
  const currentIndex = room.turnOrder.indexOf(room.currentTurn);
  const nextIndex = currentIndex + 1;

  if (nextIndex >= room.turnOrder.length) {
    // New round
    room.currentRound++;
    room.currentTurn = room.turnOrder[0];
    console.log(`Round ${room.currentRound} started in ${roomCode}`);
  } else {
    room.currentTurn = room.turnOrder[nextIndex];
  }

  const currentName = room.participants.get(room.currentTurn)?.name;
  console.log(`Next turn: ${currentName}`);

  res.json({ 
    success: true,
    currentTurn: room.currentTurn,
    currentTurnName: currentName,
    round: room.currentRound
  });
});

/**
 * HOST: End debate and calculate results
 */
app.post('/api/rooms/:code/end', async (req, res) => {
  const roomCode = req.params.code.toUpperCase();
  const room = rooms.get(roomCode);

  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  room.status = 'ended';
  room.currentTurn = null;

  console.log(`Debate ended in ${roomCode}. Calculating final scores...`);

  // Calculate aggregate scores for each participant
  const results = [];

  for (const [id, data] of room.participants) {
    if (data.responses.length === 0) {
      results.push({
        id,
        name: data.name,
        totalResponses: 0,
        averageScore: 0,
        responses: []
      });
      continue;
    }

    // Calculate average scores
    const avgLogic = data.responses.reduce((sum, r) => sum + r.scores.logic, 0) / data.responses.length;
    const avgClarity = data.responses.reduce((sum, r) => sum + r.scores.clarity, 0) / data.responses.length;
    const avgRelevance = data.responses.reduce((sum, r) => sum + r.scores.relevance, 0) / data.responses.length;
    const avgEmotionalBias = data.responses.reduce((sum, r) => sum + r.scores.emotionalBias, 0) / data.responses.length;
    
    const averageScore = (
      avgLogic * 0.35 +
      avgClarity * 0.25 +
      avgRelevance * 0.3 +
      (10 - avgEmotionalBias) * 0.1
    );

    results.push({
      id,
      name: data.name,
      totalResponses: data.responses.length,
      averageScores: {
        logic: Math.round(avgLogic * 10) / 10,
        clarity: Math.round(avgClarity * 10) / 10,
        relevance: Math.round(avgRelevance * 10) / 10,
        emotionalBias: Math.round(avgEmotionalBias * 10) / 10
      },
      averageScore: Math.round(averageScore * 10) / 10,
      responses: data.responses
    });
  }

  // Sort by average score
  results.sort((a, b) => b.averageScore - a.averageScore);

  // Add ranks
  results.forEach((r, i) => { r.rank = i + 1; });

  res.json({
    roomCode,
    topic: room.topic,
    results
  });
});

/**
 * Submit audio response
 */
app.post('/api/rooms/:code/submit', upload.single('audio'), async (req, res) => {
  const roomCode = req.params.code.toUpperCase();
  const { participantId } = req.body;

  const room = rooms.get(roomCode);

  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  if (room.status !== 'in_progress') {
    return res.status(400).json({ error: 'Debate not in progress' });
  }

  // Check if it's this participant's turn
  if (room.currentTurn !== participantId) {
    return res.status(400).json({ error: 'Not your turn' });
  }

  const participant = room.participants.get(participantId);

  if (!participant) {
    return res.status(404).json({ error: 'Participant not found' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'Audio file is required' });
  }

  try {
    let transcript;
    let evaluation;

    if (USE_MOCK_AI) {
      console.log(`[MOCK] Processing for ${participant.name}...`);
      transcript = getMockTranscript();
      evaluation = getMockEvaluation();
    } else {
      // Transcribe with Groq Whisper
      console.log(`Transcribing audio for ${participant.name}...`);
      
      const audioFile = fs.createReadStream(req.file.path);
      const transcription = await groq.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-large-v3-turbo',
        language: 'en'
      });

      transcript = transcription.text;
      console.log(`Transcript: "${transcript.substring(0, 50)}..."`);

      // Evaluate with Groq LLaMA
      console.log(`Evaluating response...`);
      evaluation = await evaluateResponse(room.topic, transcript);
    }

    // Store the response
    participant.responses.push({
      round: room.currentRound,
      transcript,
      scores: evaluation,
      submittedAt: Date.now()
    });

    // Clean up audio file
    fs.unlink(req.file.path, () => {});

    console.log(`${participant.name} submitted Round ${room.currentRound}: Score ${evaluation.finalScore}`);

    res.json({
      success: true,
      transcript,
      scores: evaluation,
      round: room.currentRound
    });

  } catch (error) {
    console.error('Submission error:', error);
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: 'Failed to process', details: error.message });
  }
});

/**
 * Get current turn status (for participant polling)
 */
app.get('/api/rooms/:code/turn-status', (req, res) => {
  const roomCode = req.params.code.toUpperCase();
  const { participantId } = req.query;
  const room = rooms.get(roomCode);

  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  const isMyTurn = room.currentTurn === participantId;
  const currentTurnName = room.currentTurn ? room.participants.get(room.currentTurn)?.name : null;

  res.json({
    status: room.status,
    round: room.currentRound,
    isMyTurn,
    currentTurnName,
    currentTurn: room.currentTurn
  });
});

/**
 * Get results (only when debate ended)
 */
app.get('/api/rooms/:code/results', (req, res) => {
  const roomCode = req.params.code.toUpperCase();
  const room = rooms.get(roomCode);

  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  if (room.status !== 'ended') {
    return res.status(400).json({ error: 'Debate has not ended yet' });
  }

  // Calculate results
  const results = [];

  for (const [id, data] of room.participants) {
    if (data.responses.length === 0) {
      results.push({ id, name: data.name, totalResponses: 0, averageScore: 0, responses: [] });
      continue;
    }

    const avgLogic = data.responses.reduce((sum, r) => sum + r.scores.logic, 0) / data.responses.length;
    const avgClarity = data.responses.reduce((sum, r) => sum + r.scores.clarity, 0) / data.responses.length;
    const avgRelevance = data.responses.reduce((sum, r) => sum + r.scores.relevance, 0) / data.responses.length;
    const avgEmotionalBias = data.responses.reduce((sum, r) => sum + r.scores.emotionalBias, 0) / data.responses.length;
    
    const averageScore = (avgLogic * 0.35 + avgClarity * 0.25 + avgRelevance * 0.3 + (10 - avgEmotionalBias) * 0.1);

    results.push({
      id,
      name: data.name,
      totalResponses: data.responses.length,
      averageScores: {
        logic: Math.round(avgLogic * 10) / 10,
        clarity: Math.round(avgClarity * 10) / 10,
        relevance: Math.round(avgRelevance * 10) / 10,
        emotionalBias: Math.round(avgEmotionalBias * 10) / 10
      },
      averageScore: Math.round(averageScore * 10) / 10,
      responses: data.responses
    });
  }

  results.sort((a, b) => b.averageScore - a.averageScore);
  results.forEach((r, i) => { r.rank = i + 1; });

  res.json({ roomCode, topic: room.topic, results });
});

/**
 * AI Evaluation function
 */
async function evaluateResponse(topic, transcript) {
  const systemPrompt = `You are a strict, impartial debate judge evaluating spoken arguments.

SCORING CRITERIA (0-10 scale):

LOGIC (0-10): Is the argument well-structured and logical?
- 0-3: No logical structure, contradictions, fallacies
- 4-6: Some logical flow but weak reasoning
- 7-10: Strong logical structure with valid reasoning

CLARITY (0-10): Is the expression clear and understandable?
- 0-3: Confusing, incoherent, hard to follow
- 4-6: Somewhat clear but could be better expressed
- 7-10: Crystal clear expression

RELEVANCE (0-10): How relevant is the response to the debate topic?
- 0-3: Off-topic or barely addresses the topic
- 4-6: Partially relevant
- 7-10: Directly addresses the topic

EMOTIONAL BIAS (0-10): How emotional vs objective? (Higher = MORE emotional = BAD)
- 0-3: Very objective and fact-based
- 4-6: Some emotional language
- 7-10: Highly emotional, biased language

Return ONLY a valid JSON object (no markdown, no explanation):
{"logic": X, "clarity": X, "relevance": X, "emotionalBias": X, "insight": "one sentence about main weakness"}`;

  const userPrompt = `DEBATE TOPIC: "${topic}"

PARTICIPANT'S SPOKEN RESPONSE (transcribed):
"${transcript}"

Rate this response. Return JSON only.`;

  try {
    console.log(`AI evaluating: "${transcript.substring(0, 80)}..."`);
    
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.5 // Slightly higher for more variation
    });

    const content = response.choices[0].message.content;
    console.log(`AI raw response: ${content.substring(0, 200)}`);
    
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      console.error('No JSON found in AI response');
      throw new Error('No JSON in response');
    }
    
    const evaluation = JSON.parse(jsonMatch[0]);
    
    // Calculate final score ourselves to ensure accuracy
    const finalScore = calculateFinalScore(evaluation);
    
    console.log(`AI scores - Logic: ${evaluation.logic}, Clarity: ${evaluation.clarity}, Relevance: ${evaluation.relevance}, Bias: ${evaluation.emotionalBias}, Final: ${finalScore}`);
    
    return {
      logic: Number(evaluation.logic) || 5,
      clarity: Number(evaluation.clarity) || 5,
      relevance: Number(evaluation.relevance) || 5,
      emotionalBias: Number(evaluation.emotionalBias) || 5,
      insight: evaluation.insight || 'Response needs improvement',
      finalScore: finalScore
    };

  } catch (error) {
    console.error('AI evaluation error:', error.message);
    // Return random mock scores so they're not all the same
    return getMockEvaluation();
  }
}

function calculateFinalScore(s) {
  const logic = Number(s.logic) || 5;
  const clarity = Number(s.clarity) || 5;
  const relevance = Number(s.relevance) || 5;
  const emotionalBias = Number(s.emotionalBias) || 5;
  
  const score = (logic * 0.35) + (clarity * 0.25) + (relevance * 0.30) + ((10 - emotionalBias) * 0.10);
  return Math.round(score * 10) / 10;
}

// Mock functions
const MOCK_TRANSCRIPTS = [
  "I believe we need to consider both perspectives carefully before making a judgment.",
  "The evidence clearly shows that this approach has significant benefits.",
  "While there are valid concerns, the overall impact remains positive.",
  "We must prioritize long-term sustainability over short-term gains."
];

const MOCK_INSIGHTS = [
  "Lacks specific supporting evidence.",
  "Argument is too general without concrete examples.",
  "Does not address counterarguments.",
  "Relies on assumptions without verification."
];

function getMockTranscript() {
  return MOCK_TRANSCRIPTS[Math.floor(Math.random() * MOCK_TRANSCRIPTS.length)];
}

function getMockEvaluation() {
  const logic = Math.floor(Math.random() * 4) + 5;
  const clarity = Math.floor(Math.random() * 4) + 5;
  const relevance = Math.floor(Math.random() * 4) + 5;
  const emotionalBias = Math.floor(Math.random() * 5) + 2;
  const insight = MOCK_INSIGHTS[Math.floor(Math.random() * MOCK_INSIGHTS.length)];
  const finalScore = calculateFinalScore({ logic, clarity, relevance, emotionalBias });
  return { logic, clarity, relevance, emotionalBias, insight, finalScore };
}

// Serve pages
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/host', (req, res) => res.sendFile(path.join(__dirname, 'public', 'host.html')));
app.get('/join', (req, res) => res.sendFile(path.join(__dirname, 'public', 'join.html')));

// Start server
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════╗
║      DebAItor - Turn-Based Debate MVP         ║
╠═══════════════════════════════════════════════╣
║  Server: http://localhost:${PORT}                ║
║                                               ║
║  Host Flow:                                   ║
║  1. Create room → 2. Wait for players         ║
║  3. Start debate → 4. Control turns           ║
║  5. End debate → View results                 ║
╚═══════════════════════════════════════════════╝
  `);
});
