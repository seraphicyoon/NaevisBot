import { 
    makeWASocket, 
    useMultiFileAuthState, 
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    DisconnectReason
} from '@whiskeysockets/baileys';
import P from 'pino';
import { Boom } from '@hapi/boom';
import http from 'http'; // Para mantener vivo Railway

// --- MANTENER VIVO EL PROCESO ---
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.write('Naevis is Active');
  res.end();
}).listen(port);

process.on('uncaughtException', (err) => {
    if (err.message.includes('store.get')) return;
    console.error('⚠️ Error interno:', err);
});

async function startNaevis() {
    const { state, saveCreds } = await useMultiFileAuthState('naevis_session');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: P({ level: 'silent' }),
        printQRInTerminal: false,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.creds, P({ level: 'silent' })),
        },
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startNaevis();
        } else if (connection === 'open') {
            console.log('✅ NAEVIS ESTÁ VIVA Y CONECTADA');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message || m.key.fromMe) return;
        const from = m.key.remoteJid;
        const body = m.message.conversation || m.message.extendedTextMessage?.text || "";
        const text = body.toLowerCase().trim();
        
        console.log(`📩 Recibido: ${text}`);

        if (text === '.ping') {
            await sock.sendMessage(from, { text: '✨ *Naevis Online* ✨\n\nJinni, ya te escucho.' });
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

startNaevis();
