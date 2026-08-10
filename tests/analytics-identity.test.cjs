const test = require("node:test");
const assert = require("node:assert/strict");
const { addAuthorAlias, normalizeAuthorIdentity } = require("../electron/git/analytics/identity.cjs");

test("author identity uses normalized email while preserving display aliases", () => {
  const first = normalizeAuthorIdentity({ name: " Ada Lovelace ", email: " ADA@EXAMPLE.TEST " });
  const second = normalizeAuthorIdentity({ name: "Ada L.", email: "ada@example.test" });

  assert.equal(first.key, "email:ada@example.test");
  assert.equal(second.key, first.key);
  assert.equal(first.name, "Ada Lovelace");
  assert.equal(first.email, "ada@example.test");
  assert.deepEqual([...addAuthorAlias(addAuthorAlias(new Set(), first), second)], ["Ada Lovelace", "Ada L."]);
});

test("author identity falls back to normalized name when email is empty", () => {
  assert.deepEqual(normalizeAuthorIdentity({ name: "  Grace Hopper  ", email: "" }), {
    key: "name:grace hopper",
    name: "Grace Hopper",
    email: "",
    alias: "Grace Hopper",
  });
  assert.equal(normalizeAuthorIdentity({}).key, "name:unknown");
});
