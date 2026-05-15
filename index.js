import { 
    makeWASocket, 
    useMultiFileAuthState, 
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    DisconnectReason
} from '@whiskeysockets/baileys';
import P from 'pino';
import { Boom } from '@hapi/boom';

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

    // --- MANEJO DE CONEXIÓN Y PAIRING ---
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('🔄 Conexión cerrada, reintentando:', shouldReconnect);
            if (shouldReconnect) startNaevis();
        } else if (connection === 'open') {
            console.log('✅ Naevis conectada exitosamente');
        }

        // PEDIR CÓDIGO SOLO CUANDO ESTÉ LISTO
        if (!sock.authState.creds.registered && connection === 'connecting') {
            const botNumber = process.env.NUMBER;
            if (botNumber) {
                console.log(`🌸 NAEVIS: Preparando vinculación para ${botNumber}...`);
                // Esperamos un poco a que el socket esté estable
                setTimeout(async () => {
                    try {
                        let code = await sock.requestPairingCode(botNumber);
                        console.log(`\n\n🌸 NAEVIS SYSTEM 🌸`);
                        console.log(`TU CÓDIGO DE VINCULACIÓN ES: ${code}`);
                        console.log(`--------------------------\n\n`);
                    } catch (error) {
                        console.log('❌ Error al pedir pairing code:', error.message);
                    }
                }, 5000); // 5 segundos de espera para asegurar estabilidad
            }
        }
    });

    // --- MANEJO DE MENSAJES ---
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message || m.key.fromMe) return;
        
        const from = m.key.remoteJid;
        const text = (m.message.conversation || m.message.extendedTextMessage?.text || "").toLowerCase().trim();
        const senderNumber = from.split('@')[0];
        
        console.log(`📩 Mensaje de [${senderNumber}]: ${text}`);

        if (text === '.ping') {
            await sock.sendMessage(from, { text: '✨ *Naevis Online* ✨\n\nOperando al 100%, Jinni.' });
        }

        if (text === '.menu') {
            const menuTexto = `╭─── ✨ *NAEVIS MENU* ✨ ───\n│\n│  🌸 *Dueña:* Jinni\n│  🎀 *Estado:* Activa\n│\n╰──────────────────────────`;
            await sock.sendMessage(from, { text: menuTexto });
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

startNaevis().catch(err => console.log("Error en arranque:", err));
