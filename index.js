const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const fs = require('fs');
const path = require('path');

// ===== EXPRESS UI SERVER =====
const app = express();
const UI_PORT = 7000;
app.use(express.json());
app.use(express.static(path.join(__dirname, 'ui')));

// Paths
const dbPath  = path.join(__dirname, 'data', 'database.json');
const logPath = path.join(__dirname, 'data', 'log.txt');
const filesDir = path.join(__dirname, 'data', 'files');

// ── Ensure dirs/files exist ──────────────────────────────────────────────────
if (!fs.existsSync(path.join(__dirname, 'data'))) fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
if (!fs.existsSync(filesDir)) fs.mkdirSync(filesDir, { recursive: true });
if (!fs.existsSync(path.join(__dirname, 'ui')))  fs.mkdirSync(path.join(__dirname, 'ui'),  { recursive: true });
if (!fs.existsSync(logPath)) fs.writeFileSync(logPath, '');

// Initialise database with correct shape if missing or legacy (flat array)
if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify({ messages: [], users: [
        { username: 'admin', password: 'admin123', role: 'superadmin', createdAt: new Date().toISOString() }
    ] }, null, 2));
} else {
    try {
        const raw = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        // Migrate flat array → new shape
        if (Array.isArray(raw)) {
            fs.writeFileSync(dbPath, JSON.stringify({
                messages: raw,
                users: [{ username: 'admin', password: 'admin123', role: 'superadmin', createdAt: new Date().toISOString() }]
            }, null, 2));
        }
    } catch { /* leave file alone if corrupt */ }
}

// ── DB helpers ───────────────────────────────────────────────────────────────
function readDB(actionDesc = 'Database Read') {
    try { 
        const db = JSON.parse(fs.readFileSync(dbPath, 'utf8')); 
        logMessage(`[SYSTEM] ${new Date().toISOString()} | READ: ${actionDesc}`);
        return db;
    }
    catch { 
        logMessage(`[SYSTEM ERROR] ${new Date().toISOString()} | READ FAILED: ${actionDesc}`);
        return { messages: [], users: [] }; 
    }
}
function writeDB(db, actionDesc = 'Database Write') {
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
    logMessage(`[SYSTEM] ${new Date().toISOString()} | WRITE: ${actionDesc}`);
}

// ── AUTH: Login with username + password ─────────────────────────────────────
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password)
        return res.status(400).json({ error: 'Username and password are required.' });

    const db = readDB(`Login attempt for user: ${username}`);
    const user = db.users.find(u => u.username === username && u.password === password);
    if (!user) {
        logMessage(`[AUTH ERROR] ${new Date().toISOString()} | Failed login attempt for user: ${username}`);
        return res.status(401).json({ error: 'Invalid username or password.' });
    }

    logMessage(`[AUTH] ${new Date().toISOString()} | User logged in: ${username} (${user.role})`);
    res.json({ success: true, username: user.username, role: user.role });
});

// Logout endpoint for logging
app.post('/logout', (req, res) => {
    const { username } = req.body;
    if (username) {
        logMessage(`[AUTH] ${new Date().toISOString()} | User logged out: ${username}`);
    }
    res.json({ success: true });
});

// ── USER MANAGEMENT ──────────────────────────────────────────────────────────
// List all users (strip passwords before sending)
app.get('/users', (req, res) => {
    const db = readDB('Fetch users list');
    res.json(db.users.map(u => ({ username: u.username, role: u.role, createdAt: u.createdAt })));
});

// Add new user / admin
app.post('/add-admin', (req, res) => {
    const { username, password, role } = req.body;
    if (!username || typeof username !== 'string')
        return res.status(400).json({ error: 'Username is required.' });
    if (!password || typeof password !== 'string')
        return res.status(400).json({ error: 'Password is required.' });

    const db = readDB('Check before adding admin');
    if (db.users.find(u => u.username === username))
        return res.status(409).json({ error: `User "${username}" already exists.` });

    db.users.push({ username, password, role: role || 'admin', createdAt: new Date().toISOString() });
    writeDB(db, `Added new user: ${username} (${role || 'admin'})`);
    res.json({ success: true });
});

// Delete a user
app.delete('/remove-admin', (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Username required.' });

    const db = readDB('Check before removing admin');
    const before = db.users.length;
    db.users = db.users.filter(u => u.username !== username);
    if (db.users.length === before)
        return res.status(404).json({ error: 'User not found.' });

    writeDB(db, `Removed user: ${username}`);
    res.json({ success: true });
});

// ── MESSAGES ─────────────────────────────────────────────────────────────────
app.get('/data/database.json', (req, res) => {
    const db = readDB('Fetch messages via /data/database.json');
    res.json(db.messages);
});

// Save admin response AND send via WhatsApp
app.post('/save-response', async (req, res) => {
    const { msgId, response, department, responded_by } = req.body;
    if (!msgId)    return res.status(400).json({ error: 'Message ID is required' });
    if (!response) return res.status(400).json({ error: 'Response text is required' });

    const db = readDB(`Fetch DB to save response for msgId: ${msgId}`);
    const entry = db.messages.find(m => m.msgId === msgId);
    if (!entry) return res.status(404).json({ error: 'Message not found with ID ' + msgId });

    entry.response     = response;
    entry.department   = department   || '';
    entry.responded_by = responded_by || '';
    entry.resolved     = true;
    writeDB(db, `Saved response for msgId: ${msgId} by ${responded_by}`);

    const timestamp = new Date().toISOString();
    fs.appendFileSync(logPath, `[REPLY] ${timestamp} | ${responded_by} replied to ${entry.sender}: ${response}\n`);

    try {
        console.log(`Sending WhatsApp message to ${entry.sender}...`);
        if (entry.sender.includes('@lid')) {
            const chat = await client.getChatById(entry.sender);
            await chat.sendMessage(response);
        } else {
            await client.sendMessage(entry.sender, response);
        }
        fs.appendFileSync(logPath, `[WHATSAPP SENT] ${timestamp} | Message delivered to ${entry.sender}\n`);
        res.json({ success: true, whatsapp: true });
    } catch (err) {
        console.error('WhatsApp Send Error:', err);
        fs.appendFileSync(logPath, `[WHATSAPP ERROR] ${timestamp} | Failed to send to ${entry.sender}: ${err.message}\n`);
        res.json({ success: true, whatsapp: false, whatsappError: err.message });
    }
});

// Serve logs
app.get('/data/log.txt', (req, res) => res.sendFile(logPath));

// WhatsApp status
app.get('/whatsapp-status', (req, res) => res.json({ ready: clientReady }));

app.listen(UI_PORT, () => {
    console.log(`Admin UI running at http://localhost:${UI_PORT}`);
});

// ===== WHATSAPP CLIENT =====
let clientReady = false;

const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: path.join(__dirname, 'data', 'wwebjs_auth')
    })
});

client.on('ready', () => {
    clientReady = true;
    console.log('ZOU WhatsApp Bot is ready!');
    logMessage(`[SYSTEM] ${new Date().toISOString()} | WhatsApp client is READY`);
});

client.on('disconnected', (reason) => {
    clientReady = false;
    console.log('WhatsApp client disconnected:', reason);
    logMessage(`[SYSTEM] ${new Date().toISOString()} | WhatsApp client DISCONNECTED: ${reason}`);
});

client.on('auth_failure', (msg) => {
    clientReady = false;
    console.log('WhatsApp auth failure:', msg);
    logMessage(`[SYSTEM] ${new Date().toISOString()} | WhatsApp AUTH FAILURE: ${msg}`);
});

client.on('qr', (qr) => {
    logMessage(`[SYSTEM] ${new Date().toISOString()} | New QR Code generated.`);
    qrcode.generate(qr, { small: true });
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function saveToDatabase(entry) {
    const db = readDB('Read DB to save new WhatsApp message');
    db.messages.push(entry);
    writeDB(db, `Saved new incoming WhatsApp message from ${entry.sender}`);
}

function logMessage(log) {
    fs.appendFileSync(logPath, log + '\n');
}

async function saveMedia(media, filename) {
    const filePath = path.join(filesDir, filename);
    await fs.promises.writeFile(filePath, media.data, 'base64');
    return filePath;
}

// ── Incoming messages ─────────────────────────────────────────────────────────
client.on('message', async (msg) => {
    try {
        const chat = await msg.getChat();
        const isDM = chat.isGroup === false;
        const botNumber = client.info.wid.user;
        const mentioned = msg.mentionedIds && msg.mentionedIds.includes(botNumber);

        if (isDM || mentioned) {
            const now  = new Date();
            const date = now.toISOString().split('T')[0];
            const time = now.toTimeString().split(' ')[0];
            let mediaPath = null;
            let mediaType = null;

            if (msg.hasMedia) {
                const media = await msg.downloadMedia();
                if (media) {
                    const ext      = media.mimetype.split('/')[1];
                    const filename = `${msg.id.id}_${now.getTime()}.${ext}`;
                    mediaPath = await saveMedia(media, filename);
                    mediaType = media.mimetype;
                }
            }

            const hasText = msg.body && msg.body.trim().length > 0;
            if (!hasText || msg.body.length < 3 && !mediaPath) {
                msg.reply(`⚠️ Your message was empty and has not been logged.\n\nPlease send a text message and our team will assist you.`);
                logMessage(`[${date} ${time}] IGNORED empty message from ${msg.from}`);
                return;
            }

            const entry = {
                sender:         chat.id._serialized,
                msgId:          msg.id._serialized,
                message:        msg.body || '(media only)',
                media:          mediaPath,
                mediaType:      mediaType,
                date,
                time,
                channel:        'whatsapp',
                resolved:       false,
                escalation_path: null,
                response:       '',
                department:     '',
                responded_by:   ''
            };
            saveToDatabase(entry);
            logMessage(`[${date} ${time}] ${msg.from}: ${msg.body || '(media only)'}${mediaPath ? ' [media: ' + mediaPath + ']' : ''}`);

            const queryNumber = Math.random().toString(36).substr(2, 9).toUpperCase();
            const displayText = hasText ? `"${msg.body.trim()}"` : '(media attachment)';
            const ackMsg = `Your query has been received as Query ${queryNumber}\n\nHere is what we received :\n\n${displayText}\n\n\nThe ZOU team will be in touch soon`;
            msg.reply(ackMsg);
        }
    } catch (err) {
        logMessage('Error handling message: ' + err);
    }
});

// Start WhatsApp client
logMessage(`[SYSTEM] ${new Date().toISOString()} | Initializing WhatsApp client...`);
try {
    client.initialize().catch(err => {
        logMessage(`[SYSTEM ERROR] ${new Date().toISOString()} | Fatal error during initialize: ${err.message}`);
    });
} catch (err) {
    logMessage(`[SYSTEM ERROR] ${new Date().toISOString()} | Try-catch caught error: ${err.message}`);
}
