import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Creator-side auth. Only verified Google accounts on ALLOWED_EMAIL_DOMAIN may
 * sign in and mint links. Recipients never authenticate here — they prove
 * control of their inbox via the OTP flow instead.
 */
function domainAllowed(email: string): boolean {
  const domains = (process.env.ALLOWED_EMAIL_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  // Fail closed: an unset allowlist locks everyone out rather than letting
  // any Google account in the world mint links.
  if (domains.length === 0) return false;
  const at = email.lastIndexOf("@");
  if (at === -1) return false;
  return domains.includes(email.slice(at + 1).toLowerCase());
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" },
  callbacks: {
    signIn({ profile }) {
      if (!profile?.email || profile.email_verified !== true) return false;
      return domainAllowed(profile.email);
    },
    jwt({ token, profile }) {
      if (profile?.email) token.email = profile.email.toLowerCase();
      return token;
    },
    session({ session, token }) {
      if (token.email) session.user.email = token.email;
      return session;
    },
  },
});
