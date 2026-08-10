function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeAuthorIdentity(author = {}) {
  const name = clean(author.name);
  const email = clean(author.email).toLowerCase();
  const normalizedName = name.toLowerCase();
  if (email) {
    return {
      key: `email:${email}`,
      name: name || email,
      email,
      alias: name,
    };
  }
  if (normalizedName) {
    return {
      key: `name:${normalizedName}`,
      name,
      email: "",
      alias: name,
    };
  }
  return {
    key: "name:unknown",
    name: "Unknown author",
    email: "",
    alias: "",
  };
}

function addAuthorAlias(aliases, identity) {
  const result = aliases instanceof Set ? aliases : new Set(aliases ?? []);
  if (identity?.alias) result.add(identity.alias);
  return result;
}

module.exports = {
  addAuthorAlias,
  normalizeAuthorIdentity,
};
