import { SCENARIOS, type ScenarioId } from './report.js';
export interface Options {
  readonly scenarios: readonly ScenarioId[];
  readonly format: 'text' | 'json';
  readonly help: boolean;
}
export function parseArgs(input: readonly string[]): Options {
  const args = [...input];
  if (args[0] === '--') args.shift();
  let scenario: ScenarioId | undefined,
    format: 'text' | 'json' = 'text';
  let seenFormat = false;
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h'))
    return { scenarios: SCENARIOS, format, help: true };
  while (args.length) {
    const flag = args.shift(),
      value = args.shift();
    if (
      flag === '--scenario' &&
      !scenario &&
      SCENARIOS.some((id) => id === value)
    )
      scenario = value as ScenarioId;
    else if (
      flag === '--format' &&
      !seenFormat &&
      (value === 'text' || value === 'json')
    ) {
      format = value;
      seenFormat = true;
    } else
      throw new Error(
        'Invalid or duplicate option: ' + String(flag) + ' ' + String(value),
      );
  }
  return { scenarios: scenario ? [scenario] : SCENARIOS, format, help: false };
}
export const HELP =
  'Usage: pnpm demo [--] [--scenario mixed|stress|ban|feedback] [--format text|json]\nRuns deterministic synthetic scenarios without API keys or audio.\n';
