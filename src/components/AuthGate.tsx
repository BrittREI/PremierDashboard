import { useState, useCallback } from "react";

const STORAGE_KEY = "ppp-dash-auth";

// Hash the password so it's not stored in plain text in the bundle
async function hashPassword(password: string): Promise<string> {
  const encoded = new TextEncoder().encode(password);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Pre-computed SHA-256 hash — password itself is not in the bundle
const VALID_HASH =
  "0cc65994eca330409fb803260b200dd601214b3eb26a39c9162ae3ac59cd0995";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState(
    () => sessionStorage.getItem(STORAGE_KEY) === "true"
  );
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const inputHash = await hashPassword(password);

      if (inputHash === VALID_HASH) {
        sessionStorage.setItem(STORAGE_KEY, "true");
        setAuthed(true);
        setError(false);
      } else {
        setError(true);
        setPassword("");
      }
    },
    [password]
  );

  if (authed) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-slate-900">Premier Path</h1>
          <p className="text-sm text-slate-500 mt-1">Dashboard Login</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter dashboard password"
              autoFocus
            />
          </div>
          {error && (
            <p className="text-sm text-red-500">Incorrect password</p>
          )}
          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Sign In
          </button>
        </form>
        <p className="text-xs text-slate-400 text-center mt-6">
          Premier Path Properties · Charlotte, NC
        </p>
      </div>
    </div>
  );
}
