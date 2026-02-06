import { SignUp } from "@clerk/nextjs";

export default function CheckEmailPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6 py-12">
      <SignUp />
    </div>
  );
}