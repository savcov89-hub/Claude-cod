import highsLoader from "highs";
import type { LpSolution, SolveFn, SolveOpts } from "./solver";

let cached: Promise<SolveFn> | null = null;

/** Загружает HiGHS (WebAssembly). В браузере wasm лежит в public/highs.wasm. */
export function getSolver(locate?: (file: string) => string): Promise<SolveFn> {
  if (!cached) {
    cached = highsLoader(locate ? { locateFile: locate } : undefined).then((highs) => {
      const fn: SolveFn = (lp: string, opts: SolveOpts = {}) => {
        const r = highs.solve(lp, { output_flag: false, mip_rel_gap: opts.gap ?? 0.02, time_limit: opts.timeLimit ?? 12 } as any) as any;
        const columns: Record<string, number> = {};
        const reduced: Record<string, number> = {};
        if (r.Columns) for (const [k, c] of Object.entries<any>(r.Columns)) { columns[k] = c.Primal; if (typeof c.Dual === "number") reduced[k] = c.Dual; }
        return { status: r.Status, objective: r.ObjectiveValue ?? 0, columns, reduced } satisfies LpSolution;
      };
      return fn;
    });
  }
  return cached;
}
