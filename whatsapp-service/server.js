import express from 'express';
import cors from 'cors';
import qrcode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pino from 'pino';
import dotenv from 'dotenv';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const AUTH_DIR = path.join(__dirname, 'auth_info_baileys');

app.use(cors());
app.use(express.json({ limit: '50mb' }));

let sock = null;
let currentQr = null;
let isConnected = false;
let botInfo = { phone: null, pushName: null };

async function startWhatsApp() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`[WhatsApp] Using Baileys version: ${version.join('.')}, isLatest: ${isLatest}`);

    sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'silent' }),
      browser: ['LMS India SaaS', 'Chrome', '1.0.0'],
      syncFullHistory: false,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('[WhatsApp] New QR code generated. Ready for scanning.');
        try {
          currentQr = await qrcode.toDataURL(qr);
        } catch (err) {
          console.error('[WhatsApp] QR generation error:', err);
        }
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        isConnected = false;
        botInfo = { phone: null, pushName: null };
        console.log(`[WhatsApp] Connection closed (code: ${statusCode}). Reconnecting: ${shouldReconnect}`);

        if (shouldReconnect) {
          setTimeout(startWhatsApp, 3000);
        } else {
          console.log('[WhatsApp] Logged out. Cleaning auth directory...');
          try {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          } catch {}
          setTimeout(startWhatsApp, 3000);
        }
      } else if (connection === 'open') {
        console.log('[WhatsApp] Connection opened successfully!');
        isConnected = true;
        currentQr = null;

        const user = sock.user;
        botInfo = {
          phone: user?.id ? user.id.split(':')[0] : null,
          pushName: user?.name || 'Laundry Bot',
        };
        console.log(`[WhatsApp] Connected as: ${botInfo.phone} (${botInfo.pushName})`);
      }
    });
  } catch (err) {
    console.error('[WhatsApp] Initialization error:', err);
    setTimeout(startWhatsApp, 5000);
  }
}

// Health & Status
app.get('/status', (req, res) => {
  res.json({
    success: true,
    connected: isConnected,
    phone: botInfo.phone,
    pushName: botInfo.pushName,
    qr: currentQr,
  });
});

// Send Message (Text or Media with Caption)
app.post('/send', async (req, res) => {
  if (!isConnected || !sock) {
    return res.status(503).json({
      success: false,
      message: 'WhatsApp is not connected. Please scan the QR code in LMS first.',
    });
  }

  const { number, text, imageUrl } = req.body;
  if (!number || !text) {
    return res.status(400).json({ success: false, message: 'Number and text are required.' });
  }

  try {
    // Format Indian 10-digit number to standard WhatsApp JID (e.g. 919876543210@s.whatsapp.net)
    const cleanDigits = number.replace(/\D/g, '');
    const fullNumber = cleanDigits.length === 10 ? `91${cleanDigits}` : cleanDigits;
    const jid = `${fullNumber}@s.whatsapp.net`;

    let sentMsg;

    if (imageUrl && imageUrl.trim()) {
      if (imageUrl.startsWith('data:image')) {
        // Base64 image
        const base64Data = imageUrl.split(',')[1];
        const buffer = Buffer.from(base64Data, 'base64');
        sentMsg = await sock.sendMessage(jid, {
          image: buffer,
          caption: text,
        });
      } else {
        // HTTP URL image
        sentMsg = await sock.sendMessage(jid, {
          image: { url: imageUrl.trim() },
          caption: text,
        });
      }
    } else {
      // Plain text
      sentMsg = await sock.sendMessage(jid, { text });
    }

    return res.json({
      success: true,
      messageId: sentMsg?.key?.id,
      recipient: jid,
    });
  } catch (error) {
    console.error('[WhatsApp] Send error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to send WhatsApp message.',
    });
  }
});

// Logout / Unlink
app.post('/logout', async (req, res) => {
  try {
    if (sock) {
      await sock.logout();
    }
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    isConnected = false;
    currentQr = null;
    botInfo = { phone: null, pushName: null };
    setTimeout(startWhatsApp, 2000);
    res.json({ success: true, message: 'Logged out successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(` LMS WhatsApp Gateway running on port ${PORT}`);
  console.log(` Endpoints:`);
  console.log(`   GET  http://localhost:${PORT}/status`);
  console.log(`   POST http://localhost:${PORT}/send`);
  console.log(`   POST http://localhost:${PORT}/logout`);
  console.log(`===============================================`);
  startWhatsApp();
});
