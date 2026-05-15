import { 
    makeWASocket, 
    useMultiFileAuthState, 
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} from '@whiskeysockets/baileys';
import P from 'pino';
import { Boom } from '@hapi/boom';

async function startNaevis() {
    // 1. Configuración de sesión (se guardará en una carpeta llamada naevis_session)
    const { state, saveCreds } = await useMultiFileAuthState('naevis_session');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: P({ level: 'silent' }),
        printQRInTerminal: false, // Desactivamos QR para usar Pairing Code
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.creds, P({ level: 'silent' })),
        },
        browser: ["Ubuntu", "Chrome", "20.0.0.4"]
    });

    // 2. Lógica para generar el Pairing Code en los Logs de Railway
    if (!sock.authState.creds.registered) {
        const botNumber = process.env.NUMBER; // El número del chip del bot
        if (botNumber) {
            setTimeout(async () => {
                let code = await sock.requestPairingCode(botNumber);
                console.log(`\n\n🌸 NAEVIS SYSTEM 🌸`);
                console.log(`TU CÓDIGO DE VINCULACIÓN ES: ${code}`);
                console.log(`--------------------------\n\n`);
            }, 3000);
        } else {
            console.log("❌ Error: No has puesto la variable NUMBER en Railway");
        }
    }

    // 3. Manejo de mensajes y comandos
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message || m.key.fromMe) return;
        
        const from = m.key.remoteJid;
        const text = m.message.conversation || m.message.extendedTextMessage?.text || "";
        const senderNumber = from.split('@')[0];
        
        // Verificamos si quien escribe es tu número personal (7578)
        const isOwner = senderNumber.includes(process.env.OWNER_NUMBER);

        // --- COMANDOS ---

        // Comando: .ping
        if (text === '.ping') {
            await sock.sendMessage(from, { text: '✨ *Naevis Online* ✨\n\nSistemas operando al 100%, Jinni.' });
        }

        // Comando: .menu
        if (text === '.menu') {
            if (!isOwner) return; // Solo tú puedes ver el menú por ahora

            const menuTexto = `
╭─── ✨ *NAEVIS MENU* ✨ ───
│
│  🌸 *Propietaria:* Jinni
│  🎀 *Estado:* Desarrollo
│
│  💻 *Comandos Disponibles:*
│  - .ping (Estado del bot)
│  - .menu (Lista de comandos)
│  - .sticker (Envía una imagen y pon esto)
│
╰──────────────────────────
_Crescendo Studio & Architecture Design_`;

            await sock.sendMessage(from, { text: menuTexto });
        }
    });

    // 4. Gestión de la conexión
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== 401;
            if (shouldReconnect) startNaevis();
        } else if (connection === 'open') {
            console.log('✅ Naevis conectada exitosamente a WhatsApp');
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

// Iniciar el bot
startNaevis();
