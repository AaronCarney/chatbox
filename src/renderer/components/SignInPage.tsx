import { useState, type FormEvent } from 'react';
import { useAuth } from '../hooks/useAuth';

export function SignInPage() {
  const { signIn, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try { await signIn(email, password); }
    catch (err) { setError((err as Error).message); }
  }

  return (
    <div className="mx-auto max-w-sm p-8">
      <h1 className="text-2xl font-semibold mb-6">Sign in</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label>
          <span className="text-sm">Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full border rounded p-2" />
        </label>
        <label>
          <span className="text-sm">Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full border rounded p-2" />
        </label>
        <button type="submit" className="bg-black text-white rounded p-2">Sign in</button>
      </form>
      <div className="my-4 text-center text-xs text-gray-500">or</div>
      <button onClick={signInWithGoogle} className="w-full border rounded p-2">Continue with Google</button>
      {error !== null ? <div className="mt-4 text-red-600 text-sm">{error}</div> : null}
    </div>
  );
}
