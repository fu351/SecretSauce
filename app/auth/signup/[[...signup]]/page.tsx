import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e8dcc4] flex items-center justify-center py-12 px-6">
      <SignUp afterSignUpUrl="/onboarding" redirectUrl="/dashboard" />
    </div>
  );
}