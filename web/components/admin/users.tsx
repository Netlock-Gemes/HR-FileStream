"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, KeyRound, LogOut, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Failed } from "@/components/states";
import { api } from "@/lib/api";
import { Account, ADMIN, ConfirmButton, Field, input, Section, since, Toggle } from "./ui";

// No look-alike characters, grouped so it can be read aloud
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
function generate() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const chars = Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8)}`;
}

export function UsersTab() {
  const client = useQueryClient();
  const accounts = useQuery({ queryKey: ["admin", "accounts"], queryFn: () => api<{ accounts: Account[] }>(`${ADMIN}/accounts`) });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState(generate);
  const [shown, setShown] = useState<{ username: string; password: string } | null>(null);

  const add = useMutation({
    mutationFn: () => api<Account>(`${ADMIN}/accounts`, { method: "POST", json: { username, password } }),
    onSuccess: (account) => {
      setShown({ username: account.username, password });
      setUsername("");
      setPassword(generate());
      client.invalidateQueries({ queryKey: ["admin", "accounts"] });
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <Section title="Users" count={accounts.data?.accounts.length}>
      <p className="mt-3 max-w-[70ch] text-muted">Viewers log in at /login and see the streaming site. They can&apos;t change their own password; reset it here.</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          add.mutate();
        }}
        className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end"
      >
        <Field label="Username" hint="3 to 32 letters, numbers, dots, dashes or underscores." htmlFor="new-user">
          <input id="new-user" value={username} onChange={(event) => setUsername(event.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} className={input} />
        </Field>
        <Field label="Password" hint="At least 8 characters. A strong one is filled in." htmlFor="new-password">
          <input id="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className={`${input} data text-[16px]!`} />
        </Field>
        <button disabled={!username.trim() || add.isPending} className="btn btn-signal md:mb-6">
          <Plus className="size-4" /> Add user
        </button>
      </form>
      {shown && <Credentials {...shown} onDone={() => setShown(null)} />}
      {accounts.isError && <Failed error={accounts.error} retry={accounts.refetch} />}
      <table className="mt-6 w-full border-t border-ink text-left">
        <thead className="data text-muted">
          <tr className="border-b border-line">
            <th className="py-2 font-normal">User</th>
            <th className="hidden py-2 font-normal sm:table-cell">Last seen</th>
            <th className="py-2 font-normal">Active</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {(accounts.data?.accounts ?? []).map((account) => (
            <UserRow key={account.id} account={account} onPassword={setShown} />
          ))}
        </tbody>
      </table>
      {accounts.data?.accounts.length === 0 && <p className="py-6 text-muted">No viewer accounts yet.</p>}
    </Section>
  );
}

function Credentials({ username, password, onDone }: { username: string; password: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = `Username: ${username}\nPassword: ${password}`;
  return (
    <div role="status" className="mt-4 rounded-[4px] bg-signal-soft p-4">
      <p className="font-bold">Send these to {username} now. The password isn&apos;t shown again.</p>
      <p className="data mt-2 text-[0.9rem] whitespace-pre select-all">{text}</p>
      <div className="mt-3 flex gap-2">
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(text).catch(() => {});
            setCopied(true);
          }}
          className="btn btn-ink h-10 min-h-0 text-sm"
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copied" : "Copy both"}
        </button>
        <button onClick={onDone} className="btn btn-line h-10 min-h-0 text-sm">Done</button>
      </div>
    </div>
  );
}

function UserRow({ account, onPassword }: { account: Account; onPassword: (value: { username: string; password: string }) => void }) {
  const client = useQueryClient();
  const change = useMutation({
    mutationFn: (body: Record<string, unknown>) => api(`${ADMIN}/accounts/${account.id}`, { method: "PATCH", json: body }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["admin", "accounts"] }),
    onError: (error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: () => api(`${ADMIN}/accounts/${account.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast(`Deleted ${account.username}`);
      client.invalidateQueries({ queryKey: ["admin", "accounts"] });
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <tr className="border-b border-line">
      <td className="py-3 pr-3">
        <p className={`font-bold ${account.disabled ? "text-faint line-through" : ""}`}>{account.username}</p>
        <p className="data text-muted sm:hidden">{since(account.last_seen)}</p>
      </td>
      <td className="data hidden py-3 text-[0.82rem] text-muted sm:table-cell">{since(account.last_seen)}</td>
      <td className="py-3">
        <Toggle checked={!account.disabled} onChange={(on) => change.mutate({ disabled: !on }, { onSuccess: () => toast(on ? "Enabled" : "Disabled and signed out") })} label={`${account.username} can log in`} />
      </td>
      <td className="py-3">
        <div className="flex flex-wrap justify-end gap-1">
          <ConfirmButton
            onConfirm={() => {
              const password = generate();
              change.mutate({ password }, { onSuccess: () => onPassword({ username: account.username, password }) });
            }}
            confirm="Reset password?"
            className="btn btn-line h-9 min-h-0 px-2.5 text-sm"
          >
            <KeyRound className="size-4" /> <span className="hidden md:inline">Reset password</span>
          </ConfirmButton>
          <button onClick={() => change.mutate({ sign_out: true }, { onSuccess: () => toast(`Signed ${account.username} out everywhere`) })} className="btn btn-line h-9 min-h-0 px-2.5 text-sm" title="Sign out everywhere">
            <LogOut className="size-4" /> <span className="hidden md:inline">Sign out everywhere</span>
          </button>
          <ConfirmButton onConfirm={() => remove.mutate()} confirm="Delete?" className="btn btn-line h-9 min-h-0 px-2.5 text-sm text-alarm">
            <Trash2 className="size-4" />
          </ConfirmButton>
        </div>
      </td>
    </tr>
  );
}
