"use client"

import { useState } from "react"
import Link from "next/link"
import { ContatoModal } from "./ContatoModal"

export function NavCTAs() {
  const [modalAberto, setModalAberto] = useState(false)
  return (
    <>
      <div className="flex items-center gap-4">
        <a href="#parceiros" className="text-sm text-[#525252] hover:text-[#0a0a0a] transition-colors duration-150 hidden md:inline">
          Parceiros
        </a>
        <Link href="/login" className="text-sm text-[#525252] hover:text-[#0a0a0a] transition-colors duration-150">
          Entrar
        </Link>
        <button
          onClick={() => setModalAberto(true)}
          className="text-sm rounded-md bg-[#0a2540] px-4 py-2 font-medium text-white hover:bg-[#0d3560] transition-colors duration-150"
        >
          Solicitar conversa →
        </button>
      </div>
      {modalAberto && <ContatoModal onFechar={() => setModalAberto(false)} />}
    </>
  )
}

export function HeroCTAs() {
  const [modalAberto, setModalAberto] = useState(false)
  return (
    <>
      <div className="mt-10 flex flex-wrap items-center gap-4">
        <button
          onClick={() => setModalAberto(true)}
          className="inline-flex items-center rounded-md bg-[#0a2540] px-6 py-3 text-sm font-medium text-white hover:bg-[#0d3560] transition-colors duration-150"
        >
          Solicitar conversa →
        </button>
        <Link href="/login" className="text-sm text-[#525252] hover:text-[#0a0a0a] transition-colors duration-150">
          Já tenho conta
        </Link>
      </div>
      {modalAberto && <ContatoModal onFechar={() => setModalAberto(false)} />}
    </>
  )
}

export function ParceiroCTAs() {
  const [modalAberto, setModalAberto] = useState(false)
  return (
    <>
      <div className="flex flex-col gap-3">
        {/* Primário */}
        <div>
          <button
            onClick={() => setModalAberto(true)}
            className="w-full block text-center rounded-md bg-white text-[#0a2540] text-sm font-semibold px-5 py-3 hover:bg-[#f1f5f9] transition-colors duration-150"
          >
            Solicitar conversa →
          </button>
          <p className="text-center text-xs text-[#94a3b8] mt-1.5">
            Conheça o produto e converse com o founder
          </p>
        </div>

        <div className="h-px bg-white/10" />

        {/* Secundário */}
        <div>
          <Link
            href="/checkout"
            className="w-full block text-center rounded-md border border-white/30 text-white text-sm font-medium px-5 py-2.5 hover:border-white/60 hover:bg-white/5 transition-colors duration-150"
          >
            Já decidido — assinar agora
          </Link>
          <p className="text-center text-xs text-[#64748b] mt-1.5">
            Pague direto via PIX ou boleto
          </p>
        </div>
      </div>
      {modalAberto && <ContatoModal onFechar={() => setModalAberto(false)} />}
    </>
  )
}

export function CTAFinalButtons() {
  const [modalAberto, setModalAberto] = useState(false)
  return (
    <>
      <div className="flex flex-wrap items-center justify-center gap-4">
        <button
          onClick={() => setModalAberto(true)}
          className="inline-flex items-center rounded-md bg-white px-7 py-3.5 text-sm font-medium text-[#0a2540] hover:bg-[#f1f5f9] transition-colors duration-150"
        >
          Solicitar conversa →
        </button>
        <Link
          href="/checkout"
          className="inline-flex items-center rounded-md border border-white/30 px-7 py-3.5 text-sm font-medium text-white hover:border-white/60 hover:bg-white/5 transition-colors duration-150"
        >
          Assinar agora
        </Link>
      </div>
      {modalAberto && <ContatoModal onFechar={() => setModalAberto(false)} />}
    </>
  )
}
