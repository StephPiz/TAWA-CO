import fs from "node:fs/promises";
import path from "node:path";
import Link from "next/link";

async function readDoc(filename: string): Promise<string> {
  const filePath = path.join(process.cwd(), "..", "..", "docs", filename);
  return fs.readFile(filePath, "utf8");
}

export default async function ManualPage() {
  const [manual, fase1] = await Promise.all([
    readDoc("MANUAL_COMPLETO_TAWA_DEMARCA.md"),
    readDoc("FASE1_IMPLEMENTACION.md"),
  ]);

  return (
    <main className="min-h-screen bg-gray-100 p-6 md:p-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Manual TAWA / DEMARCA</h1>
          <Link href="/" className="text-sm text-blue-600 hover:underline">
            Volver al login
          </Link>
        </div>

        <div className="mb-8 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">MANUAL_COMPLETO_TAWA_DEMARCA.md</h2>
          <pre className="max-h-[45vh] overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-4 text-sm text-gray-800">
            {manual}
          </pre>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">FASE1_IMPLEMENTACION.md</h2>
          <pre className="max-h-[45vh] overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-4 text-sm text-gray-800">
            {fase1}
          </pre>
        </div>
      </div>
    </main>
  );
}
