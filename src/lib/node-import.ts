// Bundlers must not follow Node-only modules into the Worker graph.
// The specifier is applied only inside a runtime import, and only off Workers.
export function importNodeModule<T>(specifier: string): Promise<T> {
  const load = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<T>;
  return load(specifier);
}

export function fileHref(absolutePath: string): string {
  const encoded = absolutePath
    .split("/")
    .map((part, index) => (index === 0 ? part : encodeURIComponent(part)))
    .join("/");
  return `file://${encoded}`;
}
