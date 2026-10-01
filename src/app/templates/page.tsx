import { formatUsdAuto } from "@/lib/format";
import { TEMPLATES } from "@/lib/templates";

export default function TemplatesPage() {
  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-medium">Service templates</h1>
      <p className="max-w-3xl text-sm text-[var(--color-muted)]">
        Autonomy is possible because each package already names inputs, a model recipe, a quality bar, included revisions, and the conditions that stop the agent.
      </p>
      <div className="grid gap-4 lg:grid-cols-3">
        {TEMPLATES.map((template) => (
          <article key={template.id} className="panel space-y-3 p-4 text-sm">
            <h2 className="text-lg font-medium">{template.name}</h2>
            <p className="text-[var(--color-muted)]">{template.summary}</p>
            <p>{formatUsdAuto(template.priceMicros)} · ceiling {formatUsdAuto(template.maxProductionMicros)} · target margin {template.targetGrossMarginBps / 100}% · {template.includedRevisions} revisions · {template.timeline}</p>
            <Block title="Required inputs" items={template.requiredInputs} />
            <Block title="Files" items={template.acceptedFileTypes} />
            <Block title="Model recipe" items={template.modelRecipe} />
            <Block title="Quality" items={template.qualityChecklist} />
            <Block title="Delivery" items={template.deliveryPackage} />
            <Block title="Escalate" items={template.escalation} />
          </article>
        ))}
      </div>
    </main>
  );
}

function Block({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="kicker">{title}</h3>
      <ul className="mt-1 space-y-1 text-[var(--color-muted)]">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}
