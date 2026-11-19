import { expect, test } from '../../fixtures/identity';

// Roles per packages/shared/src/authz/can.ts: editor creates/updates cards, only owner/maintainer delete,
// only owner/maintainer edit the deck, only the owner invites; every member lists members.
test('each role does exactly what it is allowed on a deck @full', async ({
  api,
  smokeDeck,
  member,
}) => {
  const editor = await member(smokeDeck, 'editor');
  const reader = await member(smokeDeck, 'reader');
  const card = { type: 'text', title: 'Role card', body: 'Written by the editor' };
  const invite = { email: `x-${smokeDeck.slug}@example.test`, role: 'reader' };

  // Reader: reads, cannot write.
  expect((await reader.api.get(`decks/${smokeDeck.id}`)).status()).toBe(200);
  expect((await reader.api.post(`decks/${smokeDeck.slug}/items`, { data: card })).status()).toBe(
    403,
  );

  // Editor: creates and updates a card; cannot delete it, change the deck or invite.
  const created = await editor.api.post(`decks/${smokeDeck.slug}/items`, { data: card });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()) as { id: string };
  expect(
    (await editor.api.patch(`items/${id}`, { data: { title: 'Edited by editor' } })).status(),
  ).toBe(200);
  expect((await editor.api.delete(`items/${id}`)).status()).toBe(403);
  expect(
    (await editor.api.patch(`decks/${smokeDeck.id}`, { data: { name: 'Nope' } })).status(),
  ).toBe(403);
  expect((await editor.api.post(`decks/${smokeDeck.id}/invites`, { data: invite })).status()).toBe(
    403,
  );

  // The reader sees the editor's card but cannot change or delete it, or invite.
  expect((await reader.api.get(`items/${id}`)).status()).toBe(200);
  expect((await reader.api.patch(`items/${id}`, { data: { title: 'Nope' } })).status()).toBe(403);
  expect((await reader.api.delete(`items/${id}`)).status()).toBe(403);
  expect((await reader.api.post(`decks/${smokeDeck.id}/invites`, { data: invite })).status()).toBe(
    403,
  );

  // Owner: lists all members, edits the deck, invites, deletes the card.
  const members = await api.get(`decks/${smokeDeck.id}/members`);
  expect(members.status()).toBe(200);
  const { data } = (await members.json()) as { data: { userId: string; role: string }[] };
  expect(data.map((m) => m.role).sort()).toEqual(['editor', 'owner', 'reader']);
  expect(data.map((m) => m.userId)).toEqual(expect.arrayContaining([editor.userId, reader.userId]));
  expect((await api.patch(`decks/${smokeDeck.id}`, { data: { name: 'Renamed' } })).status()).toBe(
    200,
  );
  expect((await api.post(`decks/${smokeDeck.id}/invites`, { data: invite })).status()).toBe(201);
  expect((await api.delete(`items/${id}`)).status()).toBe(204);

  // Members can list members too.
  expect((await reader.api.get(`decks/${smokeDeck.id}/members`)).status()).toBe(200);
});
