import { Container, getContainer } from '@cloudflare/containers';

/**
 * The Worker in front of the scanner container.
 *
 * It exists to start the container, keep it awake while a scan runs, and pass
 * requests through. It deliberately has no public route: the only caller is the
 * Readiness app, over a service binding. A scanner reachable from the open
 * internet is a button that spends money, and a bearer token is a weaker answer
 * than not being addressable at all.
 */

interface Env {
  SCANNER: DurableObjectNamespace<ScannerContainer>;
  ANTHROPIC_API_KEY?: string;
  DAILY_BUDGET_USD?: string;
  MAX_CONCURRENT_SCANS?: string;
  RESCAN_COOLDOWN_MINUTES?: string;
}

export class ScannerContainer extends Container<Env> {
  defaultPort = 8080;

  /*
   * Ten minutes of *inactivity*, which is not the same as ten minutes of life.
   * The app polls job status every two seconds for the whole scan, and each poll
   * resets the timer, so a running scan holds the instance open by itself. The
   * window only matters after the last poll stops.
   */
  sleepAfter = '10m';

  /*
   * Worker secrets do not reach the container on their own — the container is a
   * separate process with its own environment, and `this.env` is the only thing
   * that bridges them. Without this the scanner starts, serves, and silently
   * scans with no judgement layer at all: a working service producing a much
   * weaker report, which is worse than a crash because nothing looks wrong.
   */
  envVars = {
    HOST: '0.0.0.0',
    PORT: '8080',
    REPORTS_DIR: '/data/reports',
    ANTHROPIC_API_KEY: this.env.ANTHROPIC_API_KEY ?? '',
    DAILY_BUDGET_USD: this.env.DAILY_BUDGET_USD ?? '25',
    MAX_CONCURRENT_SCANS: this.env.MAX_CONCURRENT_SCANS ?? '1',
    RESCAN_COOLDOWN_MINUTES: this.env.RESCAN_COOLDOWN_MINUTES ?? '60',
  };

  override onStart(): void {
    console.log('scanner container started');
  }

  override onStop(): void {
    console.log('scanner container stopped');
  }

  override onError(error: unknown): void {
    console.error('scanner container error:', error);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    /*
     * One instance, named rather than per-request.
     *
     * Jobs live in the scanner's memory, so the request that starts a scan and
     * the requests that poll it have to reach the same container. A fixed name
     * guarantees that. It also makes the concurrency limit inside the scanner
     * mean what it says — a per-request instance would run one scan each and
     * enforce nothing.
     */
    return getContainer(env.SCANNER, 'primary').fetch(request);
  },
};
