"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";

export function Nav({ email }: { email: string }) {
  return (
    <nav className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3">
      <Link href="/dashboard" className="font-semibold">
        Clip Me
      </Link>
      <div className="flex items-center gap-4 text-sm">
        <Link href="/new" className="font-medium text-zinc-900 underline">
          New Clip
        </Link>
        <span className="text-zinc-500">{email}</span>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="text-zinc-500 underline"
        >
          Log out
        </button>
      </div>
    </nav>
  );
}
