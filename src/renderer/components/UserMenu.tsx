import { useAuth } from '../hooks/useAuth';

export function UserMenu() {
  const { userId, signOut, isSignedIn } = useAuth();
  if (!isSignedIn) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500">{userId?.slice(0, 6)}</span>
      <button onClick={signOut} className="text-xs border rounded px-2 py-1">Sign out</button>
    </div>
  );
}
