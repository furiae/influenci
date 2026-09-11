import { SignIn } from "@clerk/nextjs";

export default function LoginPage() {
  return (
    <div className="min-h-full flex items-center justify-center px-6 py-12">
      <SignIn />
    </div>
  );
}
