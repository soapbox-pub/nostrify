import type { NostrEvent, NostrRelayOK, NPolicy } from '@nostrify/types';

/** Policy options for `HellthreadPolicy`. */
interface HellthreadPolicyOpts {
  /** Total number of "p" tags a kind 1 note may have before it's rejected. Default: `100` */
  limit?: number;
}

/** Basic policy to demonstrate how policies work. Accepts all events. */
export class HellthreadPolicy implements NPolicy {
  private opts: HellthreadPolicyOpts;
  constructor(opts: HellthreadPolicyOpts = {}) {
    this.opts = opts;
  }

  // deno-lint-ignore require-await
  async call({ id, kind, tags }: NostrEvent): Promise<NostrRelayOK> {
    const { limit = 100 } = this.opts;

    if (kind === 1) {
      const p = tags.filter((tag: string[]) => tag[0] === 'p');

      if (p.length > limit) {
        return ['OK', id, false, `blocked: rejected due to ${p.length} "p" tags (${limit} is the limit).`];
      }
    }

    return ['OK', id, true, ''];
  }
}
