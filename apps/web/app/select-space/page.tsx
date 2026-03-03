"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import localFont from "next/font/local";
import { requireTokenOrRedirect } from "../lib/auth";

const headingFont = localFont({
  src: "../fonts/HFHySans_Black.ttf",
  variable: "--font-space-heading",
});

const bodyFont = localFont({
  src: "../fonts/HFHySans_Regular.ttf",
  variable: "--font-space-body",
});

export default function SelectSpacePage() {
  const router = useRouter();

  useEffect(() => {
    requireTokenOrRedirect();
  }, []);

  return (
    <main className={`${headingFont.variable} ${bodyFont.variable} min-h-screen bg-[#DDE0E5]`}>
      <div className="mx-auto flex min-h-screen w-full items-center justify-center px-6">
        <section
          className="h-[620px] w-[500px] rounded-[30px] bg-[#F3F5F9] p-[42px] text-[#0E1530]"
          style={{ boxShadow: "0px 22px 55px rgba(0,0,0,0.25)" }}
        >
          <h1
            className="mb-8 text-[48px] font-black leading-[1.05] text-[#141833]"
            style={{ fontFamily: "var(--font-space-heading)" }}
          >
            Elige tu espacio
          </h1>

          <div className="mt-[40px] flex flex-col gap-[18px]">
            <div
              className="flex h-[66px] items-center rounded-full bg-white px-[24px] text-[24px] text-[#666]"
              style={{ boxShadow: "inset 0px 0px 0px 1px rgba(15,20,40,0.06)", fontFamily: "var(--font-space-body)" }}
            >
              Dashboard TAWA Co
            </div>

            <button
              className="flex h-[66px] w-full items-center rounded-full bg-white px-[24px] text-[24px] text-[#666] hover:bg-[#f6f8fb]"
              style={{ boxShadow: "inset 0px 0px 0px 1px rgba(15,20,40,0.06)", fontFamily: "var(--font-space-body)" }}
              type="button"
              onClick={() => router.push("/select-holding")}
            >
              Ir a Tienda
            </button>

            <button
              className="mt-[18px] h-[74px] w-full rounded-full border-none bg-[#0B1230] text-[22px] font-medium text-white"
              style={{ boxShadow: "0px 14px 26px rgba(0,0,0,0.28)", fontFamily: "var(--font-space-heading)" }}
              type="button"
            >
              Login
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
