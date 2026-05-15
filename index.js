import { 
    makeWASocket, 
    useMultiFileAuthState, 
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    DisconnectReason
} from '@whiskeysockets/baileys';
import P from 'pino';
import { Boom } from '@hapi/boom';
import http from 'http';

// --- MANTENER VIVO EL PROCESO (CORREGIDO PARA RAILWAY) ---
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write('Naevis is Active');
    res.end();
}).listen(port, '0.0.0.0', () => {
    console.log(`📡 Servidor de salud activo en puerto: ${port}`);
});

process.on('uncaughtException', (err) => {
    if (err.message.includes('store.get')) return;
    console.error('⚠️ Error interno:', err);
});

async function startNaevis() {
    const { state, saveCreds } = await useMultiFileAuthState('sesion_nueva');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: P({ level: 'silent' }),
        printQRInTerminal: false,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.creds, P({ level: 'silent' })),
        },
        browser: ["Naevis Bot", "Safari", "1.0.0"]
    });

    // --- LÓGICA DE VINCULACIÓN ---
    if (!sock.authState.creds.registered) {
        const botNumber = process.env.NUMBER;
        if (botNumber) {
            setTimeout(async () => {
                try {
                    let code = await sock.requestPairingCode(botNumber);
                    console.log(`\n\n🌸 NAEVIS SYSTEM 🌸`);
                    console.log(`TU CÓDIGO DE VINCULACIÓN ES: ${code}`);
                    console.log(`--------------------------\n\n`);
                } catch (e) {
                    console.log("❌ Error al generar código:", e.message);
                }
            }, 5000);
        }
    }

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
