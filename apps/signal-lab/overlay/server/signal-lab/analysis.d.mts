export type Provider = { name: string; endpoint: string; key: string; model: string };
export function createAnalyzer(provider: Provider | null): (body: unknown) => Promise<{ status: number; body: unknown }>;
