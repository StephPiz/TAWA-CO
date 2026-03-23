"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import localFont from "next/font/local";

const headingFont = localFont({
  src: "./fonts/HFHySans_Black.ttf",
  variable: "--font-login-heading",
});

const mobileTitleFont = localFont({
  src: "./fonts/HFHySans_Bold.ttf",
  variable: "--font-login-mobile-title",
});

const bodyFont = localFont({
  src: "./fonts/HFHySans_Regular.ttf",
  variable: "--font-login-body",
});

export default function LoginPage() {
  const router = useRouter();
  const [mobileStores, setMobileStores] = useState<Array<{ storeId: string; storeName: string }>>(() => {
    if (typeof window === "undefined") return [];
    const raw = localStorage.getItem("stores");
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((s) => ({ storeId: String(s.storeId || ""), storeName: String(s.storeName || "") }))
        .filter((s) => s.storeId && s.storeName);
    } catch {
      return [];
    }
  });
  const [desktopStep, setDesktopStep] = useState<"login" | "space">("login");
  const [mobileStep, setMobileStep] = useState<"login" | "space" | "store">("login");
  const [email, setEmail] = useState("admin@demarca.local");
  const [password, setPassword] = useState("Admin123!");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showMobileSplash, setShowMobileSplash] = useState(true);
  const [mobileFormVisible, setMobileFormVisible] = useState(false);
  const girlStyle: React.CSSProperties = {
    right: "530px",
    top: "105px",
    height: "580px",
    zIndex: 2,
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.innerWidth >= 768) {
      const desktopTimer = window.setTimeout(() => setShowMobileSplash(false), 0);
      return () => window.clearTimeout(desktopTimer);
    }
    if (!showMobileSplash) {
      return;
    }
    const timer = window.setTimeout(() => {
      setShowMobileSplash(false);
    }, 4200);
    return () => window.clearTimeout(timer);
  }, [showMobileSplash]);

  useEffect(() => {
    if (showMobileSplash) return;
    if (typeof window === "undefined" || window.innerWidth >= 768) return;
    const raf = window.requestAnimationFrame(() => {
      setMobileFormVisible(true);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [showMobileSplash]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("http://localhost:3001/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Login failed");
        setLoading(false);
        return;
      }

      localStorage.setItem("accessToken", data.accessToken);
      localStorage.setItem("user", JSON.stringify(data.user));
      localStorage.setItem("stores", JSON.stringify(data.stores));
      if (Array.isArray(data.stores)) {
        setMobileStores(
          data.stores
            .map((s: { storeId?: string; storeName?: string }) => ({
              storeId: String(s.storeId || ""),
              storeName: String(s.storeName || ""),
            }))
            .filter((s: { storeId: string; storeName: string }) => s.storeId && s.storeName)
        );
      }
      if (data?.user?.preferredLocale) {
        localStorage.setItem("uiLocale", String(data.user.preferredLocale).toLowerCase());
      }

      setDesktopStep("space");
      setMobileStep("space");
      setLoading(false);
      return;
    } catch {
      setError("Connection error (is API running on :3001?)");
    }

    setLoading(false);
  }

  function PasswordIcon({ visible }: { visible: boolean }) {
    if (visible) {
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
          <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    }

    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
        <path d="M3 3l18 18" />
        <path d="M10.6 10.7a3 3 0 0 0 4.2 4.2" />
        <path d="M9.4 5.1A11.3 11.3 0 0 1 12 5c6.5 0 10 7 10 7a17.2 17.2 0 0 1-4 4.8" />
        <path d="M6.6 6.7C4.1 8.4 2.5 12 2.5 12S6 19 12 19c1.7 0 3.2-.3 4.6-.9" />
      </svg>
    );
  }

  return (
    <div
      className={`${headingFont.variable} ${mobileTitleFont.variable} ${bodyFont.variable} relative h-screen w-screen overflow-hidden`}
      style={{
        background: "linear-gradient(135deg, #2C2F95 0%, #3A42C5 45%, #4A57E6 100%)",
      }}
    >
      <section className="absolute inset-0 z-[1] hidden md:block">
        <div className="absolute left-1/2 top-1/2 h-[780px] w-[1400px] -translate-x-1/2 -translate-y-1/2">
          <div className="absolute left-[70px] top-[190px] w-[460px] text-white">
            <p
              className="mb-[8px] text-[66px] font-semibold leading-[66px]"
              style={{ fontFamily: "var(--font-login-heading)" }}
            >
              Hello
            </p>
            <h1
              className="text-[82px] font-extrabold leading-[80px] tracking-[-1px]"
              style={{ fontFamily: "var(--font-login-heading)" }}
            >
              TAWA Co!
            </h1>
          </div>

          <Image
            src="/branding/chica01.png"
            alt="TAWA illustration"
            width={920}
            height={700}
            className="pointer-events-none absolute w-auto object-contain"
            style={girlStyle}
            priority
          />

          <p
            className="absolute bottom-[26px] left-[70px] text-[18px] font-medium text-white/45"
            style={{ fontFamily: "var(--font-login-body)" }}
          >
            2026 Tawa Co. All rights reserved.
          </p>
        </div>
      </section>

      <section className="absolute inset-0 z-[5] hidden md:block">
        <div className="absolute left-1/2 top-1/2 h-[780px] w-[1400px] -translate-x-1/2 -translate-y-1/2">
          <section
            className="absolute right-[110px] top-[70px] h-[620px] w-[500px] rounded-[30px] bg-[#F3F5F9] p-[42px] text-[#0E1530]"
            style={{ boxShadow: "0px 22px 55px rgba(0,0,0,0.25)" }}
          >
            {desktopStep === "login" ? (
              <>
                <p
                  className="mb-[14px] text-[36px] font-extrabold leading-[36px]"
                  style={{ fontFamily: "var(--font-login-heading)" }}
                >
                  TAWA Co
                </p>
                <h2
                  className="mt-[10px] max-w-[230px] text-[39px] font-black leading-[58px]"
                  style={{ fontFamily: "var(--font-login-heading)" }}
                >
                  Bienvenido!
                  <br />
                </h2>

                <form onSubmit={handleLogin} className="mt-[120px] flex flex-col gap-[18px]" style={{ fontFamily: "var(--font-login-body)" }}>
                  {error ? (
                    <div className="rounded-xl bg-red-100 px-4 py-3 text-base text-red-700">
                      {error}
                    </div>
                  ) : null}

                  <input
                    id="email"
                    name="email"
                    autoComplete="email"
                    className="h-[66px] w-full rounded-full border-none bg-white px-[24px] text-[24px] text-[#1A2238] outline-none placeholder:text-[rgba(20,25,45,0.35)]"
                    style={{ boxShadow: "inset 0px 0px 0px 1px rgba(15,20,40,0.06)" }}
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />

                  <div
                    className="relative h-[66px] w-full rounded-full bg-white"
                    style={{ boxShadow: "inset 0px 0px 0px 1px rgba(15,20,40,0.06)" }}
                  >
                    <input
                      id="password"
                      name="password"
                      autoComplete="current-password"
                      className="h-[66px] w-full rounded-full border-none bg-transparent px-[24px] pr-[68px] text-[24px] text-[#1A2238] outline-none placeholder:text-[rgba(20,25,45,0.35)]"
                      type={showPassword ? "text" : "password"}
                      placeholder="Contrasena"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      className="absolute right-[16px] top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-[#626B87] transition-colors hover:bg-[#EEF1F6] hover:text-[#1A2238]"
                      aria-label={showPassword ? "Ocultar contrasena" : "Mostrar contrasena"}
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword((prev) => !prev)}
                    >
                      <PasswordIcon visible={showPassword} />
                    </button>
                  </div>

                  <button
                    className="mt-[18px] h-[74px] w-full rounded-full border-none bg-[#0B1230] text-[22px] font-medium text-white transition-colors hover:cursor-pointer hover:bg-[#121B42]"
                    style={{ boxShadow: "0px 14px 26px rgba(0,0,0,0.28)" }}
                    disabled={loading}
                    type="submit"
                  >
                    {loading ? "Loading..." : "Login"}
                  </button>
                </form>
              </>
            ) : (
              <>
                <h2
                  className="mt-[96px] -mb-[24px] translate-y-[60px] text-center text-[31px] font-black leading-[1.1]"
                  style={{ fontFamily: "var(--font-login-heading)" }}
                >
                  Elige tu espacio
                </h2>

                <div className="mt-[120px] flex flex-col gap-[18px]" style={{ fontFamily: "var(--font-login-body)" }}>
                  <button
                    className="h-[66px] w-full rounded-full border-none bg-white text-center text-[24px] text-[#666] transition-colors hover:bg-[#4449CD26] active:bg-[#4449CD26]"
                    style={{ boxShadow: "inset 0px 0px 0px 1px rgba(15,20,40,0.06)" }}
                    type="button"
                    onClick={() => router.push("/select-holding")}
                  >
                    Dashboard TAWA Co
                  </button>

                  <button
                    className="h-[66px] w-full rounded-full border-none bg-white text-center text-[24px] text-[#666] transition-colors hover:bg-[#4449CD26] active:bg-[#4449CD26]"
                    style={{ boxShadow: "inset 0px 0px 0px 1px rgba(15,20,40,0.06)" }}
                    type="button"
                    onClick={() => router.push("/select-store")}
                  >
                    Ir a Tienda
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      </section>

      {!showMobileSplash ? (
        <section className={`absolute inset-0 z-[40] overflow-hidden md:hidden ${mobileStep === "login" ? "bg-[#4449CD]" : "bg-[#DDE0E5]"}`}>
          {mobileStep === "login" ? (
            <div
              className={`absolute bottom-0 left-0 right-0 h-[78%] rounded-t-[28px] bg-[#DDE0E5] px-8 pb-8 pt-14 text-[#121633] transition-transform duration-700 ease-out ${
                mobileFormVisible ? "translate-y-0" : "translate-y-full"
              }`}
            >
              <Image
                src="/branding/cara.png"
                alt="cara"
                width={140}
                height={140}
                className="absolute right-8 top-[-96px] h-[140px] w-[140px] object-contain"
                priority
              />

              <p className="mb-[14px] text-[36px] font-extrabold leading-[36px]" style={{ fontFamily: "var(--font-login-heading)" }}>
                TAWA Co
              </p>
              <>
                <h2 className="mt-[10px] max-w-[230px] text-[39px] font-black leading-[58px]" style={{ fontFamily: "var(--font-login-heading)" }}>
                  Bienvenido!
                  <br />
                </h2>

                <form onSubmit={handleLogin} className="mt-[120px] flex flex-col gap-[18px]" style={{ fontFamily: "var(--font-login-body)" }}>
                  {error ? <div className="rounded-xl bg-red-100 px-4 py-3 text-sm text-red-700">{error}</div> : null}

                  <input
                    id="email-mobile"
                    name="email"
                    autoComplete="email"
                    className="h-[66px] w-full rounded-full border-none bg-white px-[24px] text-[24px] text-[#1A2238] outline-none placeholder:text-[rgba(20,25,45,0.35)]"
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />

                  <div className="relative h-[66px] w-full rounded-full bg-white">
                    <input
                      id="password-mobile"
                      name="password"
                      autoComplete="current-password"
                      className="h-[66px] w-full rounded-full border-none bg-transparent px-[24px] pr-[68px] text-[24px] text-[#1A2238] outline-none placeholder:text-[rgba(20,25,45,0.35)]"
                      type={showPassword ? "text" : "password"}
                      placeholder="Contrasena"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      className="absolute right-[16px] top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-[#626B87] transition-colors hover:bg-[#EEF1F6] hover:text-[#1A2238]"
                      aria-label={showPassword ? "Ocultar contrasena" : "Mostrar contrasena"}
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword((prev) => !prev)}
                    >
                      <PasswordIcon visible={showPassword} />
                    </button>
                  </div>

                  <button
                    className="mt-[18px] h-[74px] w-full rounded-full border-none bg-[#0B1230] text-[22px] font-medium text-white"
                    style={{ boxShadow: "0px 14px 26px rgba(0,0,0,0.28)" }}
                    disabled={loading}
                    type="submit"
                  >
                    {loading ? "Loading..." : "Login"}
                  </button>
                </form>
              </>
            </div>
          ) : (
            <div className="mx-auto flex h-full w-full max-w-[420px] flex-col justify-center px-7 pb-8 pt-8 text-[#121633]">
              <h2
                className="text-center text-[31px] font-black leading-[1.1]"
                style={{ fontFamily: "var(--font-login-mobile-title)" }}
              >
                {mobileStep === "space" ? "Elige tu espacio" : "Elige tu tienda"}
              </h2>

              {mobileStep === "space" ? (
                <div className="mt-8 flex flex-col gap-4" style={{ fontFamily: "var(--font-login-body)" }}>
                  <button
                    className="h-[62px] w-full rounded-full border-none bg-white text-center text-[20px] text-[#666] transition-colors hover:bg-[#4449CD26] active:bg-[#4449CD26]"
                    style={{ boxShadow: "inset 0px 0px 0px 1px rgba(15,20,40,0.06)" }}
                    type="button"
                    onClick={() => router.push("/select-holding")}
                  >
                    Dashboard TAWA Co
                  </button>

                  <button
                    className="h-[62px] w-full rounded-full border-none bg-white text-center text-[20px] text-[#666] transition-colors hover:bg-[#4449CD26] active:bg-[#4449CD26]"
                    style={{ boxShadow: "inset 0px 0px 0px 1px rgba(15,20,40,0.06)" }}
                    type="button"
                    onClick={() => setMobileStep("store")}
                  >
                    Ir a tienda
                  </button>
                </div>
              ) : (
                <div className="mt-8 flex flex-col gap-4" style={{ fontFamily: "var(--font-login-body)" }}>
                  {(mobileStores.length > 0 ? [...mobileStores].reverse() : [{ storeId: "demarca", storeName: "demarca" }]).map((store) => (
                    <button
                      key={store.storeId}
                      className="h-[62px] w-full rounded-full border-none bg-white text-center text-[20px] text-[#666] transition-colors hover:bg-[#4449CD26] active:bg-[#4449CD26]"
                      style={{ boxShadow: "inset 0px 0px 0px 1px rgba(15,20,40,0.06)" }}
                      type="button"
                      onClick={() => {
                        localStorage.setItem("selectedStoreId", store.storeId);
                        router.push("/dashboard");
                      }}
                    >
                      {store.storeName.toLowerCase()}
                    </button>
                  ))}

                  <button
                    className="h-[62px] w-full rounded-full border-2 border-dashed border-[#6142C4] bg-[#4449CC26] text-center text-[20px] text-[#6142C4] transition-all duration-200 hover:-translate-y-[1px] hover:border-[#5331bb] hover:bg-[#6142C429] hover:text-[#5331bb] hover:shadow-[0_10px_22px_rgba(97,66,196,0.22)] active:translate-y-0 active:bg-[#6142C433]"
                    type="button"
                    onClick={() => router.push("/add-store")}
                  >
                    + agregar tienda
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      ) : null}

      {showMobileSplash ? (
        <section className="fixed inset-0 z-[60] flex items-center justify-center bg-[#4449CD] md:hidden">
          <div className="flex items-center justify-center">
            <Image
              src="/branding/logo_tawa01.png"
              alt="TAWA Co"
              width={150}
              height={150}
              className="h-[150px] w-[150px] object-contain"
              priority
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
