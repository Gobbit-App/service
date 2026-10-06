import { test, expect } from '../../fixtures/api';

/** The one standing invitee user on the deployed DB; its membership is removed on teardown. */
const SMOKE_INVITEE = 'smoke-invitee@example.test';

test('a new deck lists only its implicit owner @smoke', async ({ api, smokeDeck }) => {
  const res = await api.get(`decks/${smokeDeck.slug}/members`);
  expect(res.status()).toBe(200);
  const { data } = await res.json();
  expect(data).toHaveLength(1);
  expect(data[0]).toMatchObject({ role: 'owner', implicit: true });
});

test('inviting a reader creates a pending membership @smoke', async ({ api, smokeDeck }) => {
  const res = await api.post(`decks/${smokeDeck.slug}/invites`, {
    data: { email: SMOKE_INVITEE, role: 'reader' },
  });
  expect(res.status()).toBe(201);
  const { membership } = await res.json();
  expect(membership).toMatchObject({ email: SMOKE_INVITEE, role: 'reader', acceptedAt: null });
});

test('an anonymous request for a deck is 401 @smoke', async ({ anon, smokeDeck }) => {
  expect((await anon.get(`decks/${smokeDeck.slug}`)).status()).toBe(401);
});
