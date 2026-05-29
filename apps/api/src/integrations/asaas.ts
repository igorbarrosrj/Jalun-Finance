import axios from "axios"

const api = axios.create({
  baseURL: process.env["ASAAS_BASE_URL"] ?? "https://sandbox.asaas.com/api/v3",
  timeout: 20_000,
  headers: {
    "access_token": process.env["ASAAS_API_KEY"] ?? "",
    "Content-Type": "application/json",
  },
})

export interface AsaasCliente {
  id: string
  name: string
  email: string
}

export interface AsaasCobranca {
  id: string
  status: string
  invoiceUrl: string | null
  bankSlipUrl: string | null
  dueDate: string
  value: number
}

export interface AsaasPixQrCode {
  encodedImage: string
  payload: string
  expirationDate: string
}

// ─── Clientes ────────────────────────────────────────────────────────────────

export async function criarCliente(dados: {
  nome: string
  email: string
  cnpj?: string
  whatsapp?: string
}): Promise<string> {
  const { data } = await api.post<AsaasCliente>("/customers", {
    name:              dados.nome,
    email:             dados.email,
    cpfCnpj:          dados.cnpj ?? undefined,
    mobilePhone:      dados.whatsapp ?? undefined,
    externalReference: dados.email,
    notificationDisabled: true,
  })
  return data.id
}

export async function buscarClientePorEmail(email: string): Promise<string | null> {
  const { data } = await api.get<{ data: AsaasCliente[] }>("/customers", {
    params: { email, limit: 1 },
  })
  return data.data[0]?.id ?? null
}

export async function obterOuCriarCliente(dados: {
  nome: string
  email: string
  cnpj?: string
  whatsapp?: string
}): Promise<string> {
  const existente = await buscarClientePorEmail(dados.email)
  if (existente) return existente
  return criarCliente(dados)
}

// ─── Cobranças ───────────────────────────────────────────────────────────────

export type MetodoPagamento = "PIX" | "BOLETO"

export async function criarCobranca(dados: {
  customerId: string
  valor: number
  metodo: MetodoPagamento
  descricao: string
  referencia?: string
}): Promise<AsaasCobranca> {
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
  const { data } = await api.post<AsaasCobranca>("/payments", {
    customer:          dados.customerId,
    billingType:       dados.metodo,
    value:             dados.valor,
    dueDate:           hoje,
    description:       dados.descricao.slice(0, 255),
    externalReference: dados.referencia ?? undefined,
  })
  return data
}

export async function buscarPixQrCode(paymentId: string): Promise<AsaasPixQrCode> {
  const { data } = await api.get<AsaasPixQrCode>(`/payments/${paymentId}/pixQrCode`)
  return data
}

export async function consultarCobranca(paymentId: string): Promise<AsaasCobranca> {
  const { data } = await api.get<AsaasCobranca>(`/payments/${paymentId}`)
  return data
}

export async function cancelarCobranca(paymentId: string): Promise<void> {
  await api.delete(`/payments/${paymentId}`)
}

// ─── Webhook ─────────────────────────────────────────────────────────────────

export function validarTokenWebhook(tokenRecebido: string): boolean {
  const esperado = process.env["ASAAS_WEBHOOK_TOKEN"]
  if (!esperado) return true // sem token configurado, aceita tudo (só sandbox)
  return tokenRecebido === esperado
}
