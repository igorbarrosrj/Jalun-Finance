import { Router } from "express"
import { z } from "zod"
import { prisma } from "../lib/db"
import { logger } from "../lib/logger"

export const contatoRouter = Router()

const SolicitacaoSchema = z.object({
  nome:      z.string().min(2).max(120),
  empresa:   z.string().min(1).max(120),
  cargo:     z.string().min(1).max(100),
  email:     z.string().email(),
  whatsapp:  z.string().optional(),
  mensagem:  z.string().max(2000).optional(),
})

async function enviarEmailNotificacao(dados: z.infer<typeof SolicitacaoSchema>, id: number) {
  const key = process.env["RESEND_API_KEY"]
  if (!key) {
    logger.warn("RESEND_API_KEY não configurado — email não enviado")
    return
  }

  const { Resend } = await import("resend")
  const resend = new Resend(key)

  const destino = process.env["CONTATO_EMAIL"] ?? "igorbarrosrj@gmail.com"

  await resend.emails.send({
    from:    "Jalun Capital <noreply@jalun.com.br>",
    to:      destino,
    subject: `[Jalun] Nova solicitação — ${dados.nome} de ${dados.empresa}`,
    html: `
      <h2 style="color:#0a2540">Nova solicitação de conversa — Jalun Capital</h2>
      <table style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:14px">
        <tr><td style="padding:8px 12px;background:#f8fafc;font-weight:600;width:140px">ID</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">#${id}</td></tr>
        <tr><td style="padding:8px 12px;background:#f8fafc;font-weight:600">Nome</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${dados.nome}</td></tr>
        <tr><td style="padding:8px 12px;background:#f8fafc;font-weight:600">Empresa</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${dados.empresa}</td></tr>
        <tr><td style="padding:8px 12px;background:#f8fafc;font-weight:600">Cargo</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${dados.cargo}</td></tr>
        <tr><td style="padding:8px 12px;background:#f8fafc;font-weight:600">Email</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0"><a href="mailto:${dados.email}">${dados.email}</a></td></tr>
        <tr><td style="padding:8px 12px;background:#f8fafc;font-weight:600">WhatsApp</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${dados.whatsapp ?? "—"}</td></tr>
        <tr><td style="padding:8px 12px;background:#f8fafc;font-weight:600;vertical-align:top">Mensagem</td><td style="padding:8px 12px">${dados.mensagem ?? "—"}</td></tr>
      </table>
      <p style="margin-top:20px;font-size:12px;color:#64748b">
        Recebido em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} ·
        <a href="https://jalun.com.br/dashboard/admin/leads">Ver todos os leads</a>
      </p>
    `,
  })
}

// ─── POST /api/contato/solicitar ─────────────────────────────────────────────

contatoRouter.post("/solicitar", async (req, res): Promise<void> => {
  const parsed = SolicitacaoSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ erro: "Dados inválidos", detalhes: parsed.error.flatten() })
    return
  }

  const dados = parsed.data

  try {
    const registro = await prisma.solicitacaoContato.create({
      data: {
        nome:     dados.nome,
        empresa:  dados.empresa,
        cargo:    dados.cargo,
        email:    dados.email,
        whatsapp: dados.whatsapp ?? null,
        mensagem: dados.mensagem ?? null,
      },
    })

    logger.info({ id: registro.id, email: dados.email, empresa: dados.empresa }, "Nova solicitação de contato")

    // Envia email em background (não bloqueia a resposta)
    enviarEmailNotificacao(dados, registro.id).catch((err) =>
      logger.error({ err: (err as Error).message }, "Falha ao enviar email de notificação")
    )

    res.json({ sucesso: true, id: registro.id })
  } catch (err) {
    logger.error({ err: (err as Error).message }, "Erro ao salvar solicitação de contato")
    res.status(500).json({ erro: "Não foi possível processar sua solicitação. Tente novamente." })
  }
})

// ─── GET /api/contato/leads ─── (admin) ──────────────────────────────────────

contatoRouter.get("/leads", async (req, res): Promise<void> => {
  const status = req.query["status"] as string | undefined
  const pagina = Math.max(1, parseInt(req.query["pagina"] as string ?? "1"))
  const porPagina = 50

  try {
    const where = status ? { status } : {}
    const [leads, total] = await Promise.all([
      prisma.solicitacaoContato.findMany({
        where,
        orderBy: { criadoEm: "desc" },
        skip: (pagina - 1) * porPagina,
        take: porPagina,
      }),
      prisma.solicitacaoContato.count({ where }),
    ])
    res.json({ data: leads, total, pagina, totalPaginas: Math.ceil(total / porPagina) })
  } catch (err) {
    res.status(500).json({ erro: (err as Error).message })
  }
})

// ─── PATCH /api/contato/leads/:id ─── (admin) ────────────────────────────────

contatoRouter.patch("/leads/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "")
  const { status } = req.body as { status?: string }

  const statusValidos = ["novo", "contatado", "qualificado", "rejeitado"]
  if (!status || !statusValidos.includes(status)) {
    res.status(400).json({ erro: "Status inválido" }); return
  }

  const atualizado = await prisma.solicitacaoContato.update({
    where: { id },
    data: {
      status,
      contatadoEm: status === "contatado" ? new Date() : undefined,
    },
  })
  res.json(atualizado)
})
