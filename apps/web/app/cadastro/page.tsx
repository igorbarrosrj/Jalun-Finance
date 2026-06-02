"use client"

import { useState, FormEvent } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"

export default function CadastroPage() {
  const router = useRouter()
  const [form, setForm] = useState({ nome: "", email: "", senha: "", empresa: "" })
  const [erros, setErros] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(false)
  const [erroGeral, setErroGeral] = useState("")

  function set(field: string) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErros({})
    setErroGeral("")
    setLoading(true)

    try {
      const res = await fetch(`${API_URL}/api/cadastro`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })

      const data = await res.json()

      if (!res.ok) {
        if (data.erro && typeof data.erro === "object") {
          setErros(data.erro)
        } else {
          setErroGeral(data.erro ?? "Erro ao criar conta.")
        }
        setLoading(false)
        return
      }

      // Cadastro OK → faz login automático
      const login = await signIn("credentials", {
        email: form.email,
        password: form.senha,
        redirect: false,
      })

      if (login?.error) {
        setErroGeral("Conta criada, mas erro ao entrar automaticamente. Faça login.")
        router.push("/login")
        return
      }

      router.push("/dashboard")
      router.refresh()
    } catch {
      setErroGeral("Erro de conexão. Tente novamente.")
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#fafafa] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/" className="text-base font-semibold tracking-tight text-[#0a0a0a]">
            Jalun Capital
          </Link>
          <p className="mt-1 text-sm text-[#525252]">Trial gratuito · 14 dias · 5 créditos incluídos</p>
        </div>

        <div className="bg-white border border-[#e5e5e5] rounded-lg p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Nome" error={erros.nome?.[0]}>
              <input
                type="text" value={form.nome} onChange={set("nome")}
                required minLength={2} autoComplete="name"
                placeholder="Seu nome completo"
                className={inputCls(!!erros.nome)}
              />
            </Field>

            <Field label="Email" error={erros.email?.[0]}>
              <input
                type="email" value={form.email} onChange={set("email")}
                required autoComplete="email"
                placeholder="seu@email.com"
                className={inputCls(!!erros.email)}
              />
            </Field>

            <Field label="Senha" error={erros.senha?.[0]}>
              <input
                type="password" value={form.senha} onChange={set("senha")}
                required minLength={8} autoComplete="new-password"
                placeholder="Mínimo 8 caracteres"
                className={inputCls(!!erros.senha)}
              />
            </Field>

            <Field label="Empresa (opcional)" error={undefined}>
              <input
                type="text" value={form.empresa} onChange={set("empresa")}
                autoComplete="organization"
                placeholder="Nome da empresa ou fundo"
                className={inputCls(false)}
              />
            </Field>

            {erroGeral && <p className="text-sm text-[#dc2626]">{erroGeral}</p>}

            <button
              type="submit" disabled={loading}
              className="w-full rounded-md bg-[#0a0a0a] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1a1a1a] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Criando conta…" : "Criar conta gratuita →"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-[#a3a3a3]">
          Já tem conta?{" "}
          <Link href="/login" className="text-[#525252] hover:text-[#0a0a0a] underline underline-offset-2">
            Fazer login
          </Link>
        </p>
      </div>
    </div>
  )
}

function inputCls(hasError: boolean) {
  return `w-full rounded-md border px-3 py-2.5 text-sm text-[#0a0a0a] placeholder:text-[#a3a3a3] focus:outline-none focus:ring-2 focus:border-transparent ${
    hasError
      ? "border-[#dc2626] focus:ring-[#dc2626]"
      : "border-[#e5e5e5] focus:ring-[#064e3b]"
  }`
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-[#0a0a0a] mb-1.5">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-[#dc2626]">{error}</p>}
    </div>
  )
}
