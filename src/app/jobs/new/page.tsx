import { createJobAction } from "@/app/actions";
import { TEMPLATES } from "@/lib/templates";

export default function NewJobPage() {
  const deadline = new Date(Date.now() + 72 * 3_600_000).toISOString().slice(0, 16);
  return (
    <main className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-medium">New job</h1>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        Paste a brief from Upwork, Fiverr, Contra, email, a sales call, or a direct form. One paste, then watch. The studio analyzes, prices, routes, generates, repairs, and drafts delivery inside Autonomy Settings. It does not scrape a marketplace, submit a proposal, accept a contract, or deliver through one.
      </p>
      <form action={createJobAction} className="panel mt-4 space-y-3 p-4">
        <label className="block text-sm">Title<input name="title" required className="mt-1 w-full rounded border bg-transparent px-3 py-2" /></label>
        <label className="block text-sm">Client<input name="client" className="mt-1 w-full rounded border bg-transparent px-3 py-2" /></label>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm">Source
            <select name="source" className="mt-1 w-full rounded border bg-[#141210] px-3 py-2">
              {["Upwork (pasted)", "Fiverr (pasted)", "Contra (pasted)", "Email", "Sales call", "Direct form"].map((source) => <option key={source}>{source}</option>)}
            </select>
          </label>
          <label className="text-sm">Channel
            <select name="channel" className="mt-1 w-full rounded border bg-[#141210] px-3 py-2">
              <option value="marketplace">Marketplace paste — messages stay drafts</option>
              <option value="direct_email">Direct email</option>
              <option value="first_party_portal">First-party portal</option>
            </select>
          </label>
        </div>
        <label className="block text-sm">Brief<textarea name="brief" required rows={10} className="mt-1 w-full rounded border bg-transparent px-3 py-2" /></label>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm">Package price $<input name="price" defaultValue="0" className="mt-1 w-full rounded border bg-transparent px-3 py-2" /></label>
          <label className="text-sm">Deadline<input type="datetime-local" name="deadline" defaultValue={deadline} className="mt-1 w-full rounded border bg-transparent px-3 py-2" /></label>
          <label className="text-sm">Template
            <select name="template" className="mt-1 w-full rounded border bg-[#141210] px-3 py-2">
              <option value="">None</option>
              {TEMPLATES.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
            </select>
          </label>
        </div>
        <button className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[#1a1208]" type="submit">Paste and run</button>
      </form>
    </main>
  );
}
