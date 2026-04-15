import SignInForm from "./SignInForm";

/**
 * Sign-in page. Public (allowed through the middleware auth gate).
 * The form is a client component; the rest is server-rendered.
 */
export default function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; "signed-out"?: string }>;
}) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 text-zinc-100 px-6 py-16">
      <div className="w-full max-w-md">
        <h1
          className="text-center text-2xl tracking-[0.18em] font-serif text-amber-500 mb-2"
          style={{ fontFamily: "Cinzel, serif" }}
        >
          MASONIC RITUAL MENTOR
        </h1>
        <p className="text-center text-sm text-zinc-400 mb-10">
          Sign in to the pilot.
        </p>
        <SignInForm searchParamsPromise={searchParams} />
        <p className="mt-12 text-center text-[11px] text-zinc-600 leading-relaxed">
          Pilot build. Pending Grand Lodge review.
          <br />
          Access is limited to Brothers on the approved list.
        </p>
      </div>
    </main>
  );
}
