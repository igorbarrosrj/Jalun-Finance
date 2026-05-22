import type { Metadata } from "next"
import { Inter, JetBrains_Mono } from "next/font/google"
import "./globals.css"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" })

export const metadata: Metadata = {
  title: "Credor Radar — Inteligência em Recuperação Judicial",
  description:
    "Identificamos automaticamente oportunidades de cessão de crédito em processos de recuperação judicial no Brasil — antes do mercado.",
  openGraph: {
    title: "Credor Radar — Inteligência em Recuperação Judicial",
    description: "Identificamos oportunidades de cessão de crédito em RJ antes do mercado.",
    url: "https://jalun.com.br",
    siteName: "Credor Radar",
    locale: "pt_BR",
    type: "website",
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
