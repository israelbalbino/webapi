import express from "express"
import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion } from "@whiskeysockets/baileys"
import qrcode from "qrcode-terminal"

const app = express()
app.use(express.json())

const PORT = process.env.PORT || 3000;

let sock

async function startWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState("./auth")
    const { version } = await fetchLatestBaileysVersion()

    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false, // vamos gerar QR manualmente
        browser: ["Ubuntu", "Chrome", "1.0.0"]
    })

    sock.ev.on("connection.update", ({ connection, qr, lastDisconnect }) => {
        if (qr) {
            console.log("📌 Escaneie este QR no WhatsApp do celular:")
            qrcode.generate(qr, { small: true })
            
        }

        if (connection === "open") {
            console.log("📲 Conectado com sucesso!")
        }

        if (connection === "close") {
            console.log("❌ Desconectado")
            if (lastDisconnect?.error?.output?.statusCode !== 401) {
                console.log("🔄 Tentando reconectar...")
                startWhatsApp()
            } else {
                console.log("⚠️ Sessão inválida. Apague a pasta auth e tente novamente.")
            }
        }
    })

    sock.ev.on("creds.update", saveCreds)
}

// Inicia a conexão com WhatsApp
startWhatsApp()

// ---------- ROTAS DA API -------------

// Buscar foto de perfil de um contato
app.get("/foto/:numero", async (req, res) => {
    try {
        if (!sock) return res.status(500).send("WhatsApp não conectado")

        const numero = req.params.numero.replace(/\D/g, "") + "@s.whatsapp.net"
        const fotoUrl = await sock.profilePictureUrl(numero, "image")

        res.json({ numero, fotoUrl })
    } catch (e) {
        res.status(500).json({ erro: e.message })
    }
})


// Endpoint para desconectar/log out do WhatsApp
app.post("/logout", async (req, res) => {
    try {
        if (!sock) return res.status(500).json({ erro: "WhatsApp não conectado" })

        await sock.logout() // encerra a sessão
        sock = null // remove referência para forçar nova conexão

        // opcional: apagar a pasta auth para garantir nova sessão
        const fs = await import("fs")
        fs.rmSync("./auth", { recursive: true, force: true })

        res.json({ status: "Desconectado com sucesso. Será necessário escanear o QR novamente." })
    } catch (e) {
        res.status(500).json({ erro: e.message })
    }
})


app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
  });
