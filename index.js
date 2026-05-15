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

// --- SERVIDOR PARA RAILWAY ---
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Naevis Active');
}).listen(port, '0.0.0.0');

process.on('uncaughtException', (err) => {
    if (err.message.includes('store.get')) return;
    console.error('⚠️ Error:', err.message);
});

async function startNaevis() {
    // Cambiamos el nombre de la sesión para forzar una nueva
    const { state, saveCreds } = await useMultiFileAuthState('sesion_final_jinni');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: P({ level: 'silent' }),
        printQRInTerminal: false,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.creds, P({ level: 'silent' })),
        },
        // Usamos una configuración de Safari en macOS que es muy estable para códigos
        browser: ["Mac OS", "Safari", "17.0"]
    });

    // --- LÓGICA DE VINCULACIÓN ---
    if (!sock.authState.creds.registered) {
        let botNumber = process.env.NUMBER;
        // Limpieza automática del número por si tiene espacios o símbolos
        botNumber = botNumber.replace(/\D/g, '');

        if (botNumber) {
            console.log(`🌸 Preparando código para: ${botNumber}`);
            setTimeout(async () => {
                try {
                    let code = await sock.requestPairingCode(botNumber);
                    console.log(`\n\n🌸 NAEVIS SYSTEM 🌸`);
                    console.log(`TU CÓDIGO DE VINCULACIÓN ES: ${code}`);
                    console.log(`--------------------------\n\n`);
                } catch (e) {
                    console.log("❌ No se pudo generar el código. Reintentando...");
                }
            }, 10000); // 10 segundos para asegurar que el socket esté listo
        }
    }

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startNaevis();
        } else if (connection === 'open') {
            console.log('✅ NAEVIS CONECTADA EXITOSAMENTE');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message || m.key.fromMe) return;
        const from = m.key.remoteJid;
        const body = m.message.conversation || m.message.extendedTextMessage?.text || "";
        const text = body.toLowerCase().trim();

        if (text === '.ping') {
            await sock.sendMessage(from, { text: '✨ *Naevis Online* ✨\n\nJinni, te escucho fuerte y claro.' });
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

startNaevis();
