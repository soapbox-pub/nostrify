type SearchToken = string | { key: string; value: string };

/** [NIP-50](https://github.com/nostr-protocol/nips/blob/master/50.md) search functionality. */
export class NIP50 {
  static parseInput(input: string): SearchToken[] {
    const regex = /(\B-\w+:[^\s"]+)|(\b\w+:[^\s"]+)|(".*?")|(\S+)/g;

    const tokens: SearchToken[] = [];
    let match: RegExpExecArray | null;

    while ((match = regex.exec(input)) !== null) {
      if (match[1] || match[2]) {
        const [key, ...values] = (match[1] || match[2]).split(':');
        tokens.push({ key, value: values.join(':') });
      } else if (match[3]) {
        tokens.push(match[3].replace(/"/g, ''));
      } else if (match[4]) {
        tokens.push(match[4]);
      }
    }

    return tokens;
  }
}
