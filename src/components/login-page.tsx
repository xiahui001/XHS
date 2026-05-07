"use client";

import { KeyRound, LogIn, ShieldCheck, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { readStoredAuthSession, storeAuthSession, type AuthSessionSnapshot } from "@/lib/auth/session";

type ApiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
};

export function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [session, setSession] = useState<AuthSessionSnapshot | null>(null);
  const [status, setStatus] = useState("请输入账号信息");
  const [busyAction, setBusyAction] = useState<"sign-in" | "sign-up" | null>(null);

  useEffect(() => {
    const stored = readStoredAuthSession();
    if (stored) {
      setSession(stored);
      setStatus("登录态已恢复，正在进入工作台");
      router.replace("/");
    }
  }, [router]);

  async function signInOrSignUp(mode: "sign-in" | "sign-up") {
    if (!email || !password) {
      setStatus("请输入邮箱和密码");
      return;
    }
    if (!isValidEmail(email)) {
      setStatus("请输入合法邮箱地址");
      return;
    }
    if (password.length < 6) {
      setStatus("密码至少需要 6 位");
      return;
    }

    setBusyAction(mode);
    try {
      const response = await postJson<AuthSessionSnapshot>("/api/auth/email", {
        mode,
        email,
        password
      });

      if (!response.ok || !response.data) {
        const errorMessage = response.error?.message || "注册登录失败";
        if (/rate limit/i.test(errorMessage)) {
          setStatus("Supabase 已接通，但当前注册频率触发限流，请稍后重试");
        } else if (/invalid/i.test(errorMessage)) {
          setStatus("请输入合法邮箱地址");
        } else {
          setStatus(errorMessage);
        }
        return;
      }

      storeAuthSession(response.data);
      setSession(response.data);
      setStatus(mode === "sign-up" ? "注册完成，历史状态将在工作台恢复" : "登录完成，历史状态将在工作台恢复");
      router.push("/");
    } catch (error) {
      setStatus(error instanceof Error ? `注册登录请求失败：${error.message}` : "注册登录请求失败");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <main className="login-shell login-shell-auth">
      <section className="login-hero">
        <div className="brand-lockup">
          <div className="brand-mark">X</div>
          <div>
            <p className="eyebrow">Supabase Auth</p>
            <h1>用户注册登录</h1>
          </div>
        </div>
        <p className="login-hero-copy">
          先完成账号登录，再进入工作台。历史状态、关键词库和绑定状态会按用户 ID 持久化。
        </p>
        <div className="login-hero-grid">
          <div>
            <strong>1</strong>
            <span>注册 / 登录</span>
          </div>
          <div>
            <strong>2</strong>
            <span>进入工作台</span>
          </div>
          <div>
            <strong>3</strong>
            <span>恢复历史状态</span>
          </div>
        </div>
      </section>

      <section className="glass-panel login-card login-form-card">
        <div className={`status-pill ${session ? "ok" : "bad"}`}>
          <UserRound aria-hidden="true" size={15} />
          <span>{session ? "已登录" : "未登录"}</span>
          <small>{session?.user.email || status}</small>
        </div>

        <div className="auth-fields">
          <div>
            <label className="field-label" htmlFor="email">
              邮箱
            </label>
            <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </div>
          <div>
            <label className="field-label" htmlFor="password">
              密码
            </label>
            <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </div>
        </div>

        <div className="topbar-actions">
          <button type="button" onClick={() => signInOrSignUp("sign-in")} disabled={busyAction === "sign-in"}>
            <LogIn aria-hidden="true" size={16} />
            登录
          </button>
          <button type="button" onClick={() => signInOrSignUp("sign-up")} disabled={busyAction === "sign-up"}>
            <KeyRound aria-hidden="true" size={16} />
            注册
          </button>
        </div>

        <div className="auth-persist-strip">
          <ShieldCheck aria-hidden="true" size={17} />
          <span>登录成功后，首页会按用户 ID 恢复 Prompt、关键词库和绑定状态。</span>
        </div>

        {session ? (
          <button className="login-link" type="button" onClick={() => router.replace("/")}>
            进入工作台
          </button>
        ) : null}
      </section>
    </main>
  );
}

async function postJson<T>(url: string, body: unknown): Promise<ApiEnvelope<T>> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  return (await response.json()) as ApiEnvelope<T>;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value.trim());
}
