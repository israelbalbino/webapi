import express from "express"
import cors from "cors"
import qrcode from "qrcode"
import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } from "@whiskeysockets/baileys"

const app = express()
app.use(cors())
app.use(express.json())

let sock = null
let qrCodeDataUrl = null

// Iniciar conexão WhatsApp
app.post("/connect", async (req, res) => {
  if (sock) return res.json({ status: "Já conectado ou em processo" })

  try {
    const { state, saveCreds } = await useMultiFileAuthState("./auth")
    const { version } = await fetchLatestBaileysVersion()

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      browser: ["Ubuntu", "Chrome", "1.0.0"]
    })

    sock.ev.on("connection.update", async ({ connection, qr, lastDisconnect }) => {
      if (qr) {
        // converte QR code para imagem base64
        qrCodeDataUrl = await qrcode.toDataURL(qr)
      }

      if (connection === "open") {
        console.log("📲 Conectado com sucesso!")
        qrCodeDataUrl = null
      }

      if (connection === "close") {
        console.log("❌ Desconectado")
        const statusCode = lastDisconnect?.error?.output?.statusCode
        if (statusCode !== 401) {
          console.log("🔄 Tentando reconectar...")
          sock = null
        } else {
          console.log("⚠️ Sessão inválida. Apague a pasta auth e tente novamente.")
          sock = null
          qrCodeDataUrl = null
        }
      }
    })

    sock.ev.on("creds.update", saveCreds)

    res.json({ status: "Conexão iniciada. Aguarde o QR code em /qr" })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

// SSE para enviar QR code em tempo real
app.get("/qr", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream")
  res.setHeader("Cache-Control", "no-cache")
  res.setHeader("Connection", "keep-alive")
  res.flushHeaders()

  const sendQR = () => {
    res.write(`data: ${qrCodeDataUrl || "null"}\n\n`)
  }

  sendQR()
  const interval = setInterval(sendQR, 2000)

  req.on("close", () => clearInterval(interval))
})

// Logout / desconectar
app.post("/logout", async (req, res) => {
  if (!sock) return res.json({ status: "Não conectado" })
  await sock.logout()
  sock = null
  qrCodeDataUrl = null
  res.json({ status: "Desconectado" })
})

// Buscar foto de contato
app.get("/foto/:numero", async (req, res) => {
  if (!sock) return res.status(500).json({ error: "WhatsApp não conectado" })
  try {
    const numero = req.params.numero.replace(/\D/g, "") + "@s.whatsapp.net"
    const url = await sock.profilePictureUrl(numero, "image")
    res.json({ numero, fotoUrl: url })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.listen(3000, () => console.log("🚀 Backend rodando em http://localhost:3000"))
