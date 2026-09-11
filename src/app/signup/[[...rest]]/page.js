import { SignUp } from "@clerk/nextjs";

export default function SignupPage() {
  return (
    <div className="min-h-full flex items-center justify-center px-6 py-12">
      <SignUp />
    </div>
  );
}
