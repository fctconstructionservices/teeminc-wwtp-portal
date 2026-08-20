export async function all(env, sql, ...binds) {
  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return results;
}

export async function first(env, sql, ...binds) {
  return env.DB.prepare(sql).bind(...binds).first();
}

export async function run(env, sql, ...binds) {
  return env.DB.prepare(sql).bind(...binds).run();
}

/**
 * batch - run several independent reads in ONE round trip.
 *
 * D1 is a network hop, so cost is dominated by the number of round
 * trips rather than by how much SQL each one carries. Anything that
 * would otherwise be a loop of awaits belongs here.
 *
 * Takes SQL strings (or [sql, ...binds] tuples) and returns one results
 * array per statement, in the order given.
 */
export async function batchAll(env, statements) {
  const prepared = statements.map((s) => {
    if (Array.isArray(s)) {
      const [sql, ...binds] = s;
      return binds.length ? env.DB.prepare(sql).bind(...binds) : env.DB.prepare(sql);
    }
    return env.DB.prepare(s);
  });
  const responses = await env.DB.batch(prepared);
  return responses.map((r) => r.results || []);
}
