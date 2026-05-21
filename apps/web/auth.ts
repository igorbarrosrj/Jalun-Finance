import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 7, // 7 dias
  },
  cookies: {
    sessionToken: {
      options: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
      },
    },
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const usuario = await prisma.usuario.findUnique({
          where: { email: credentials.email as string },
        })

        if (!usuario || !usuario.ativo) return null

        const senhaValida = await bcrypt.compare(
          credentials.password as string,
          usuario.senhaHash
        )
        if (!senhaValida) return null

        await prisma.usuario.update({
          where: { id: usuario.id },
          data: { ultimoLogin: new Date() },
        })

        return {
          id: String(usuario.id),
          email: usuario.email,
          name: usuario.nome,
          papel: usuario.papel,
        }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.papel = (user as { papel?: string }).papel
      return token
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? ""
        ;(session.user as { papel?: string }).papel = token.papel as string
      }
      return session
    },
  },
})
