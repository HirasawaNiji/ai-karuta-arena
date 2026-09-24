import { parseArgs, HELP } from './args.js';
import { runDemo } from './scenarios.js';
import { renderText } from './report.js';
export async function runCli(
  args: readonly string[],
  io: { stdout: (text: string) => void; stderr: (text: string) => void },
  runner: typeof runDemo = runDemo,
): Promise<number> {
  let options;
  try {
    options = parseArgs(args);
  } catch (error) {
    io.stderr(
      (error instanceof Error ? error.message : 'Invalid arguments') +
        '\n' +
        HELP,
    );
    return 2;
  }
  if (options.help) {
    io.stdout(HELP);
    return 0;
  }
  try {
    const report = await runner(options.scenarios);
    io.stdout(
      options.format === 'json'
        ? JSON.stringify(report) + '\n'
        : renderText(report),
    );
    return 0;
  } catch (error) {
    io.stderr(
      'Demo failed: ' +
        (error instanceof Error ? error.message : 'Unknown failure') +
        '\n',
    );
    return 1;
  }
}
