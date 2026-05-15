import { 
    makeWASocket, 
    useMultiFileAuthState, 
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
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
        browser: ["Naevis", "Chrome", "20.0.04"]
    });

    if (!sock.authState.creds.registered) {
        const botNumber = process.env.NUMBER;
        if (botNumber) {
            setTimeout(async () => {
                let code = await sock.requestPairingCode(botNumber);
                console.log(`\n\n🌸 NAEVIS SYSTEM 🌸`);
                console.log(`TU CÓDIGO DE VINCULACIÓN ES: ${code}`);
                console.log(`--------------------------\n\n`);
            }, 3000);
        }
    }

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message || m.key.fromMe) return;
        
        const from = m.key.remoteJid;
        // Limpiamos el texto: quitamos espacios y lo pasamos a minúsculas
        const text = (m.message.conversation || m.message.extendedTextMessage?.text || "").toLowerCase().trim();
        const senderNumber = from.split('@')[0];
        
        // Log de ayuda: Esto te dirá en Railway quién escribe y qué puso
        console.log(`📩 Mensaje de [${senderNumber}]: ${text}`);

        // Verificación de Dueña (compara si el número personal está incluido en la variable)
        const isOwner = process.env.OWNER_NUMBER && senderNumber.includes(process.env.OWNER_NUMBER.replace(/\D/g, ''));

        // --- COMANDOS ---

        if (text === '.ping') {
            await sock.sendMessage(from, { text: '✨ *Naevis Online* ✨\n\nSistemas operando al 100%, Jinni.' });
        }

        if (text === '.menu') {
            // Quitamos el bloqueo de isOwner por ahora para confirmar que responda
            const menuTexto = `╭─── ✨ *NAEVIS MENU* ✨ ───
│
│  🌸 *Propietaria:* Jinni
│  🎀 *Estado:* Activa
│
│  💻 *Comandos:*
│  - .ping
│  - .menu
│
╰──────────────────────────
_Crescendo Studio_`;

            await sock.sendMessage(from, { text: menuTexto });
        }
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== 401;
            if (shouldReconnect) startNaevis();
        } else if (connection === 'open') {
            console.log('✅ Naevis conectada exitosamente');
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

startNaevis();
