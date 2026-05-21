"use client"

import { signOut } from "next-auth/react"

export function LogoutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="text-sm text-[#525252] hover:text-[#0a0a0a] transition-colors"
    >
      Sair
    </button>
  )
}
