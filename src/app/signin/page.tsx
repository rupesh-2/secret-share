import { Card, ErrorNote, Sub, Title } from "../ui";
import GoogleButton from "./google-button";

const MESSAGES: Record<string, string> = {
  domain: "Only @inseed.dev accounts can sign in.",
  exchange: "Sign-in could not be completed. Please try again.",
  missing_code: "Sign-in was interrupted. Please try again.",
  auth: "Please sign in to continue.",
};

export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <Card>
      <Title>Inseed Vault</Title>
      <Sub>Sign in with your @inseed.dev Google account to open your vault.</Sub>

      {error && (
        <div className="mt-4">
          <ErrorNote>{MESSAGES[error] ?? "Sign-in failed."}</ErrorNote>
        </div>
      )}

      <div className="mt-6">
        <GoogleButton />
      </div>

      <p className="mt-4 text-center text-xs text-neutral-500">
        Company accounts only — there is no public sign-up.
      </p>
    </Card>
  );
}
