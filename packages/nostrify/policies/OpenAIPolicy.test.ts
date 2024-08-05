import { assertEquals } from '@std/assert';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';

import { OpenAIPolicy } from './OpenAIPolicy.ts';

const timeout = 50;

Deno.test('rejects flagged events', async () => {
  const event = finalizeEvent(
    { kind: 1, content: 'I want to kill them.', tags: [], created_at: 0 },
    generateSecretKey(),
  );

  const fetch = () =>
    Promise.resolve(
      new Response(
        '{"id":"modr-6zvK0JiWLBpJvA5IrJufw8BHPpEpB","model":"text-moderation-004","results":[{"flagged":true,"categories":{"sexual":false,"hate":false,"violence":true,"self-harm":false,"sexual/minors":false,"hate/threatening":false,"violence/graphic":false},"category_scores":{"sexual":9.759669410414062e-07,"hate":0.180674210190773,"violence":0.8864424824714661,"self-harm":1.8088556208439854e-09,"sexual/minors":1.3363569806301712e-08,"hate/threatening":0.003288434585556388,"violence/graphic":3.2010063932830235e-08}}]}',
      ),
    );

  assertEquals((await new OpenAIPolicy({ apiKey: '', fetch, timeout }).call(event))[2], false);

  await new Promise((resolve) => setTimeout(resolve, timeout));
});

Deno.test('accepts unflagged events', async () => {
  const event = finalizeEvent(
    { kind: 1, content: 'I want to love them.', tags: [], created_at: 0 },
    generateSecretKey(),
  );

  const fetch = () =>
    Promise.resolve(
      new Response(
        '{"id":"modr-6zvS6HoiwBqOQ9VYSggGAAI9vSgWD","model":"text-moderation-004","results":[{"flagged":false,"categories":{"sexual":false,"hate":false,"violence":false,"self-harm":false,"sexual/minors":false,"hate/threatening":false,"violence/graphic":false},"category_scores":{"sexual":1.94798508346139e-06,"hate":2.756592039077077e-07,"violence":1.4010063864589029e-07,"self-harm":3.1806530742528594e-09,"sexual/minors":1.8928545841845335e-08,"hate/threatening":3.1036221769670247e-12,"violence/graphic":1.5348690096672613e-09}}]}',
      ),
    );

  assertEquals((await new OpenAIPolicy({ apiKey: '', fetch, timeout }).call(event))[2], false);

  await new Promise((resolve) => setTimeout(resolve, timeout));
});
