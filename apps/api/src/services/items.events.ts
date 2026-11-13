/** 045 (plan Accountability table): decisions the items service makes about a request. */
export type ItemDecisions = {
  /**
   * D387: an old client named the pre-045 `image` type (or sent a flat photo payload); it was
   * read as `media`. Silent for 30 days → the alias is retired.
   */
  'item.type_alias': { outcome: 'accepted'; reason: 'image' };
};
