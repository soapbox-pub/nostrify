export interface LNURLDetails {
  allowsNostr?: boolean;
  callback: string;
  maxSendable: number;
  minSendable: number;
  metadata: string;
  nostrPubkey?: string;
  tag: 'payRequest';
}
