import { Router } from "express"
import { z } from "zod"
import { prisma } from "../lib/db"
import { logger } from "../lib/logger"
import {
  obterOuCriarCliente,
  criarCobranca,
  buscarPixQrCode,
  consultarCobranca,
  validarTokenWebhook,
  type MetodoPagamento,
} from "../integrations/asaas"

export const checkoutRouter = Router()

const VALOR_DESIGN_PARTNER = 1997.00

const CheckoutSchema = z.object({
  nome:     z.string().min(2).max(120),
  empresa:  z.string().min(1).max(120),
  cnpj:     z.string().optional(),
  email:    z.string().email(),
  whatsapp: z.string().min(8),
  metodo:   z.enum(["PIX", "BOLETO"]),
})

// ─── POST /api/checkout/criar ─────────────────────────────────────────────────

checkoutRouter.post("/criar", async (req, res): Promise<void> => {
  const parsed = CheckoutSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ erro: "Dados inválidos", detalhes: parsed.error.flatten() }); return
  }
  const dados = parsed.data

  try {
    // 1. Cliente no Asaas
    const customerId = await obterOuCriarCliente({
      nome:     dados.nome,
      email:    dados.email,
      cnpj:     dados.cnpj,
      whatsapp: dados.whatsapp,
    })

    // 2. Criar cobrança
    const cobranca = await criarCobranca({
      customerId,
      valor:     VALOR_DESIGN_PARTNER,
      metodo:    dados.metodo as MetodoPagamento,
      descricao: `Jalun Capital — Design Partner — ${dados.empresa}`,
      referencia: `jalun_dp_${dados.email}_${Date.now()}`,
    })

    // 3. PIX: buscar QR code
    let pixPayload: string | null = null
    let pixQrCode: string | null = null
    if (dados.metodo === "PIX") {
      const pix = await buscarPixQrCode(cobranca.id)
      pixPayload = pix.payload
      pixQrCode  = pix.encodedImage
    }

    // 4. Salvar no banco
    await prisma.pagamento.create({
      data: {
        nome:            dados.nome,
        empresa:         dados.empresa,
        cnpj:            dados.cnpj ?? null,
        email:           dados.email,
        whatsapp:        dados.whatsapp,
        asaasCustomerId: customerId,
        asaasPaymentId:  cobranca.id,
        metodo:          dados.metodo.toLowerCase(),
        valor:           VALOR_DESIGN_PARTNER,
        status:          "pendente",
      },
    })

    logger.info({ paymentId: cobranca.id, email: dados.email, metodo: dados.metodo }, "Cobrança criada")

    res.json({
      paymentId:   cobranca.id,
      metodo:      dados.metodo,
      valor:       VALOR_DESIGN_PARTNER,
      boletoUrl:   cobranca.bankSlipUrl ?? null,
      pixPayload,
      pixQrCode,
      vencimento:  cobranca.dueDate,
    })
  } catch (err) {
    const msg = (err as Error).message
    logger.error({ err: msg }, "Erro ao criar cobrança Asaas")
    res.status(503).json({ erro: "Não foi possível gerar a cobrança. Tente novamente." })
  }
})

// ─── GET /api/checkout/status/:paymentId ─────────────────────────────────────

checkoutRouter.get("/status/:paymentId", async (req, res): Promise<void> => {
  const { paymentId } = req.params

  const pagamento = await prisma.pagamento.findUnique({
    where: { asaasPaymentId: paymentId },
    select: { id: true, status: true, nome: true, empresa: true, pagoEm: true, metodo: true, valor: true },
  })
  if (!pagamento) { res.status(404).json({ erro: "Pagamento não encontrado" }); return }

  // Consulta status em tempo real no Asaas
  try {
    const asaas = await consultarCobranca(paymentId)
    const statusAsaas = asaas.status // PENDING, RECEIVED, CONFIRMED, OVERDUE, etc.
    const pago = ["RECEIVED", "CONFIRMED"].includes(statusAsaas)

    if (pago && pagamento.status !== "pago") {
      await prisma.pagamento.update({
        where: { asaasPaymentId: paymentId },
        data: { status: "pago", pagoEm: new Date() },
      })
    }

    res.json({ ...pagamento, statusAsaas, pago })
  } catch {
    res.json({ ...pagamento, statusAsaas: "unknown", pago: false })
  }
})

// ─── POST /api/webhooks/asaas ─────────────────────────────────────────────────

checkoutRouter.post("/webhook-asaas", async (req, res): Promise<void> => {
  const token = req.headers["asaas-access-token"] as string ?? ""
  if (!validarTokenWebhook(token)) {
    res.status(401).json({ erro: "Token inválido" }); return
  }

  const evento    = req.body?.event as string
  const paymentId = req.body?.payment?.id as string

  logger.info({ evento, paymentId }, "Webhook Asaas recebido")

  const eventosConfirmados = ["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]
  if (!eventosConfirmados.includes(evento) || !paymentId) {
    res.json({ ignorado: true }); return
  }

  try {
    const pagamento = await prisma.pagamento.findUnique({
      where: { asaasPaymentId: paymentId },
    })
    if (!pagamento) { res.json({ ignorado: true }); return }

    await prisma.pagamento.update({
      where: { asaasPaymentId: paymentId },
      data: { status: "pago", pagoEm: new Date() },
    })

    logger.info({ paymentId, email: pagamento.email }, "Pagamento confirmado via webhook")

    // Notifica por email
    const key = process.env["RESEND_API_KEY"]
    if (key) {
      const { Resend } = await import("resend")
      const resend = new Resend(key)
      const destino = process.env["CONTATO_EMAIL"] ?? "igorbarrosrj@gmail.com"
      await resend.emails.send({
        from:    "Jalun Capital <noreply@jalun.com.br>",
        to:      destino,
        subject: `[Jalun] PAGAMENTO CONFIRMADO — ${pagamento.nome} de ${pagamento.empresa}`,
        html: `
          <h2 style="color:#064e3b">✅ Pagamento Confirmado — Jalun Capital</h2>
          <table style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:14px">
            <tr><td style="padding:8px 12px;background:#f0fdf4;font-weight:600;width:140px">Nome</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${pagamento.nome}</td></tr>
            <tr><td style="padding:8px 12px;background:#f0fdf4;font-weight:600">Empresa</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${pagamento.empresa}</td></tr>
            <tr><td style="padding:8px 12px;background:#f0fdf4;font-weight:600">Email</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0"><a href="mailto:${pagamento.email}">${pagamento.email}</a></td></tr>
            <tr><td style="padding:8px 12px;background:#f0fdf4;font-weight:600">WhatsApp</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${pagamento.whatsapp ?? "—"}</td></tr>
            <tr><td style="padding:8px 12px;background:#f0fdf4;font-weight:600">Método</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${pagamento.metodo.toUpperCase()}</td></tr>
            <tr><td style="padding:8px 12px;background:#f0fdf4;font-weight:600">Valor</td><td style="padding:8px 12px">R$ ${parseFloat(pagamento.valor.toString()).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td></tr>
          </table>
          <p style="margin-top:20px;background:#fef3c7;padding:12px;border-radius:8px;font-size:13px">
            <strong>Próximo passo:</strong> Ative o acesso do usuário manualmente e envie as credenciais pelo email acima.
          </p>
        `,
      }).catch((e: Error) => logger.error({ err: e.message }, "Falha ao enviar email de pagamento"))
    }

    res.json({ processado: true })
  } catch (err) {
    logger.error({ err: (err as Error).message }, "Erro ao processar webhook Asaas")
    res.status(500).json({ erro: "Erro interno" })
  }
})
