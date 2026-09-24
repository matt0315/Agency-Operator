import { DOCUMENTED_GAPS, listModels } from "@/lib/catalog";
import { formatUsdAuto } from "@/lib/format";

export default function CatalogPage() {
  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-medium">Model catalog</h1>
      <p className="max-w-3xl text-sm text-[var(--color-muted)]">
        Endpoints come from the Higgsfield docs sitemap and model pages. Rates are the representative family list from Higgsfield’s 16 September 2026 API guide. Live mode replaces them with POST /estimate before a paid submit. Empty rates are not guessed.
      </p>
      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="text-[var(--color-muted)]">
            <tr>
              <th className="p-3">Model</th>
              <th className="p-3">Roles</th>
              <th className="p-3">Rate</th>
              <th className="p-3">Failure</th>
            </tr>
          </thead>
          <tbody>
            {listModels().map((model) => (
              <tr key={model.id} className="border-t border-[var(--color-line)] align-top">
                <td className="p-3">
                  <div>{model.name}</div>
                  <div className="text-xs text-[var(--color-muted)]">{model.id}</div>
                </td>
                <td className="p-3">{model.roles.join(", ")}</td>
                <td className="p-3">{model.usdMicros == null ? "Estimate required" : `${formatUsdAuto(model.usdMicros)} / ${model.unit}`}</td>
                <td className="p-3 text-[var(--color-muted)]">{model.failureMode}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-2 text-sm text-[var(--color-muted)]">
        {DOCUMENTED_GAPS.map((gap) => <li key={gap}>{gap}</li>)}
      </ul>
    </main>
  );
}
