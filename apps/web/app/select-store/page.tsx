"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import localFont from "next/font/local";
import { logout, requireTokenOrRedirect } from "../lib/auth";

type StoreRow = {
  storeId: string;
  holdingId: string;
  storeCode: string;
  storeName: string;
  status: string;
  roleKey: string;
};

const headingFont = localFont({
  src: "../fonts/HFHySans_Black.ttf",
  variable: "--font-select-store-heading",
});

const bodyFont = localFont({
  src: "../fonts/HFHySans_Regular.ttf",
  variable: "--font-select-store-body",
});

export default function SelectStorePage() {
  const router = useRouter();
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [error, setError] = useState("");
  const girlStyle: React.CSSProperties = {
    right: "530px",
    top: "105px",
    height: "580px",
    zIndex: 2,
  };

  useEffect(() => {
    const token = requireTokenOrRedirect();
    if (!token) return;

    const holdingId = localStorage.getItem("selectedHoldingId");
    if (!holdingId) {
      router.push("/select-holding");
      return;
    }

    (async () => {
      try {
        const res = await fetch(
          `http://localhost:3001/stores?holdingId=${encodeURIComponent(holdingId)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        const data = await res.json();
        if (!res.ok) return setError(data.error || "Error loading stores");

        setStores(data.stores || []);
      } catch {
        setError("Connection error (API on :3001?)");
      }
    })();
  }, [router]);

  function chooseStore(storeId: string) {
    localStorage.setItem("selectedStoreId", storeId);
    router.push("/store/dashboarddemarca");
  }

  const orderedStores = [...stores].sort((a, b) => a.storeName.localeCompare(b.storeName, "es"));

  return (
    <div
      className={`${headingFont.variable} ${bodyFont.variable} relative min-h-screen w-screen overflow-hidden`}
      style={{ background: "linear-gradient(135deg, #2C2F95 0%, #3A42C5 45%, #4A57E6 100%)" }}
    >
      <section className="absolute inset-0 z-[1]">
        <div className="absolute left-1/2 top-1/2 h-[780px] w-[1400px] -translate-x-1/2 -translate-y-1/2">
          <div className="absolute left-[70px] top-[190px] w-[460px] text-white">
            <p className="mb-[8px] text-[66px] font-semibold leading-[66px]" style={{ fontFamily: "var(--font-select-store-heading)" }}>
              Hello
            </p>
            <h1 className="text-[82px] font-extrabold leading-[80px] tracking-[-1px]" style={{ fontFamily: "var(--font-select-store-heading)" }}>
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

          <p className="absolute bottom-[26px] left-[70px] text-[18px] font-medium text-white/45" style={{ fontFamily: "var(--font-select-store-body)" }}>
            2026 Tawa Co. All rights reserved.
          </p>
        </div>
      </section>

      <section className="absolute inset-0 z-[5]">
        <div className="absolute left-1/2 top-1/2 h-[780px] w-[1400px] -translate-x-1/2 -translate-y-1/2">
          <section
            className="absolute right-[110px] top-[70px] h-[620px] w-[500px] rounded-[30px] bg-[#F3F5F9] p-[42px] text-[#0E1530]"
            style={{ boxShadow: "0px 22px 55px rgba(0,0,0,0.25)" }}
          >
            <button className="absolute right-[42px] top-[22px] text-[20px] text-[#666] hover:text-[#0E1530]" onClick={logout}>
              Logout
            </button>

            <h2
              className="mt-[96px] -mb-[24px] translate-y-[60px] text-center text-[31px] font-black leading-[1.1]"
              style={{ fontFamily: "var(--font-select-store-heading)" }}
            >
              Elige tu tienda
            </h2>

            {error ? (
              <div className="mt-4 rounded-xl bg-red-100 px-4 py-3 text-base text-red-700">
                {error}
              </div>
            ) : null}

            <div className="mt-[120px] flex max-h-[360px] flex-col gap-[18px] overflow-y-auto pr-1" style={{ fontFamily: "var(--font-select-store-body)" }}>
              {orderedStores.length > 0 ? (
                orderedStores.map((store) => (
                  <button
                    key={store.storeId}
                    className="h-[66px] w-full rounded-full border-none bg-white text-center text-[24px] text-[#666] transition-colors hover:bg-[#4449CD26] active:bg-[#4449CD26]"
                    style={{ boxShadow: "inset 0px 0px 0px 1px rgba(15,20,40,0.06)" }}
                    type="button"
                    onClick={() => chooseStore(store.storeId)}
                  >
                    {store.storeName.toLowerCase()}
                  </button>
                ))
              ) : (
                <div className="rounded-xl bg-white px-4 py-3 text-center text-[16px] text-[#666]">
                  No hay tiendas disponibles
                </div>
              )}

              <button
                className="h-[66px] w-full rounded-full border-2 border-dashed border-[#6142C4] bg-[#4449CC26] text-center text-[24px] text-[#6142C4] transition-all duration-200 hover:-translate-y-[1px] hover:border-[#5331bb] hover:bg-[#6142C429] hover:text-[#5331bb] hover:shadow-[0_10px_22px_rgba(97,66,196,0.22)] active:translate-y-0 active:bg-[#6142C433]"
                type="button"
                onClick={() => router.push("/add-store")}
              >
                + Agregar tienda
              </button>
            </div>

            <button
              className="absolute bottom-[26px] left-[42px] text-[20px] text-[#666] hover:text-[#0E1530]"
              style={{ fontFamily: "var(--font-select-store-body)" }}
              type="button"
              onClick={() => router.push("/select-holding")}
            >
              ← Volver a holdings
            </button>
          </section>
        </div>
      </section>
    </div>
  );
}
